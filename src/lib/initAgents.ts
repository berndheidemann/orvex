import type {
  PhaseState,
} from "../types.ts";
export type { Agent } from "./phaseRunner.ts";
import type { Agent } from "./phaseRunner.ts";
import { K_HEADER, makeRounds, formatOthersOutput } from "./debateUtils.ts";
import { runClaude } from "./runClaude.ts";

// ── Constants ──────────────────────────────────────────────────

export const DEFAULT_MODEL = "claude-opus-4-6";
export const SYNTH_MODEL = "claude-sonnet-4-6";  // Synthesis: always Sonnet (fast + good)

export const PRD_OUTPUT_PATH = "PRD.md";
export const ARCH_OUTPUT_PATH = "architecture.md";

const SUMMARY_DIVIDER = "─".repeat(26);

// ── Agent definitions ──────────────────────────────────────────

export const PRD_AGENTS: Agent[] = [
  {
    name: "Product Manager",
    persona: "You are a Product Manager. Your focus: user needs, user journeys, prioritization, MVP scope, measurable value. You think in problems and goals — not solutions.",
  },
  {
    name: "UX Researcher",
    persona: "You are a UX Researcher. Your focus: real user behavior, pain points, error scenarios, accessibility, mental models. You always ask: what does the user actually do — and what don't they do?",
  },
  {
    name: "Business Analyst",
    persona: "You are a Business Analyst. Your focus: completeness of requirements, edge cases, contradictions between requirements, clear acceptance criteria, explicit out-of-scope definitions. You surface what is missing or unclear.",
  },
];

export const ARCH_AGENTS: Agent[] = [
  {
    name: "Software Architect",
    persona: "You are a Software Architect. Your focus: architecture patterns, ADRs, system and data models, tech stack decisions, long-term maintainability and extensibility.",
  },
  {
    name: "Senior Developer",
    persona: "You are a Senior Developer. Your focus: tooling, testing strategy, build system, DX, implementability. You spot where architecture plans fail against reality.",
  },
  {
    name: "DevOps Engineer",
    persona: "You are a DevOps & Security Engineer. Your focus: deployment, infrastructure, scalability, monitoring, security. You reason backwards from operations to architecture.",
  },
];

// ── Phase structure factory ────────────────────────────────────

export function makePhases(prdRounds: number, archRounds: number): PhaseState[] {
  return [
    {
      id: "prd",
      label: "PRD Generation",
      outputPath: PRD_OUTPUT_PATH,
      status: "running",
      rounds: makeRounds(PRD_AGENTS, prdRounds),
      startedAt: null,
    },
    {
      id: "arch",
      label: "Architecture Design",
      outputPath: ARCH_OUTPUT_PATH,
      status: "pending",
      rounds: makeRounds(ARCH_AGENTS, archRounds),
      startedAt: null,
    },
  ];
}

// ── Prompt builders ────────────────────────────────────────────

