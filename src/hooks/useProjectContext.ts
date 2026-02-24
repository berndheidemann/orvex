import React from "react";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SUMMARY_TIMEOUT_MS = 20_000;

async function fetchSummary(prompt: string): Promise<string> {
  const env: Record<string, string> = { ...Deno.env.toObject() };
  delete env["CLAUDECODE"];

  const proc = new Deno.Command("claude", {
    args: [
      "-p", "--dangerously-skip-permissions",
      "--output-format=text",
      "--model", HAIKU_MODEL,
      "--max-turns", "1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
    clearEnv: true,
    env,
  }).spawn();

  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();

  const readAll = async (): Promise<string> => {
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return text;
  };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), SUMMARY_TIMEOUT_MS)
  );

  let fullText = "";
  try {
    fullText = await Promise.race([readAll(), timeout]);
  } catch {
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  return fullText.trim();
}

const { useState, useEffect } = React;

const EXCLUDED = new Set([
  "learning-context.md", "LERNSITUATION.md", "lernpfad.md",
  "PRD.md", "architecture.md", "AGENT.md", "VALIDATOR.md",
  "REFACTOR.md", "REFACTOR_TEMPLATE.md",
]);

export interface ProjectContext {
  files: string[];        // names of found files
  summary: string | null; // Haiku summary (null = still loading or no files)
  loading: boolean;
}

export function useProjectContext(): ProjectContext {
  const [files, setFiles] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ── Scan directory ────────────────────────────────────────
      const found: string[] = [];
      try {
        for await (const entry of Deno.readDir(".")) {
          if (!entry.isFile) continue;
          if (EXCLUDED.has(entry.name)) continue;
          const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
          if (ext !== "md" && ext !== "txt") continue;
          found.push(entry.name);
        }
      } catch { /* empty dir or no permissions */ }

      if (cancelled) return;
      setFiles(found);

      if (found.length === 0) {
        setLoading(false);
        return;
      }

      // ── Read content ──────────────────────────────────────────
      const parts: string[] = [];
      for (const name of found) {
        const content = await Deno.readTextFile(name).catch(() => "");
        if (content.trim()) parts.push(`## ${name}\n${content.trim()}`);
      }
      if (cancelled) return;

      // ── Haiku summary ─────────────────────────────────────────
      const prompt = [
        "Fasse in max. 2–3 kurzen Sätzen auf Deutsch zusammen, worum es in diesen Projektdateien geht.",
        "Nenne Fach, Thema und Ziel wenn erkennbar. Kein Markdown, nur Fließtext.",
        "",
        ...parts,
      ].join("\n");

      try {
        const text = await fetchSummary(prompt);
        if (!cancelled && text) setSummary(text);
      } catch { /* silent fallback — files still usable without summary */ }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  return { files, summary, loading };
}
