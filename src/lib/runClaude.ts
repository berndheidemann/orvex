export const AGENT_TIMEOUT_MS = 5 * 60 * 1000;   // 5 min per discussion agent
export const SYNTH_TIMEOUT_MS = 12 * 60 * 1000;  // 12 min for synthesis (full document)

export async function runClaude(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
  model: string,
  timeoutMs: number = AGENT_TIMEOUT_MS,
): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--dangerously-skip-permissions",
      "--output-format", "text",
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
  let fullText = "";

  const timeoutId = setTimeout(() => {
    try { proc.kill(); } catch { /* ignore */ }
  }, timeoutMs);

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      onChunk(chunk);
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
