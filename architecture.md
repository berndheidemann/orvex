# Architecture Decisions

> Extract `runDebatePhase` to a standalone module first; build the edu-init layer on top using env-var routing, a two-tier CONT-REQ regex, and surgical extensions to existing components.

## Overview

The edu-init feature extends orvex's existing Deno + React/Ink TUI by adding a five-phase debate runner (`useEduInitRunner`) that mirrors the two-phase `useInitRunner`. The highest-risk change is extracting the shared debate orchestration logic into `src/lib/phaseRunner.ts` before any edu-specific code lands — all downstream hooks depend on this extraction being stable. CONT-REQs are first-class citizens throughout the pipeline: the AWK heading pattern, TypeScript regex, status.json init, Walking Skeleton injection, and the `orvex` validation gate each need a targeted fix. Partial completion of REQ-010 and REQ-011 on the working branch is an operational constraint — implementations must read existing code before writing.

## Project Structure

```
src/
├── lib/
│   ├── phaseRunner.ts         # NEW — runDebatePhase + PhaseSink interface
│   ├── initAgents.ts          # MODIFIED — re-exports runDebatePhase; CONT-exclusion
│   │                          #            in injectSpikeIntoStatus
│   ├── eduAgents.ts           # NEW — edu personas, prompt builders, makeEduPhases
│   ├── reviewUtils.ts         # MODIFIED — parseSections(); buildRewritePrompt "section"
│   └── reviewUtils.test.ts    # MODIFIED — parseSections + rewrite tests
├── hooks/
│   ├── useInitRunner.ts       # MODIFIED — delegates to phaseRunner.runDebatePhase
│   └── useEduInitRunner.ts    # NEW — 5-phase edu state machine
├── components/
│   ├── InitDashboard.ts       # MODIFIED — SynthDoneUI/ReviewUI type: "lernsituation"
│   └── EduInitDashboard.ts    # NEW — edu TUI + EduSetup form (inline)
├── types.ts                   # MODIFIED — remove "drehbuch" from PhaseState.id
└── main.ts                    # MODIFIED — ORVEX_EDU_INIT_MODE routing + resume detection

templates/
├── LERNSITUATION.md           # NEW — output schema documentation
└── AGENT_EDU.md               # NEW — AGENT.md variant with Phase-4.5 Content QA criteria

loop_dev.sh                    # MODIFIED — get_next_req_block termination;
                               #            PROMPT_FILE auto-detect via FRAMEWORK_DIR
orvex                          # MODIFIED — edu-init subcommand; CONT validation gate;
                               #            export FRAMEWORK_DIR
```

---

## ADR-001: Extract `runDebatePhase` to `src/lib/phaseRunner.ts` (2026-02-24)

**Context:** `runPhase` at `useInitRunner.ts:189–290` is 100 lines of async debate orchestration closing over 13 React state setters and refs. `useEduInitRunner` needs the same logic. The PRD requires `initAgents.ts` to export `runPhase` as a named export. `initAgents.ts` is 506 lines of agent definitions, prompt builders, and spike-injection functions — all pure data and pure functions. Mixing async orchestration with `runClaude` dependency into that file inverts the module's cohesion.

**Decision:** Extract to `src/lib/phaseRunner.ts`. Satisfy the PRD's stated import path via a single re-export line at the bottom of `initAgents.ts`:

```typescript
// initAgents.ts — last line
export { runDebatePhase as runPhase } from "./phaseRunner.ts";
```

Both `useInitRunner` and `useEduInitRunner` import directly from `phaseRunner.ts`; `initAgents.ts` consumers that need only agent definitions are unaffected.

**Rationale:** The import graph expresses actual dependency. `phaseRunner.ts` depends on `runClaude` and the `PhaseSink` interface; `initAgents.ts` depends on neither. A re-export keeps the PRD's letter while preserving module cohesion. Two of three panelists endorsed this placement; the third (Architect) changed position to agree in Round 3.

