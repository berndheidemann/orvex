export const AGENT_TIMEOUT_MS = 10 * 60 * 1000;  // 10 min per discussion agent
export const SYNTH_TIMEOUT_MS = 12 * 60 * 1000;  // 12 min for synthesis (full document)

const DEBUG_LOG = `${Deno.cwd()}/.kinema-debug.log`;

async function debugLog(msg: string): Promise<void> {
  const ts = new Date().toISOString().slice(11, 23);
  await Deno.writeTextFile(DEBUG_LOG, `[${ts}] ${msg}\n`, { append: true }).catch(() => {});
}

export async function runClaude(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
  model: string,
  timeoutMs: number = AGENT_TIMEOUT_MS,
  maxTurns: number = 10,
): Promise<string> {
  // Unset CLAUDECODE so claude doesn't refuse nested sessions
  const env: Record<string, string> = { ...Deno.env.toObject() };
  delete env["CLAUDECODE"];

  const cmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--dangerously-skip-permissions",
      "--verbose",
      "--output-format=stream-json",
      "--model", model,
      "--max-turns", String(maxTurns),
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    clearEnv: true,
    env,
  });

  const proc = cmd.spawn();
  const decoder = new TextDecoder();

  await debugLog(`START model=${model}`);

  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  // Drain stderr in background
  const drainStderr = (async () => {
    const errReader = proc.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await errReader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.trim()) {
            await debugLog(`STDERR: ${line}`);
            onChunk(`[err] ${line}\n`);
          }
        }
      }
    } finally {
      errReader.releaseLock();
    }
  })();

  const reader = proc.stdout.getReader();
  let jsonBuf = "";
  let fullText = "";
  let resultFallback = "";  // from {"type":"result","result":"..."} event

  const timeoutId = setTimeout(() => {
    try { proc.kill(); } catch { /* ignore */ }
  }, timeoutMs);

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      jsonBuf += decoder.decode(value, { stream: true });

      const lines = jsonBuf.split("\n");
      jsonBuf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          await debugLog(`EVENT type=${obj.type} subtype=${obj.subtype ?? "-"}`);
          if (obj.type === "assistant") {
            // Support both {message:{content:[...]}} and {content:[...]} shapes
            const content: Array<{ type: string; text?: string }> =
              obj.message?.content ?? obj.content ?? [];
            for (const item of content) {
              if (item.type === "text" && typeof item.text === "string") {
                await debugLog(`TEXT len=${item.text.length} preview=${item.text.slice(0, 60).replace(/\n/g, "↵")}`);
                fullText += item.text;
                onChunk(item.text);
              }
            }
          } else if (obj.type === "result" && typeof obj.result === "string") {
            await debugLog(`RESULT len=${obj.result.length} isError=${obj.is_error}`);
            resultFallback = obj.result;
          }
        } catch { /* non-JSON line, ignore */ }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }

  await drainStderr;

  // Fallback: use result event text if no assistant content was captured
  if (!fullText.trim() && resultFallback.trim()) {
    fullText = resultFallback;
    onChunk(resultFallback);
  }

  const status = await proc.status;
  await debugLog(`DONE exitCode=${status.code} fullTextLen=${fullText.length}`);
  if (!status.success && fullText.trim() === "") {
    throw new Error(`claude exited with code ${status.code}`);
  }
  return fullText;
}