export function buildPrdPrompt(
  roundIdx: number,
  agentIdx: number,
  description: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const agent = PRD_AGENTS[agentIdx];
  const isSynthesis = roundIdx === numRounds;

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = PRD_AGENTS.map((a, i) =>
      `--- ${a.name} (final position) ---\n${lastRound[i] ?? "(no output)"}`
    ).join("\n\n");

    return `TASK: Synthesize the following discussion contributions into a complete PRD document.

OUTPUT RULES (mandatory):
- Your response starts with the character '#'. No text before it.
- Do NOT write files. Do NOT execute commands. Do NOT use tools.
- No introduction, no confirmation, no <k> block.
- Your text response IS the document — complete and direct.

Project description: ${description}

Final positions from the PRD discussion:

${all}

Follow the document structure below exactly. Start directly with "# PRD —".

# PRD — [project name derived from description]

> [one-sentence description]

---

## User Journeys

Describe 2–4 core user flows as numbered steps. Focus on the happy path + most important error case.

### UJ-001: [Journey name]
**Goal:** [What does the user want to achieve?]

1. [Step]
2. [Step]
3. [Step]

**Error case:** [What happens when things go wrong?]

---

## Requirements

Each requirement MUST start with the Markdown heading "### REQ-NNN:".
Prioritize P0 and P1. Only include P2 when clearly differentiating.

### REQ-001: [Title]

- **Status:** open
- **Priority:** P0|P1|P2
- **Size:** XS|S|M|L
- **Depends on:** ---

#### Description
[2–4 sentences]

#### Acceptance Criteria
- [ ] ...

#### Verification
\`[command]\` → \`[output]\`

#### Content Verification (only for content REQs — omit if not applicable)
**Content type:** text|visual|interactive
**Re-generation:** \`[command or step to regenerate the content — e.g. seeder, API call, CLI command]\`
**Correctness criterion:** [How to tell that the generated content is factually correct?]

---

If requirements contradict each other (e.g. REQ-A mandates "no backend", REQ-B
references \`/api/...\` endpoints in the Verification section): add directly below the
Verification section of the affected REQ:

> ⚠️ **Possible conflict with REQ-XXX:** [One sentence describing the conflict.]

Do not resolve it — just make it visible. Resolution is the architecture phase's job.

Markdown only. Status always 'open'.`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Project description: ${description}

First run \`ls\` in the project directory. Read all \`.txt\` and \`.md\` files that look like a project description (short, descriptive names — not \`PRD.md\`, \`architecture.md\`, \`AGENT.md\` etc.). If the "project description" above is empty, these files are the only source. Do not report on missing files.

Analyze the project from your perspective and propose requirements.
Use this format for each REQ:

### REQ-NNN: [Title]
- Priority: P0|P1|P2
- Size: S|M
- Depends on: ---
#### Description
...
#### Acceptance Criteria
- [ ] ...

Be concrete and speak from your professional perspective. No generic lists — what do you see that others might miss?`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, PRD_AGENTS);

  return `${K_HEADER}${agent.persona}

Project description: ${description}

Round ${roundIdx + 1} of the discussion. Here are the positions from round ${roundIdx}:

${context}

Respond to the other perspectives:
1. What did you miss in your own round-${roundIdx} position?
2. What is missing from the others?
3. Where are there conflicts between perspectives — how do you resolve them?
4. Give your refined, final position for this round (complete REQ list).`;
}