**Consequences:** This extraction is the load-bearing prerequisite for all edu code. It must land first. After extraction, run `deno test src/` and perform a manual `orvex init` E2E to verify streaming display, round summaries, and file-detection logic are unaffected. The `contentBeforeSynth`/`contentAfterSynth` file-detection block (`useInitRunner.ts:269–277`) moves into `runDebatePhase`. The `phaseLabel` parameter replaces the hardcoded `phaseId === "prd" ? "PRD" : "Architecture"` ternary at line 207, making the function phase-agnostic.

---

## ADR-002: `PhaseSink` interface as the extraction boundary (2026-02-24)

**Context:** `runPhase` closes over 13 state setters and refs including `lineBufferRef`, a `useRef<string>("")` used for streaming line-buffering. Moving the line-buffering logic into `phaseRunner.ts` would change streaming behavior and introduce regression risk. Moving only the phase orchestration requires an explicit callback contract.

**Decision:** Define `PhaseSink` in `phaseRunner.ts`. The hook owns the display buffer; the runner calls `sink.addChunk(chunk)` and `sink.clearLineBuffer()`.

```typescript
export interface PhaseSink {
  setPhaseRunning(phaseId: string): void;
  setAgentStatus(phaseId: string, roundIdx: number, agentIdx: number, status: AgentStatus): void;
  setRoundStatus(phaseId: string, roundIdx: number, status: RoundStatus): void;
  setPhaseStatus(phaseId: string, status: PhaseStatus): void;
  setActiveLabel(label: string): void;
  setAgentStreams(streams: string[]): void;
  setAgentWarnLevel(level: null | "yellow" | "red"): void;
  addChunk(chunk: string): void;
  setLiveLines(lines: string[]): void;
  clearLineBuffer(): void;
}

export type PromptBuilder = (
  roundIdx: number,
  agentIdx: number,
  context: string,
  allOutputs: string[][],
  numRounds: number,
) => string;

export interface PhaseConfig {
  phaseId: string;
  phaseLabel: string;
  outputPath: string;
  agents: Agent[];
  buildPrompt: PromptBuilder;
  context: string;
  numRounds: number;
  phaseModel: string;
  synthModel: string;
}

export async function runDebatePhase(
  config: PhaseConfig,
  sink: PhaseSink,
  signal: AbortSignal,
): Promise<string>;
```

`clearLineBuffer()` must be called at all three sites where `lineBufferRef.current = ""` currently appears in `useInitRunner.ts`. `useInitRunner` constructs a `PhaseSink` from its `useCallback` wrappers — the extraction is mechanical, not a rewrite. The `phaseId` types in existing `setAgentStatus`/`setRoundStatus`/`setPhaseStatus` callbacks change from `"prd" | "arch"` to `string`; this is a type-level change only with no runtime behavior change.

**Rationale:** The hook owns display state; the runner should not own the buffer. Option (a) — `addChunk` in PhaseSink — preserves behavioral parity and keeps the extraction mechanical. `formatRoundSummary` and `formatSynthesisSummary` remain in `initAgents.ts`; callers pass pre-formatted lines via `sink.setLiveLines(formatRoundSummary(...))`.

**Consequences:** Any missed `clearLineBuffer()` call causes stale partial lines to bleed between rounds — a silent UI corruption with no error. Verify by watching the live streaming display during a manual `orvex init` after extraction.

---

## ADR-003: `PhaseState.id` type — remove `"drehbuch"` (2026-02-24)

**Context:** `types.ts:23` currently reads `"prd" | "arch" | "didaktik" | "drehbuch"`. Phase 1.5 (Drehbuch-Synthese) is a single `runClaude` call with no rounds and no agents. A `PhaseState` with `id: "drehbuch"` would have an empty `rounds` array — structurally invalid. The PRD's REQ-010 AC specifies "PhaseState.id akzeptiert `'didaktik' | 'drehbuch'` zusätzlich zu `'prd' | 'arch'`" — this AC overstates the required union.

**Decision:** Set `PhaseState.id` to `"prd" | "arch" | "didaktik"`. Remove `"drehbuch"`. Phase 1.5 progress is tracked via `activeLabel` and `liveLines` in `useEduInitRunner` — it has no `PhaseState`. Implement as part of REQ-010.

**Rationale:** A `PhaseState` is defined by rounds and agents. Phase 1.5 has neither. Keeping `"drehbuch"` in the union misleads implementers into wiring a phantom `PhaseState`. All three panelists reached unanimous agreement on removal.

