import type { AgentStatus, RoundStatus, RoundState } from "../types.ts";
import type { Agent } from "./phaseRunner.ts";

// ── Debate format constants ─────────────────────────────────────

export const K_HEADER = `OUTPUT FORMAT: Your response must begin with:
<k>
• Keyword: Core statement (max. 8 words)
• Keyword: Core statement (max. 8 words)
• Keyword: Core statement (max. 8 words)
</k>
Your analysis follows after. No text before the <k> block.

---
`;

// ── Shared round builder ────────────────────────────────────────

export function makeRounds(agents: Agent[], numRounds: number): RoundState[] {
  return [
    ...Array.from({ length: numRounds }, (_, i) => ({
      label: `Round ${i + 1}`,
      status: "pending" as RoundStatus,
      agents: agents.map((a) => ({ name: a.name, status: "pending" as AgentStatus })),
    })),
    {
      label: "Synthesis",
      status: "pending" as RoundStatus,
      agents: [{ name: "Writer", status: "pending" as AgentStatus }],
    },
  ];
}

// ── Shared prompt helper ────────────────────────────────────────

export function formatOthersOutput(
  allOutputs: string[][],
  roundIdx: number,
  ownAgentIdx: number,
  agents: Agent[],
): string {
  return agents
    .map((a, i) => {
      const out = allOutputs[roundIdx]?.[i];
      if (!out) return null;
      return i === ownAgentIdx
        ? `--- Your own position (Round ${roundIdx + 1}) ---\n${out}`
        : `--- ${a.name} (Round ${roundIdx + 1}) ---\n${out}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
