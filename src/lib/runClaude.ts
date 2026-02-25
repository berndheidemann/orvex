
const DEBUG_LOG = `${Deno.cwd()}/.orvex-debug.log`;

/** Extract a human-readable message from a Claude CLI error result string.
 *  The raw value often looks like: "Some prefix. API Error: 4xx {"type":"error","error":{"type":"...","message":"..."}}".
 *  We prefer the inner error.message; fall back to stripping the JSON blob. */
function extractApiErrorMessage(raw: string): string {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (typeof obj.error?.message === "string") return obj.error.message;
    } catch { /* not valid JSON */ }
  }
  // Strip trailing "API Error: 4xx {…}" so only the human part remains
  return raw.replace(/\s*\.?\s*API Error:\s*\d+\s*\{[\s\S]*\}$/, "").trim() || raw;
}

async function debugLog(msg: string): Promise<void> {
  const ts = new Date().toISOString().slice(11, 23);
  await Deno.writeTextFile(DEBUG_LOG, `[${ts}] ${msg}\n`, { append: true }).catch(() => {});
}

export async function runClaude(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
  model: string,
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

  // Kill subprocess when caller aborts (e.g. user presses q, or timeout fires)
  const killProc = () => { try { proc.kill("SIGTERM"); } catch { /* ignore */ } };
  signal.addEventListener("abort", killProc, { once: true });

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
  let resultFallback = "";   // from {"type":"result","result":"..."} event
  let resultIsError = false; // true when is_error:true on the result event

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
            const content: Array<{ type: string; text?: string; name?: string }> =
              obj.message?.content ?? obj.content ?? [];
            for (const item of content) {
              if (item.type === "text" && typeof item.text === "string") {
                await debugLog(`TEXT len=${item.text.length} preview=${item.text.slice(0, 60).replace(/\n/g, "↵")}`);
                fullText += item.text;
                onChunk(item.text);
              } else if (item.type === "tool_use" && typeof item.name === "string") {
                await debugLog(`TOOL_USE name=${item.name}`);
                onChunk(`[→ ${item.name}…]\n`);
              }
            }
          } else if (obj.type === "result" && typeof obj.result === "string") {
            await debugLog(`RESULT len=${obj.result.length} isError=${obj.is_error}`);
            resultFallback = obj.result;
            resultIsError = obj.is_error === true;
          }
        } catch { /* non-JSON line, ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Race drainStderr against a timeout — if the subprocess holds stderr
  // open (e.g. zombie child, stuck pipe), we don't want to hang forever.
  const DRAIN_TIMEOUT_MS = 10_000;
  await Promise.race([
    drainStderr,
    new Promise<void>((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS)),
  ]);

  // Fallback: use result event text if no assistant content was captured
  if (!fullText.trim() && resultFallback.trim()) {
    fullText = resultFallback;
    onChunk(resultFallback);
  }

  const status = await proc.status;
  await debugLog(`DONE exitCode=${status.code} fullTextLen=${fullText.length}`);

  // Treat is_error:true as a hard failure — the result text is an error message,
  // not content. Without this check "Request timed out" would be returned as if
  // it were valid output and silently written to output files.
  if (resultIsError) {
    throw new Error(extractApiErrorMessage(fullText || resultFallback));
  }
  if (!status.success && fullText.trim() === "") {
    throw new Error(`claude exited with code ${status.code}`);
  }
  return fullText;
}