**Consequences:** The REQ-010 AC as written is superseded. Implementers must not add `"drehbuch"` to the type — this ADR takes precedence.

**Restricts:** REQ-010

---

## ADR-004: Two-tier CONT-REQ regex — broad AWK, precise TypeScript (2026-02-24)

**Context:** The AWK-based `init_status_json` and `sync_status_json` functions in `loop_dev.sh` filter on `/^### REQ-/`; CONT-REQs never enter `status.json`. TypeScript's `parseReqs` in `reviewUtils.ts` had the same gap. The working branch already implements both fixes — this ADR documents the agreed two-tier pattern for validation.

**Decision:**

AWK (permissive, schema-agnostic):
```awk
/^### (REQ|CONT)-/
```

TypeScript (precise, schema-enforcing):
```typescript
const REQ_HEADING = /^### (?:REQ-\d+|CONT-[A-Z]+-\d+[A-Z]*):/m;
```

The AWK pattern intentionally omits suffix constraints — it is the intake gate, not the validation gate. TypeScript is the schema gate. New CONT-REQ categories (e.g., `CONT-QUIZ-001`) pass through AWK automatically; TypeScript validates the schema. Neither layer uses enum-based category gating.

**Rationale:** Enum-gating in AWK requires script changes for every new CONT-REQ category. The two-tier approach separates intake (AWK) from validation (TS), matching the existing pattern for REQ-NNN. Unanimous agreement across all three panelists; `loop_dev.sh:190` and `loop_dev.sh:242` already implement the AWK side; `reviewUtils.ts:3` already implements the TS side.

**Consequences:** Implementers must not modify the working CONT-REQ patterns on the working branch. Read existing code before touching these files. The remaining REQ-010/REQ-011 work is additive, not corrective.

---

## ADR-005: `get_next_req_block` AWK termination fix (2026-02-24)

**Context:** `loop_dev.sh:414` terminates the block-extraction loop on `/^(### REQ-|^---)/`. Two bugs: (1) the nested `^` inside the alternation group is parsed as a literal `^`, not an anchor; (2) CONT-REQ headings do not match `^### REQ-`, so a CONT-REQ section following the target block bleeds into the extracted content.

**Decision:** Replace line 414 with two separate conditions:

```awk
found && /^### (REQ-|CONT-)/ && $0 != title { exit }
found && /^---/ { exit }
```

**Rationale:** Splitting into two lines fixes the regex structure bug and extends termination to CONT-REQ headings. This is the sole remaining gap in REQ-011 — AWK heading patterns for `init_status_json` and `sync_status_json` are already correct on the working branch.

**Consequences:** Implement in the same commit as the REQ-011 verification test. The test from REQ-011's Verification section (`grep -E "^### (REQ|CONT)-" /tmp/test_prd.md | wc -l → 3`) covers the init/sync patterns; a separate bash assertion covering `get_next_req_block` with a mixed CONT/REQ PRD covers this fix.

---

## ADR-006: CONT-REQ exclusion from Walking Skeleton dependency chain (2026-02-24)

**Context:** `initAgents.ts:499–502` unconditionally prepends `REQ-000` to every entry's `deps` array in `injectSpikeIntoStatus`. CONT-REQs must not depend on REQ-000: content files (explanations, tasks, diagrams) require no running dev server. The PRD explicitly states "CONT-REQs erhalten keine automatische `Depends on: REQ-000`." No existing REQ AC covers the fix location; unanimous consensus that it belongs in `injectSpikeIntoStatus`.

**Decision:** Add a CONT-prefix guard before the dep-prepend logic:

```typescript
for (const [key, val] of Object.entries(status)) {
  if (key.startsWith("CONT-")) {
    updated[key] = val; // no REQ-000 dependency
    continue;
  }
  updated[key] = {
    ...val,
    deps: val.deps.includes("REQ-000") ? val.deps : ["REQ-000", ...val.deps],
  };
}
```

Scope into REQ-013. Covered by a unit test with a `status.json` fixture containing mixed CONT and REQ entries; verify that CONT entries have unmodified `deps` and REQ entries have `REQ-000` prepended.