export function buildArchPrompt(
  roundIdx: number,
  agentIdx: number,
  prdContent: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const agent = ARCH_AGENTS[agentIdx];
  const isSynthesis = roundIdx === numRounds;
  const today = new Date().toISOString().slice(0, 10);

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = ARCH_AGENTS.map((a, i) =>
      `--- ${a.name} (final position) ---\n${lastRound[i] ?? "(no output)"}`
    ).join("\n\n");

    return `TASK: Synthesize the following discussion contributions into a complete architecture document.

OUTPUT RULES (mandatory):
- Your response starts with the character '#'. No text before it.
- Do NOT write files. Do NOT execute commands. Do NOT use tools.
- No introduction, no confirmation, no <k> block.
- Your text response IS the document — complete and direct.

Project PRD:
${prdContent}

Final positions from the architecture discussion:

${all}

Start directly with "# Architecture Decisions". Each decision MUST start with the Markdown heading "## ADR-NNN:".

IMPORTANT — Type classification for each ADR:
- Type A (pure implementation decision — only the HOW changes): no **Restricts:** field
- Type B (constrains a PRD requirement in scope — the WHAT changes):
  Add **Restricts:** REQ-XXX, REQ-YYY as the last field.
  Type-A example: "SM-2 self-implemented instead of library" changes no requirement.
  Type-B example: An ADR "no runtime backend" affects not just the most obvious
  requirement — it affects EVERY REQ whose Verification section references an API endpoint,
  EVERY REQ that mentions sync or cross-device, and every REQ that implies server-side logic.

Mandatory scan for Type-B ADRs: Go through the PRD requirements systematically.
For every ADR that touches the WHAT of a requirement: list ALL affected REQs in the
Restricts: field — not just the first or most obvious one.

# Architecture Decisions

> [one-sentence summary of the approach]

## Overview
[3–5 sentences: stack, pattern, rationale]

## Project Structure
\`\`\`
[directory tree of the main folders/files]
\`\`\`

---

## ADR-001: [Title] (${today})

**Context:** ...
**Decision:** ...
**Rationale:** ...
**Consequences:** ...
**Restricts:** REQ-XXX  ← only for Type B, otherwise omit this line

---

[further ADRs for language, framework, DB, testing, build, deployment]`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Project PRD:
${prdContent}

Analyze the requirements from your perspective and propose an architecture.
If relevant code or architecture.md already exists in the project folder, you may read it — but do not report on missing files.
Be concrete (real technologies, real version numbers where relevant).
Also identify contradictions in the PRD (incompatible requirements,
implicit conflicts) and show how your architecture resolves them.
What is especially important from your professional perspective?`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, ARCH_AGENTS);

  return `${K_HEADER}${agent.persona}

PRD:
${prdContent}

Round ${roundIdx + 1} of the discussion. Here are the positions from round ${roundIdx}:

${context}

Respond from your perspective:
1. What do you agree with?
2. What do you disagree with and why?
3. What is missing from your professional view — including in the PRD itself (contradictions, gaps)?
4. Give your refined final position for this round — complete,
   not just as a delta. The synthesis only sees this round.`;
}

// ── Output utilities ───────────────────────────────────────────

export function extractKernthese(output: string): string {
  // 1. <k>…</k> tag
  const match = output.match(/<k>([\s\S]*?)<\/k>/i);
  if (match) return match[1].trim();

  // 2. Bullet points (•, -, *)
  const bullets = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^[•\-\*]/.test(l))
    .slice(0, 4)
    .join("\n");
  if (bullets) return bullets;

  // 3. Numbered list lines (1. 2. …)
  const numbered = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^\d+\./.test(l))
    .slice(0, 4)
    .join("\n");
  if (numbered) return numbered;

  // 4. First 3 non-empty, non-heading lines
  const lines = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 20 && !l.startsWith("#") && !l.startsWith("---"))
    .slice(0, 3)
    .join("\n");
  return lines || "—";
}

export function formatRoundSummary(
  roundNum: number,
  agents: Agent[],
  outputs: string[],
): string[] {
  const lines: string[] = [`Round ${roundNum} · Key arguments`, SUMMARY_DIVIDER, ""];
  for (let i = 0; i < agents.length; i++) {
    lines.push(agents[i].name + ":");
    const kernthese = extractKernthese(outputs[i]);
    const bullets = kernthese
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const b of bullets.length > 0 ? bullets : ["—"]) {
      lines.push("  " + b);
    }
    lines.push("");
  }
  return lines;
}

export function formatSynthesisSummary(synthOut: string, phaseId: "prd" | "arch"): string[] {
  if (phaseId === "prd") {
    const reqs = synthOut
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => /REQ-\d+/.test(l) && !l.startsWith("<"))
      .map((l: string) => l.replace(/^#+\s+/, "").replace(/\*\*/g, "").trim());
    return [
      "Synthesis · PRD.md created",
      SUMMARY_DIVIDER,
      "",
      ...(reqs.length > 0
        ? reqs.map((r: string) => `  ✓ ${r}`)
        : ["  (no REQ sections found)"]),
    ];
  }

  const adrs = synthOut
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /ADR-\d+/.test(l) && !l.startsWith("<"))
    .map((l: string) => l.replace(/^#+\s+/, "").replace(/\*\*/g, "").trim());
  return [
    "Synthesis · architecture.md created",
    SUMMARY_DIVIDER,
    "",
    ...(adrs.length > 0
      ? adrs.map((a: string) => `  ✓ ${a}`)
      : ["  (no ADR sections found)"]),
  ];
}

// ── Walking Skeleton injection ──────────────────────────────────

const SPIKE_BLOCK = `### REQ-000: Walking Skeleton — Technical Foundation

- **Status:** open
- **Priority:** P0
- **Size:** M
- **Depends on:** ---

#### Description
Build the complete technical foundation according to \`architecture.md\`. No business content — infrastructure only: all dependencies installed, build system, linter, test runner configured, development server running, a minimal E2E layer through all architectural layers (e.g. a Hello-World endpoint that executes a DB query and is displayed in the frontend — without business logic).

#### Acceptance Criteria
- [ ] All dependencies installed, no version conflicts
- [ ] Build successful (no errors, no unresolved imports)
- [ ] Linter clean (no errors)
- [ ] Test runner starts and passes (0 failures)
- [ ] Development server starts without errors
- [ ] Minimal E2E layer works: one request passes through all layers to a response

#### Verification
Derive from \`architecture.md\` — build command green, test runner green, dev server responds.

---

`;

/** Prepend REQ-000 Walking Skeleton before the first REQ in PRD.md */
export function injectSpikeReq(prdContent: string): string {
  // Already injected?
  if (/^### REQ-000:/m.test(prdContent)) return prdContent;

  const match = prdContent.match(/^### REQ-\d+:/m);
  if (!match || match.index === undefined) return prdContent + "\n" + SPIKE_BLOCK;

  return prdContent.slice(0, match.index) + SPIKE_BLOCK + prdContent.slice(match.index);
}

/** Add REQ-000 to status.json and make all other REQs depend on it */
export function injectSpikeIntoStatus(statusJson: string): string {
  let status: Record<string, { status: string; priority: string; size: string; deps: string[] }>;
  try {
    status = JSON.parse(statusJson);
  } catch {
    return statusJson;
  }

  if ("REQ-000" in status) return statusJson; // already present

  const updated: typeof status = {
    "REQ-000": { status: "open", priority: "P0", size: "M", deps: [] },
  };
  for (const [key, val] of Object.entries(status)) {
    // CONT-REQs have no dependency on REQ-000 (ADR-006)
    if (key.startsWith("CONT-")) {
      updated[key] = val;
      continue;
    }
    updated[key] = {
      ...val,
      deps: val.deps.includes("REQ-000") ? val.deps : ["REQ-000", ...val.deps],
    };
  }
  return JSON.stringify(updated, null, 2);
}

// ── REQ Split ───────────────────────────────────────────────────

export function buildSplitPrompt(prdContent: string): string {
  return `You are a Requirements Engineer. Your task: review the PRD below and split any REQ that is too large for a single implementation iteration.

## Split criteria

A REQ MUST be split if ANY of these apply:
1. **Size: L** — always split
2. **Size: M** AND has more than 5 Acceptance Criteria
3. **Size: M** AND the Description mixes both frontend/UI work AND backend/API/server-side work in the same REQ

A REQ must NOT be split if:
- Size is XS or S (always fine as-is)
- Size is M with ≤ 5 ACs and a single clear technical concern

## How to split

When splitting REQ-NNN into two parts:
- Keep REQ-NNN as the first part (typically the foundational layer: data model, API, backend)
- Insert a new REQ immediately after with the next available sequential number
- Renumber all subsequent REQs to maintain sequential order (REQ-001, REQ-002, ...)
- The second part should list the first part's ID in "Depends on"
- Assign Size S or M to each part — never L
- Divide the Acceptance Criteria cleanly between the two parts (no duplication, no omission)
- Keep Priority the same on both parts
- Preserve all other fields (Status: open, Verification, etc.)

## Output rules (MANDATORY)

If NO REQ needs splitting → respond with exactly one line:
SPLIT: none

If splits were made → respond with the COMPLETE updated PRD.md:
- Start directly with '#' (no text before it)
- Reproduce ALL existing content — do NOT summarize or omit any REQ
- No explanation, no preamble, no commentary after the document

## PRD to review

${prdContent}`;
}

/**
 * Calls Claude (Sonnet, single turn) to split any oversized REQs in the PRD.
 * Returns the modified PRD content, or the original if no splits are needed
 * or if the LLM output cannot be validated as a PRD.
 */
export async function splitOversizedReqs(
  prdContent: string,
  signal: AbortSignal,
): Promise<string> {
  const prompt = buildSplitPrompt(prdContent);
  let result: string;
  try {
    result = await runClaude(prompt, () => {}, signal, SYNTH_MODEL, 1);
  } catch {
    return prdContent; // on error, pass through unchanged
  }

  const trimmed = result.trim();

  // "SPLIT: none" → no changes needed
  if (trimmed === "SPLIT: none" || trimmed === "") return prdContent;

  // Must start with '#' to be a valid PRD
  if (!trimmed.startsWith("#")) return prdContent;

  return trimmed;
}

/**
 * After a split, new REQ IDs may exist in PRD.md that are missing from status.json.
 * This function adds any such new REQs with metadata parsed from the PRD block.
 */
export function updateStatusAfterSplit(
  statusJson: string,
  prdContent: string,
): string {
  let status: Record<string, { status: string; priority: string; size: string; deps: string[] }>;
  try {
    status = JSON.parse(statusJson);
  } catch {
    return statusJson;
  }

  const blocks = prdContent
    .split(/(?=^### REQ-\d+:)/m)
    .filter((b) => /^### REQ-\d+:/.test(b));

  for (const block of blocks) {
    const idMatch = block.match(/^### (REQ-\d+):/m);
    if (!idMatch) continue;
    const reqId = idMatch[1];
    if (reqId in status) continue; // already tracked

    const priority = block.match(/\*\*Priority:\*\*\s*(P[012])/)?.[1] ?? "P1";
    const size = block.match(/\*\*Size:\*\*\s*(XS|S|M|L)/)?.[1] ?? "M";
    const depsRaw = block.match(/\*\*Depends on:\*\*\s*(.+)/)?.[1]?.trim() ?? "---";
    const deps = depsRaw === "---"
      ? []
      : depsRaw.split(/[,\s]+/).filter((d) => /^REQ-\d+$/.test(d));

    status[reqId] = { status: "open", priority, size, deps };
  }

  return JSON.stringify(status, null, 2);
}

// ── Re-export runPhase for hooks ────────────────────────────────

export { runDebatePhase as runPhase } from "./phaseRunner.ts";
