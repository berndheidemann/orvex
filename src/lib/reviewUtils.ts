import type { ReviewItem } from "../types.ts";

export function parseReqs(prdContent: string): ReviewItem[] {
  const parts = prdContent.split(/(?=^### REQ-\d+)/m);
  return parts
    .filter((p) => /^### REQ-\d+/.test(p.trimStart()))
    .map((p) => {
      const trimmed = p.trimEnd();
      const firstLine = trimmed.split("\n")[0] ?? "";
      const match = firstLine.match(/^### (REQ-\d+)\s*[-:—–]?\s*(.*)/);
      return {
        id: match?.[1] ?? "REQ-???",
        title: match?.[2]?.trim() ?? "",
        content: trimmed,
      };
    });
}

export function parseAdrs(archContent: string): ReviewItem[] {
  const parts = archContent.split(/(?=^## ADR-\d+)/m);
  return parts
    .filter((p) => /^## ADR-\d+/.test(p.trimStart()))
    .map((p) => {
      const trimmed = p.trimEnd();
      const firstLine = trimmed.split("\n")[0] ?? "";
      const match = firstLine.match(/^## (ADR-\d+)\s*[-:—–]?\s*(.*)/);
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

export function parseAdrConstraints(adrContent: string): string[] {
  const match = adrContent.match(/^\*\*Restricts:\*\*\s*(.+)$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^REQ-\d+/.test(s));
}

export function buildRewritePrompt(
  item: ReviewItem,
  userPrompt: string,
  type: "req" | "adr",
): string {
  const typeLabel = type === "req"
    ? "Requirement"
    : "Architecture Decision (ADR)";
  return `Rewrite the following ${typeLabel} according to the user's instruction.

Instruction: ${userPrompt}

Current content:
${item.content}

Output ONLY the revised Markdown section — no explanations, no introduction, no other text. Preserve the structure and adjust the content according to the instruction.`;
}