**Rationale:** CONT-REQs generate content files. Content files have no dependency on the Walking Skeleton's dev server. Blocking CONT-REQs behind REQ-000 defeats the parallel content generation model described in UJ-002. `injectSpikeReq` (line 479) already uses `/^### REQ-\d+:/m` and naturally skips CONT sections; only `injectSpikeIntoStatus` needs the guard.

**Consequences:** CONT-REQs process at `open` status immediately when the loop starts. Technical REQ-NNN that consume CONT-REQ output carry their own `Depends on: CONT-XXX-NNN` declarations.

---

## ADR-007: `parseSections` added to `reviewUtils.ts` (2026-02-24)

**Context:** REQ-014 requires the LERNSITUATION.md review screen to display abschnitte parsed from `## ` headings. No existing function in `reviewUtils.ts` parses by heading level — `parseReqs` parses `### REQ-`/`### CONT-` blocks. Without `parseSections`, the `ReviewUI` has no items to display for LERNSITUATION review. This gap was identified in Round 2 and confirmed by all three panelists.

**Decision:** Add to `reviewUtils.ts`, scoped into REQ-010 (because it is a `reviewUtils.ts` addition required before REQ-014 can be implemented):

```typescript
export function parseSections(content: string): ReviewItem[] {
  const parts = content.split(/(?=^## )/m);
  return parts
    .filter((p) => /^## /.test(p.trimStart()))
    .map((p, i) => {
      const trimmed = p.trimEnd();
      const firstLine = trimmed.split("\n")[0] ?? "";
      const title = firstLine.replace(/^## /, "").trim();
      return {
        id: `SEC-${String(i + 1).padStart(2, "0")}`,
        title,
        content: trimmed,
      };
    });
}
```

Add to `reviewUtils.test.ts`: empty content, single section, multiple sections, content without `## ` headings (returns empty array).

**Rationale:** Reuses `ReviewItem` — the same type `parseReqs` returns — so `ReviewUI` receives a uniform interface for both PRD and LERNSITUATION review. Section IDs (`SEC-01`, `SEC-02`, …) are display-only; they are not persisted.

**Consequences:** REQ-014 is blocked on this function existing. The function must be in the working tree before `EduInitDashboard` wires the LERNSITUATION review screen.

**Restricts:** REQ-010, REQ-014

---

## ADR-008: `buildRewritePrompt` extended with `"section"` type (2026-02-24)

**Context:** `reviewUtils.ts:61` has `type: "req" | "adr"`. When a teacher rewrites a LERNSITUATION section via the review screen, the prompt incorrectly labels the item "Requirement" or "Architecture Decision." The LERNSITUATION rewrite must use `typeLabel = "Section"`.

**Decision:** Extend the type parameter union:

```typescript
export function buildRewritePrompt(
  item: ReviewItem,
  instruction: string,
  type: "req" | "adr" | "section",
): string {
  const typeLabel = type === "req" ? "Requirement"
    : type === "section" ? "Section"
    : "Architecture Decision";
  // ...rest unchanged
}
```

Scope into REQ-010. Add one unit test: `buildRewritePrompt(item, "...", "section")` returns a string containing "Section".

**Rationale:** The type label is the only behavioral difference. The surrounding prompt logic is identical. This is an additive extension, not a redesign.

**Consequences:** All existing callers pass `"req"` or `"adr"` — no breakage. `ReviewUI` for LERNSITUATION passes `"section"`.

**Restricts:** REQ-010, REQ-014

---

## ADR-009: `SynthDoneUI` and `ReviewUI` three-way type extension (2026-02-24)

**Context:** Both components in `InitDashboard.ts` currently accept `type: "prd" | "arch"`. LERNSITUATION review requires a third branch. The PRD describes this as "minimale Änderung: type-Union um `'lernsituation'` erweitern" — but the actual code has type-conditional rendering paths for title, content display, button labels, and item labels that each require a distinct case.

**Decision:** Extend `type` to `"prd" | "arch" | "lernsituation"` in both components. Implement as conditional branches, not just a type union widening.

**`SynthDoneUI`** — the `"lernsituation"` branch renders like `"arch"` (raw `fileContent.split("\n")`), not like `"prd"` (which uses `state.items.map()`). Title and button labels get a three-way branch:

