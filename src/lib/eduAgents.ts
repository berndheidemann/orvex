import type {
  AgentStatus,
  RoundStatus,
  PhaseState,
  RoundState,
} from "../types.ts";
import { type Agent, ARCH_AGENTS, ARCH_OUTPUT_PATH } from "./initAgents.ts";

// ── Output paths ────────────────────────────────────────────────

export const LERNSITUATION_OUTPUT_PATH = "LERNSITUATION.md";
export const LERNPFAD_OUTPUT_PATH = "lernpfad.md";
export const EDU_PRD_OUTPUT_PATH = "PRD.md";

// ── K-Header (Kernthese format for debate rounds) ───────────────

const K_HEADER = `OUTPUT FORMAT: Your response must begin with:
<k>
• Keyword: Core statement (max. 8 words)
• Keyword: Core statement (max. 8 words)
• Keyword: Core statement (max. 8 words)
</k>
Your analysis follows after. No text before the <k> block.

---
`;

// ── Agent definitions ───────────────────────────────────────────

/** Phase 1 agents: Didaktik-Debate */
export const DIDAKTIK_AGENTS: Agent[] = [
  {
    name: "Fachsystematiker",
    persona:
      "You are a Fachsystematiker. Your focus: fachliche Korrektheit und Vollständigkeit, logisch aufbauende Konzeptsequenz, gegen verkürzte oder falsche Modelle. You insist that every concept is built on correct foundations — no simplifications that introduce misconceptions. You challenge any proposed sequence that skips prerequisite knowledge.",
  },
  {
    name: "Lernprozess-Advokat",
    persona:
      "You are a Lernprozess-Advokat. Your focus: kognitive Zugänglichkeit, Vorwissensanknüpfung, Misconception-Behandlung, gegen Overload. You analyze the cognitive load of every learning step. You push for activation of prior knowledge, explicit misconception treatment, and learner-centered sequencing. You resist content-heavy approaches that ignore how learners actually process information.",
  },
  {
    name: "Realitäts-Constraint-Agent",
    persona:
      "You are a Realitäts-Constraint-Agent. Your focus: 45-Minuten-Stunde, heterogene Klasse, Lehrplan-Zwang, Lehrkraft-Workload. You ground every proposal in classroom reality: limited time, mixed ability levels, curriculum mandates, and teacher bandwidth. You cut anything that cannot realistically be implemented in a typical school setting.",
  },
];

/** Named exports for direct access */
export const Fachsystematiker = DIDAKTIK_AGENTS[0];
export const LernprozessAdvokat = DIDAKTIK_AGENTS[1];
export const RealitaetsConstraintAgent = DIDAKTIK_AGENTS[2];

/** Phase 2 agents: EDU-PRD-Debate */
export const EDU_PRD_AGENTS: Agent[] = [
  {
    name: "Fachlehrkraft",
    persona:
      "You are a Fachlehrkraft with deep subject expertise and classroom experience. Your focus: subject-matter correctness, age-appropriate language, curriculum alignment, and practical teachability. You think in terms of lesson plans, learning progressions, and student understanding. You challenge any requirement that is factually incorrect or pedagogically unsound.",
  },
  {
    name: "Lerndesigner",
    persona:
      "You are a Lerndesigner specializing in instructional design and learning engineering. Your focus: evidence-based learning design, scaffolding, formative assessment, and adaptive difficulty. You push for clear learning objectives, structured scaffolding sequences, and measurable learning outcomes. You ensure that exercises match the specified Bloom taxonomy level.",
  },
  {
    name: "Didaktik-Analyst",
    persona:
      "You are a Didaktik-Analyst specializing in educational quality assurance and didactic analysis. Your focus: completeness of requirements, edge cases, contradictions between learning objectives and content, clear acceptance criteria for educational content. You surface what is missing — missing prerequisite checks, undefined difficulty levels, unspecified differentiation paths.",
  },
];

/** Named exports for direct access */
export const Fachlehrkraft = EDU_PRD_AGENTS[0];
export const Lerndesigner = EDU_PRD_AGENTS[1];
export const DidaktikAnalyst = EDU_PRD_AGENTS[2];

// ── Phase structure factory ─────────────────────────────────────

