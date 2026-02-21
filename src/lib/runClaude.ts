export const AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per agent

export async function runClaude(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
  model: string,
): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--dangerously-skip-permissions",
      "--verbose",
      "--output-format=stream-json",
      "--model", model,
      "--max-turns", "1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const proc = cmd.spawn();
  const decoder = new TextDecoder();

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
          if (line.trim()) onChunk(`[err] ${line}\n`);
        }
      }
    } finally {
      errReader.releaseLock();
    }
  })();

  const reader = proc.stdout.getReader();
  let jsonBuf = "";
  let fullText = "";

  const timeoutId = setTimeout(() => {
    try { proc.kill(); } catch { /* ignore */ }
  }, AGENT_TIMEOUT_MS);

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
          if (obj.type === "assistant") {
            const content: Array<{ type: string; text?: string }> =
              obj.message?.content ?? [];
            for (const item of content) {
              if (item.type === "text" && typeof item.text === "string") {
                fullText += item.text;
                onChunk(item.text);
              }
            }
          }
        } catch { /* non-JSON line, ignore */ }
      }
    }
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }

  await drainStderr;
  const status = await proc.status;
  if (!status.success && fullText.trim() === "") {
    throw new Error(`claude exited with code ${status.code}`);
  }
  return fullText;
}