```typescript
const title = type === "prd"
  ? (state.existing ? "PRD.md — Review" : "PRD.md created")
  : type === "lernsituation"
  ? (state.existing ? "LERNSITUATION.md — Review" : "LERNSITUATION.md created")
  : "architecture.md created";
```

**`ReviewUI`** — `typeLabel` and `itemLabel` become three-way:

```typescript
const typeLabel = type === "prd" ? "PRD Review"
  : type === "lernsituation" ? "Lernsituation Review"
  : "Architecture Review";

const itemLabel = type === "prd" ? "REQ"
  : type === "lernsituation" ? "Section"
  : "ADR";
```

The empty-state message at line 287 hard-codes "REQ" — update to use `itemLabel`. The `parseAdrConstraints` guard at line 265 (`type === "arch"`) already excludes LERNSITUATION sections; no change needed.

Total change: approximately 25 lines across both components. Scope into REQ-014.

**Rationale:** `SynthDoneUI` for LERNSITUATION needs `fileContent` for display (like arch) but `items` from `parseSections` for the subsequent review screen. Both fields already exist on `SynthDoneState` — no type change needed. The display branch uses `fileContent`; the review setup uses `items`.

**Consequences:** REQ-014's ACs must acknowledge that this is ~25 lines of conditional rendering, not a one-line type union change. The PRD's "minimale Änderung" description understates the scope.

**Restricts:** REQ-014

---

## ADR-010: `ORVEX_EDU_INIT_MODE` env var routing in `main.ts` (2026-02-24)

**Context:** `main.ts:8` reads `ORVEX_INIT_MODE` from `Deno.env`. The `orvex` bash script sets this before invoking the TUI binary. Adding edu-init routing via `Deno.args` parsing would break the established architectural pattern and require the TUI to know how it was invoked.

**Decision:** Follow the existing env var pattern:

```typescript
const EDU_INIT_MODE = Deno.env.get("ORVEX_EDU_INIT_MODE") === "1";
```

In the `App` function: if `EDU_INIT_MODE`, render `EduInitDashboard`; else follow the existing `INIT_MODE` / loop path. The `orvex` bash script sets `ORVEX_EDU_INIT_MODE=1` for the `edu-init` subcommand.

**Rationale:** Env vars are the established boundary between the bash wrapper and the Deno TUI. The bash wrapper handles argument parsing; the TUI reads intent from env. Consistent, simple, testable by setting the env var directly.

**Consequences:** `./orvex edu-init` → sets `ORVEX_EDU_INIT_MODE=1` → TUI renders `EduInitDashboard`. `./orvex init` → sets `ORVEX_INIT_MODE=1` → TUI renders `InitDashboard`. `./orvex` (loop) → neither env var → TUI renders loop UI. All three paths are mutually exclusive.

---

## ADR-011: Partial edu-init resume detection in `main.ts` (2026-02-24)

**Context:** `main.ts:18–28` auto-detects `archOnly` mode by checking for `PRD.md` without `architecture.md`. If a teacher's machine loses power after Phase 1 (LERNSITUATION.md written, PRD.md not yet written), the TUI has no way to distinguish "fresh edu-init" from "resume after Phase 1." Similarly, if `LERNSITUATION.md` exists but `PRD.md` does not, the standard init path would offer an irrelevant init screen.

**Decision:** Add file-existence detection to `main.ts` for the edu-init path:

```typescript
const EDU_INIT_MODE = Deno.env.get("ORVEX_EDU_INIT_MODE") === "1";
let lernsituationExists = false;
try { await Deno.stat("LERNSITUATION.md"); lernsituationExists = true; } catch { /* */ }
```

If `EDU_INIT_MODE` is set, pass `lernsituationExists` to `EduInitDashboard`. The hook (`useEduInitRunner`) uses this to skip Phase 1 and offer review of the existing file, as specified in the PRD idempotency requirement and REQ-013's AC.

If `EDU_INIT_MODE` is not set but `lernsituationExists` is true and `PRD.md` does not exist, offer the edu-init resume path — the teacher can continue from where they left off without re-running `orvex edu-init` explicitly.