function makeRounds(agents: Agent[], numRounds: number): RoundState[] {
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

/**
 * Creates the 3-phase structure for edu-init flows:
 * 1. "didaktik" — Didaktik-Debate → LERNSITUATION.md
 * 2. "prd"      — EDU-PRD-Debate → PRD.md
 * 3. "arch"     — Architecture Design → architecture.md
 */
export function makeEduPhases(
  didaktikRounds: number,
  prdRounds: number,
  archRounds: number,
): PhaseState[] {
  return [
    {
      id: "didaktik",
      label: "Didaktik-Debate",
      outputPath: LERNSITUATION_OUTPUT_PATH,
      status: "running",
      rounds: makeRounds(DIDAKTIK_AGENTS, didaktikRounds),
      startedAt: null,
    },
    {
      id: "prd",
      label: "EDU-PRD Generation",
      outputPath: EDU_PRD_OUTPUT_PATH,
      status: "pending",
      rounds: makeRounds(EDU_PRD_AGENTS, prdRounds),
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

// ── Shared helper ───────────────────────────────────────────────

function formatOthersOutput(
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

// ── Prompt builders ─────────────────────────────────────────────

const GERMAN_OUTPUT_DIRECTIVE =
  "Output language: German. All generated content must be written in German.";

/**
 * Builds prompts for Phase 1 Didaktik-Debate rounds.
 * When roundIdx === numRounds, produces the synthesis prompt that generates LERNSITUATION.md.
 * The synthesis prompt explicitly requires Bloom-taxonomy, Backward Design, and Differenzierung.
 */
export function buildDidaktikPrompt(
  roundIdx: number,
  agentIdx: number,
  lernkontext: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const isSynthesis = roundIdx === numRounds;

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = DIDAKTIK_AGENTS.map((a, i) =>
      `--- ${a.name} (final position) ---\n${lastRound[i] ?? "(no output)"}`
    ).join("\n\n");

    return `TASK: Synthesize the following didactics debate into a complete LERNSITUATION.md document.

OUTPUT RULES (mandatory):
- Your response starts with the character '#'. No text before it.
- Do NOT write files. Do NOT execute commands. Do NOT use tools.
- No introduction, no confirmation, no <k> block.
- Your text response IS the document — complete and direct.

Learning context: ${lernkontext}

Final positions from the Didaktik-Debate:

${all}

Produce a structured LERNSITUATION.md following this schema exactly:

# Lernsituation: [derived title]

## Lernkontext
[Subject, grade level, prior knowledge, class profile]

## Lernziele (Bloom-Taxonomie, revidiert)
For each learning goal use the operative formula: Verb (Bloom-Level) + Inhalt + Bedingung
- [ ] [Bloom-Level: Erinnern|Verstehen|Anwenden|Analysieren|Bewerten|Erschaffen] — [Goal]

## Assessment-Design (Backward Design)
Backward Design: Define assessments BEFORE specifying content.
- **Summative assessment:** [What proves mastery at the end?]
- **Formative assessments:** [Which checkpoints during learning?]
- **Evidenz:** [Observable learner behavior that demonstrates each Lernziel]

## Differenzierungsplan
- **Grundniveau:** [Minimum competency — what every learner must achieve]
- **Erweiterungsniveau:** [Extended competency — what advanced learners can achieve]
- **Scaffolding:** [Scaffolds for struggling learners]
- **Enrichment:** [Enrichment tasks for advanced learners]

## Kognitive Belastungsanalyse
- **Intrinsic load:** [Inherent complexity of the content]
- **Extraneous load:** [Avoidable complexity from presentation — to minimize]
- **Germane load:** [Schema-building load — to maximize]

## Content-Typ-zu-Lernziel-Matrix
| Lernziel | Content-Typ | Bloom-Level | Dauer |
|----------|-------------|-------------|-------|
| [Goal]   | EXPL/TASK/DIAG/DIFF | [Level] | [min] |

## Methodik-Entscheide
- **Einstieg:** [Activation method — problem, question, phenomenon]
- **Erarbeitung:** [Core learning activity]
- **Sicherung:** [Consolidation method]
- **Transfer:** [Transfer task]

${GERMAN_OUTPUT_DIRECTIVE}`;
  }

  const agent = DIDAKTIK_AGENTS[agentIdx];

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Learning context: ${lernkontext}

Analyze this learning situation from your expert perspective.
What are the critical didactic decisions that must be made?
What are the risks and opportunities you see?
What is most important from your professional viewpoint that others might overlook?

Use the REQ format for each proposal:

### DIDAKTIK-NNN: [Title]
- Priority: P0|P1|P2
#### Claim
[Your argument from your expert perspective]
#### Evidence / Rationale
[Why is this important?]

${GERMAN_OUTPUT_DIRECTIVE}`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, DIDAKTIK_AGENTS);

  return `${K_HEADER}${agent.persona}

Learning context: ${lernkontext}

Round ${roundIdx + 1} of the didactics debate. Positions from round ${roundIdx}:

${context}

Respond from your expert perspective:
1. What did you miss in your own round-${roundIdx} position?
2. Where do the other perspectives fall short — what do they miss from your domain?
3. Where are there genuine conflicts between perspectives — how do you resolve them?
4. Give your refined, complete final position for this round.

${GERMAN_OUTPUT_DIRECTIVE}`;
}

/**
 * Builds the Phase 1.5 Drehbuch prompt (single-shot, no debate).
 * Input: full content of LERNSITUATION.md
 * Output: lernpfad.md with concrete LE sequence, time allocations, content types.
 */
export function buildDrehbuchPrompt(lernsituationContent: string): string {
  return `TASK: Create a concrete Lernpfad (learning path script) based on the following LERNSITUATION.md.

OUTPUT RULES (mandatory):
- Your response starts with the character '#'. No text before it.
- Do NOT write files. Do NOT execute commands. Do NOT use tools.
- No introduction, no confirmation, no <k> block.
- Your text response IS the document — complete and direct.

LERNSITUATION.md:
${lernsituationContent}

Produce lernpfad.md following this structure:

# Lernpfad: [title derived from LERNSITUATION]

## Übersicht
| Phase | Inhalt | Content-Typ | Dauer | Lernziel |
|-------|--------|-------------|-------|----------|
| Einstieg | ... | EXPL | X min | [Bloom-Level] |
| Erarbeitung | ... | TASK | X min | [Bloom-Level] |
| Sicherung | ... | DIAG | X min | [Bloom-Level] |
| Transfer | ... | TASK/DIFF | X min | [Bloom-Level] |

## Abschnitte

For each section, produce a block:

### [N]. [Phase]: [Title] ([Duration] min)

**Content-Typ:** EXPL | TASK | DIAG | DIFF
**Lernziel:** [Which Lernziel from LERNSITUATION.md does this address?]
**Bloom-Level:** [Erinnern|Verstehen|Anwenden|Analysieren|Bewerten|Erschaffen]

**Inhalt:**
[Concrete description of what happens in this section — specific enough to generate content]

**Differenzierung:**
- Grundniveau: [What does this section look like for learners at Grundniveau?]
- Erweiterungsniveau: [What does this section look like for advanced learners?]

**Übergang:** [How does this section connect to the next?]

---

Total duration must match the 45-minute Unterrichtsstunde (or clearly indicate if multiple lessons are needed).

${GERMAN_OUTPUT_DIRECTIVE}`;
}

/**
 * Builds prompts for Phase 2 EDU-PRD-Debate rounds.
 * combinedContext = learning-context.md + LERNSITUATION.md + lernpfad.md (concatenated by caller).
 * When roundIdx === numRounds, produces the synthesis prompt that generates PRD.md.
 */
export function buildEduPrdPrompt(
  roundIdx: number,
  agentIdx: number,
  combinedContext: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const isSynthesis = roundIdx === numRounds;

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = EDU_PRD_AGENTS.map((a, i) =>
      `--- ${a.name} (final position) ---\n${lastRound[i] ?? "(no output)"}`
    ).join("\n\n");

    return `TASK: Synthesize the following EDU-PRD discussion into a complete PRD.md document.

OUTPUT RULES (mandatory):
- Your response starts with the character '#'. No text before it.
- Do NOT write files. Do NOT execute commands. Do NOT use tools.
- No introduction, no confirmation, no <k> block.
- Your text response IS the document — complete and direct.

Educational context (learning-context.md + LERNSITUATION.md + lernpfad.md):
${combinedContext}

Final positions from the EDU-PRD discussion:

${all}

Produce a complete PRD.md following this structure:

# PRD — [project name derived from context]

> [one-sentence description]

---

## User Journeys

Describe 2–4 core learner flows as numbered steps. Focus on the happy path + most important error/misconception case.

### UJ-001: [Journey name]
**Goal:** [What does the learner want to achieve?]
1. [Step]
2. [Step]
**Error case:** [What happens when the learner fails or has a misconception?]

---

## Requirements

Use REQ-NNN for infrastructure/flow requirements.
Use CONT-EXPL-NNN for explanation content.
Use CONT-TASK-NNN for exercises/tasks.
Use CONT-DIAG-NNN for diagnostic/quiz items.
Use CONT-DIFF-NNN for differentiation content.

Each requirement MUST start with the Markdown heading "### REQ-NNN:" or "### CONT-[TYPE]-NNN:".

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

#### Content Verification (for CONT-* requirements)
**Content type:** text|visual|interactive
**Re-generation:** \`[command or step]\`
**Correctness criterion:** [How to verify factual correctness?]

---

${GERMAN_OUTPUT_DIRECTIVE}`;
  }

  const agent = EDU_PRD_AGENTS[agentIdx];

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Educational context (learning-context.md + LERNSITUATION.md + lernpfad.md):
${combinedContext}

Analyze the educational project from your expert perspective and propose requirements.
Think in terms of: What content must exist? What flows does the learner go through?
What REQ-NNN (infrastructure) and CONT-* (content) requirements are needed?

Use this format for each requirement:

### REQ-NNN: [Title]
- Priority: P0|P1|P2
- Size: XS|S|M
- Depends on: ---
#### Description
...
#### Acceptance Criteria
- [ ] ...

Or for content:

### CONT-EXPL-001: [Title]
- Priority: P0|P1|P2
- Size: XS|S
- Depends on: ---
#### Description
...

What is critical from your professional perspective that others will miss?

${GERMAN_OUTPUT_DIRECTIVE}`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, EDU_PRD_AGENTS);

  return `${K_HEADER}${agent.persona}

Educational context (learning-context.md + LERNSITUATION.md + lernpfad.md):
${combinedContext}

Round ${roundIdx + 1} of the EDU-PRD discussion. Positions from round ${roundIdx}:

${context}

Respond from your expert perspective:
1. What did you miss in your own round-${roundIdx} position?
2. What is missing from the other perspectives?
3. Where are there conflicts — how do you resolve them?
4. Give your refined, complete final position for this round (full REQ list).

${GERMAN_OUTPUT_DIRECTIVE}`;
}
