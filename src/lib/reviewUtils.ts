import type { ReviewItem } from "../types.ts";

export function parseReqs(prdContent: string): ReviewItem[] {
  const parts = prdContent.split(/(?=^### REQ-\d+:)/m);
  return parts
    .filter((p) => /^### REQ-\d+:/.test(p.trimStart()))
    .map((p) => {
      const trimmed = p.trimEnd();
      const firstLine = trimmed.split("\n")[0] ?? "";
      const match = firstLine.match(/^### (REQ-\d+):\s*(.*)/);
      return {
        id: match?.[1] ?? "REQ-???",
        title: match?.[2]?.trim() ?? "",
        content: trimmed,
      };
    });
}

export function parseAdrs(archContent: string): ReviewItem[] {
  const parts = archContent.split(/(?=^## ADR-\d+:)/m);
  return parts
    .filter((p) => /^## ADR-\d+:/.test(p.trimStart()))
    .map((p) => {
      const trimmed = p.trimEnd();
      const firstLine = trimmed.split("\n")[0] ?? "";
      const match = firstLine.match(/^## (ADR-\d+):\s*(.*)/);
      return {
        id: match?.[1] ?? "ADR-???",
        title: match?.[2]?.trim() ?? "",
        content: trimmed,
      };
    });
}

export function replaceItemInContent(
  fileContent: string,
  oldContent: string,
  newContent: string,
): string {
  return fileContent.replace(oldContent, newContent);
}

export function buildRewritePrompt(
  item: ReviewItem,
  userPrompt: string,
  type: "req" | "adr",
): string {
  const typeLabel = type === "req"
    ? "Requirement"
    : "Architekturentscheidung (ADR)";
  return `Überarbeite folgendes ${typeLabel} gemäß der Anweisung des Users.

Anweisung: ${userPrompt}

Aktueller Inhalt:
${item.content}

Gib NUR den überarbeiteten Markdown-Abschnitt aus — keine Erklärungen, keine Einleitung, kein sonstiger Text. Behalte die Struktur bei und passe den Inhalt entsprechend der Anweisung an.`;
}