**Rationale:** Phase failures between Phase 1 and Phase 2 are the highest-probability partial-failure scenario. The file-detection cost is negligible (two `stat` calls). The pattern mirrors the existing `archOnly` detection.

**Consequences:** `useEduInitRunner` must accept a `lernsituationExists: boolean` config parameter. The Phase 1 skip path is covered by REQ-013's existing AC ("Wenn LERNSITUATION.md bei Start existiert: Phase 1 wird übersprungen").

**Restricts:** REQ-013, REQ-015

---

## ADR-012: `orvex` validation gate extended for CONT-REQs (2026-02-24)

**Context:** `orvex:76` validates that a `PRD.md`, if present, contains at least one `^### REQ-` heading. An edu-init project may produce a `PRD.md` whose first sections are all `CONT-REQ` blocks — this is the expected output of the EDU-PRD-Debate when content requirements precede structural requirements. The current grep rejects valid edu-init PRDs with 100% probability when CONT-REQs precede the first REQ-NNN.

**Decision:** Update the validation grep at `orvex:76`:

```bash
# Before:
if [ -f PRD.md ] && ! grep -q '^### REQ-' PRD.md 2>/dev/null; then

# After:
if [ -f PRD.md ] && ! grep -qE '^### (REQ|CONT)-' PRD.md 2>/dev/null; then
```

Add to REQ-015's acceptance criteria: "`./orvex` does not report a validation error for a PRD.md containing only CONT-REQ sections."

**Rationale:** This is a showstopper for the edu-init workflow. Without the fix, `orvex` refuses to start for every edu-init project, regardless of PRD content quality. The fix is one character change; the risk of not fixing it is total feature failure. No panelist caught this in Rounds 1–2; identified by the DevOps engineer in Round 3.

**Consequences:** The validation gate now accepts any PRD.md with at least one `### REQ-` or `### CONT-` heading. A PRD with neither heading (e.g., a corrupted or empty file) still triggers the error, which is the intended behavior.

**Restricts:** REQ-015

---

## ADR-013: `FRAMEWORK_DIR` export and PROMPT_FILE auto-detection (2026-02-24)

**Context:** REQ-016 requires `loop_dev.sh` to set `PROMPT_FILE` to `templates/AGENT_EDU.md` relative to the orvex installation directory when `LERNSITUATION.md` is present. `loop_dev.sh` has no mechanism to resolve the installation directory — `FRAMEWORK_DIR` is resolved by the `orvex` script at line 10 but not exported. `loop_dev.sh` is launched as a background process with no access to the parent shell's unexported variables.

**Decision:**

**In `orvex`**, add one line before the `$LOOP_SCRIPT` launch:
```bash
export FRAMEWORK_DIR
```

**In `loop_dev.sh`**, between line 58 (where `PROMPT_FILE="AGENT.md"` is set) and line 161 (where it is checked for existence):

```bash
if [ -f "LERNSITUATION.md" ] && [ -n "${FRAMEWORK_DIR:-}" ]; then
  _edu_prompt="$FRAMEWORK_DIR/templates/AGENT_EDU.md"
  if [ -f "$_edu_prompt" ]; then
    PROMPT_FILE="$_edu_prompt"
    log "Using AGENT_EDU.md (edu project detected)"
  else
    log "WARN: AGENT_EDU.md not found at $_edu_prompt — falling back to AGENT.md"
  fi
fi
```

The `${FRAMEWORK_DIR:-}` guard ensures the block is a no-op for any invocation where `FRAMEWORK_DIR` is not set (e.g., direct script invocation in tests).

**Rationale:** `export FRAMEWORK_DIR` in `orvex` is the minimal fix. Self-resolution logic in `loop_dev.sh` (resolving `BASH_SOURCE[0]`) duplicates what `orvex` already does and adds complexity. The fallback to `AGENT.md` with a log warning handles old installations gracefully.

**Consequences:** The `FRAMEWORK_DIR` env var becomes part of the contract between `orvex` and `loop_dev.sh`. Any future scripts launched by `orvex` can rely on it. REQ-016's verification test must set `FRAMEWORK_DIR` explicitly when invoking `loop_dev.sh` directly.

**Restricts:** REQ-016

---

## ADR-014: `EduSetup` form inline in `EduInitDashboard.ts` (2026-02-24)

**Context:** The Phase-0 form (`EduSetup`) collects six fields sequentially. `InitSetup` lives inline in `InitDashboard.ts`. Two panelists disagree on whether `EduSetup` should be a separate file; one notes `EduInitDashboard.ts` will be larger than `InitDashboard.ts`.

**Decision:** Implement `EduSetup` inline in `EduInitDashboard.ts`. If the file exceeds 500 lines after implementation, extract `EduSetup` to `src/components/EduSetup.ts` at that point — not preemptively. Follow the existing pattern (`InitSetup` inside `InitDashboard.ts`) until size justifies extraction.

The six fields in sequence: Fach (required), Thema (required), Jahrgangsstufe (required), Vorwissen (required), Zeit in Minuten (required), Heterogenität/besondere Anforderungen (optional, Enter skips). Empty-Enter on a required field shows an inline error message without advancing. After the last field: summary screen with Bestätigung (Enter/y to proceed, Esc/n to restart from field 1).

**Rationale:** Premature file extraction for a component that doesn't yet exist adds navigation overhead with no present benefit. The 500-line threshold is a pragmatic boundary, not a principle. `InitSetup` is 2 fields; `EduSetup` is 6 fields with validation — roughly 3x the code, but still a single coherent component.

**Consequences:** REQ-014 implementers write `EduSetup` logic directly in `EduInitDashboard.ts`. If size becomes a problem after implementation, extract as a follow-up — not as part of this REQ.

---

## Implementation Order

```
Phase 0 — Prerequisite fixes (parallel, ~1h total):
├── orvex: CONT validation gate (ADR-012)              [15 min]
├── orvex: export FRAMEWORK_DIR (ADR-013)              [5 min]
├── loop_dev.sh: get_next_req_block fix (ADR-005)      [15 min]
└── types.ts: remove "drehbuch" (ADR-003)              [5 min]

Phase 1 — Foundation (parallel):
├── REQ-010: parseSections, buildRewritePrompt "section",
│   CONT-exclusion guard + tests (ADRs 007, 008, 006)  [2–3h]
│   ⚠ AWK patterns and CONT regex already done —
│     verify before touching these files
├── REQ-011: get_next_req_block only — rest done       [30 min]
└── REQ-012: eduAgents.ts + templates                  [4–5h]

Phase 2 — Extraction gate (sequential, blocks all hooks):
└── phaseRunner.ts + PhaseSink (ADRs 001, 002)         [2–3h]
    GATE: deno test src/ → green
    GATE: manual orvex init → streaming display correct

Phase 3 — Edu flow (sequential):
├── REQ-013: useEduInitRunner (includes ADR-006, ADR-011) [5–6h]
└── REQ-016: loop_dev.sh PROMPT_FILE (ADR-013)         [30 min, parallel]

Phase 4 — UI and integration:
├── REQ-014: EduInitDashboard + component extensions
│   (ADRs 009, 014)                                    [5–6h]
└── REQ-015: orvex edu-init subcommand + build         [1h]
```

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| phaseRunner extraction breaks streaming display | Critical | Extract mechanically; verify all 3 `clearLineBuffer()` sites; manual E2E before edu code |
| PRD partial completion causes implementer regression | High | Read existing code before writing; REQ-010/011 are >80% done on working branch |
| `orvex` validation gate rejects edu projects | High | Phase 0 fix (ADR-012); 1-line change; blocks all edu use if missed |
| `FRAMEWORK_DIR` not available to loop_dev.sh | High | Phase 0 fix (ADR-013); `export FRAMEWORK_DIR` in orvex |
| `SynthDoneUI`/`ReviewUI` underscoped in REQ-014 ACs | Medium | ADR-009 explicitly scopes ~25 lines; REQ-014 ACs must reflect this |
| `lernpfad.md` has no review step | Product risk | Errors in learning path propagate unreviewed into PRD generation — product owner must decide explicitly |
| Template quality (AGENT_EDU.md) untestable | Product risk | Lehrkraft review of templates before REQ-013 implementation starts |

---

## ADR-015: Extract review-flow abstraction to `src/lib/reviewFlow.ts` (2026-02-24, RF-003)

**Context:** Both `useInitRunner.ts` (703 lines) and `useEduInitRunner.ts` (904 lines) contained an identical 8-callback pattern per review target: ref-synced setter, confirm synth-done, skip review, advance, open editor, start typing, on type, submit rewrite. `useInitRunner` had 2 targets (PRD, Arch); `useEduInitRunner` had 3 targets (LernSituation, PRD, Arch). The pattern totalled ~580 lines of duplicated logic across both hooks.

**Decision:** Extract to two files:
- `src/lib/reviewFlowUtils.ts` — 4 pure functions (`makeInitialReviewState`, `advanceReviewState`, `applyReviewTypingKey`, `applyRewriteResult`), no React dependency, fully unit-testable
- `src/lib/reviewFlow.ts` — `useReviewTarget` hook (all 8 callbacks per target), `runReviewSequence` async helper (synth-done → review flow), `useSharedEditCallbacks` hook (cross-target save/cancel)

Both hooks call `useReviewTarget` N times (fixed, unconditional), satisfying React hooks rules. The return types `InitRunnerState` and `EduInitRunnerState` are unchanged — behavioral parity guaranteed by mechanical field mapping.

**Rationale:** The custom hook approach is valid because hook call count is fixed per component. Pure functions are split into `reviewFlowUtils.ts` to enable `deno test` without `--allow-env` (React's CJS module checks `process.env.NODE_ENV`). The `runReviewSequence` async helper encapsulates the repeated synth-done/review promise pattern from both hooks' main effects.

**Consequences:** `useInitRunner` reduced from 703 to 364 lines (–48%); `useEduInitRunner` from 904 to 480 lines (–47%). Combined reduction 47.5%, exceeding the ≥30% target. Any future review target (new document type) is added by calling `useReviewTarget` once — no callback duplication. RF-005 (deduplicate dashboard rendering) can leverage `ReviewFlowHandle` type for component props.

---

## ADR-016: Extract `RunnerDashboard` to `src/components/InitDashboard.ts` (2026-02-24, RF-005)

**Context:** `EduRunner` (`EduInitDashboard.ts`, ~312 lines) and `InitRunner` (`InitDashboard.ts`, ~320 lines) shared ~280 lines of identical dashboard rendering logic: layout width computation, timer `useState`/`useEffect`s, done/error early-return screens, split-pane layout with progress bars, and agent stream display.

**Decision:** Extract a `RunnerDashboard` component (~170 lines) in `InitDashboard.ts`. Both runners pass their hook state and a small configuration struct. Two customization slots cover the structural differences:
- `emptyStateLines: string[]` — intro text shown in right pane when no live output yet (InitRunner only, per prd/arch phase)
- `footer: React.ReactElement | null` — extra element rendered after split-pane (InitRunner's `awaitingArchConfirm` block)

`RunnerDashboard` owns: `useApp`, `useTerminalSize`, two timer `useState`/`useEffect`s, the done-auto-exit effect, layout computation, done screen, error screen, and the split-pane JSX. Parent components retain: the state hook call, `useInput`, `useRawBackspace`, and all review/synth-done early-return screens (rendered before delegating to `RunnerDashboard`).

`RunnerDashboard` is placed in `InitDashboard.ts` (not a new file) to avoid circular imports with `PhaseBlockCompact`, which is defined in the same file. `InitDashboard.ts` already serves as the shared dashboard component library.

**Rationale:** The component approach (vs. a custom hook) is correct because the shared logic includes JSX rendering, not just state/effects. The two customization slots are sufficient to capture all current differences without over-abstracting. `descText` is the raw description string; `RunnerDashboard` truncates it internally using its own `columns` value — the parent no longer needs `useTerminalSize`.

**Consequences:** `EduRunner` reduced from ~312 to ~145 lines (–53%); `InitRunner` from ~320 to ~165 lines (–48%). Combined reduction ~50%. Future dashboard appearance changes are made once in `RunnerDashboard`. `InitDashboard.ts` grows from 726 to 786 lines (+60 net) — acceptable given the file already serves as the shared component library.