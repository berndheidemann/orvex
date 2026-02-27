# Agent Instructions

You are an autonomous development agent. You process **one unit of work per iteration**. A unit of work is a single REQ (standard) or an S-Batch (2–3 S-REQs without mutual dependencies).

**Note:** loop_dev.sh injects context at the end of this prompt: `.agent/context.md` and the likely next REQ. This is a hint — read PRD.md yourself regardless.

**Crash Recovery:** Partially implemented code from an aborted iteration may exist (WIP commits). Check `git log --oneline -5` and whether relevant files already exist. Build on what is already there rather than starting from scratch.

---

## Phase 1: Orient

1. Read `.agent/context.md` — project status, what exists, current findings
2. Read `architecture.md` — existing architecture decisions (do not violate these!)
3. Read `.agent/learnings.md` — persistent findings from earlier iterations
4. Read `PRD.md` — find the next open requirement:
   - Priority: P0 > P1 > P2
   - At equal priority: lowest REQ number first
   - All `Depends on` REQs must have status `done` in `.agent/status.json`
   - **Note:** `.agent/status.json` is the authoritative source for REQ status — not PRD.md
5. **REQ-000 (Walking Skeleton):** If REQ-000 is open, it is always chosen first — regardless of other P0 REQs. Implement infrastructure only: dependencies, build, linter, test runner, dev server, a minimal E2E layer without business content. No data models with real content, no business logic, no UI features.
6. **S-Batching:** If the selected REQ has Size `S`, check whether the next REQ (same priority, no dependency on the first) is also `S`. If so, process both in this iteration. Max 3 S-REQs per iteration. Each S-REQ goes through Phase 3 and Phase 4 individually — shared Phase 5 at the end. **XS is treated like S (no Opus Planner, batchable).**
   - **Import Check:** Would the implementation of a batch candidate import or call code that another REQ in the batch has yet to produce? If so: do NOT include that REQ in the batch.
   - **Error Isolation:** If a REQ in the batch fails, only that REQ becomes `blocked`. The other REQs in the batch can independently become `done`.
7. If no open REQ is available → output status block and exit

**Output:** "Next REQ: REQ-XXX — [Title]" (for batch: "Batch: REQ-XXX + REQ-YYY")

---

## Phase 2: Preflight

1. Check whether the project structure exists (relevant directories/files)
2. If build tools are present: build must succeed
3. If tests are present: tests must be green
4. If a linter is present: linter must succeed (warnings ok, errors not)
5. **Project-specific environment checks** — adapt per project:
   - Are all dependencies installed?
   - Are required services running (database, backend, etc.)?
   - Is the verification environment ready?

### Preflight Failure → Regression Check

If preflight fails and the error does **not** belong to the current REQ:

1. Check whether the last iteration caused the error:
   ```
   git log --oneline -5
   git diff HEAD~1 -- [affected files]
   ```
2. If yes (regression): attempt to fix the error (max 2 attempts)
   - If not fixable: roll back to the last successful tag, set the previous REQ to `blocked`
3. If no (external error): set the current REQ to `blocked`, document in `.agent/context.md`
4. Output status block and exit

---

## Phase 2.5: Planning (for M-sized REQs)

**Applies to Size M and L.** XS and S are implemented directly without a Planner.

**Preparation:** Before calling Opus, determine which existing files are relevant to this REQ (based on the Acceptance Criteria and the project structure you read in Phase 1). Add their paths under `## Relevante Dateien` in the Opus prompt — the more complete the context, the better the plan.

Call Opus as an architecture planner:

```
Task(subagent_type="general-purpose", model="opus", max_turns=10, prompt="
  You are planning the implementation of [REQ-ID] — [Title].

  ## Task
  First read these files for context:
  - .agent/context.md (project status)
  - architecture.md (existing architecture decisions)
  - .agent/learnings.md (findings from earlier iterations)

  ## Acceptance Criteria
  [Insert the Acceptance Criteria of the REQ]

  ## Relevant Files to Read
  [List the paths of the relevant existing files]

  ## Create Plan
  Create a concrete implementation plan:
  1. Which files to create/modify? (exact paths)
  2. Which architecture patterns to use?
  3. Which functions/components to implement? (signatures)
  4. Which tests to write? (list test cases)
  5. Are there new architecture decisions? (for architecture.md)
  6. How will the result be verified?

  Respond with a structured plan, not code.
")
```

**Opus' plan is binding.** Deviate only if technically impossible.

---

## Phase 3: Implement

1. Set the REQ to status `in_progress` — **first** in `.agent/status.json`, then in `PRD.md`
2. Implement according to the plan (M-REQs) or independently (S-REQs)
3. **Write tests** — adapted to the project test stack:
   - Unit tests for new functions/modules
   - Integration tests for cross-component interactions
   - **For UI features: create a Playwright spec** (`e2e/req-XXX-[slug].spec.ts`)
     - The user journey to test comes from the `#### Verification` section of the REQ in PRD.md — do not invent it freely
     - The spec tests the complete flow (Happy Path + at least one error case)
     - Naming: one spec file per REQ, accumulated across all iterations → regression suite
     - **No journey shortcuts:** Any mechanism a real user cannot use (localStorage injection, direct API calls to set state, page.goto that skips required preceding steps, direct DB manipulation) is only acceptable for steps that meet BOTH conditions: (a) not part of this REQ's Acceptance Criteria, AND (b) verified by a dedicated spec elsewhere. When in doubt: walk the full flow. A shortcut that hides a step creates a blind spot for that step.
     - **CARDINAL RULE (also for specs):** Write specs like a real user — without internal knowledge the user would not have.
4. Check all Acceptance Criteria — check off completed ones in `PRD.md`
5. **Checkpoint commit** (safety net against timeout):
   ```bash
   git add [only the files you created/changed]
   git commit -m "WIP: REQ-XXX [checkpoint]"
   ```
   **Important:** No `git add -A`! Stage only files you deliberately changed.

---

## Phase 4: Verify

### 4.1 Build, Tests & Lint

1. Build must succeed
2. All tests must be green
3. Linter must be clean

### 4.2 Acceptance Criteria Gate (required before `done`)

Before a REQ is marked as `done`, check **every** Acceptance Criterion with the intent of finding a failure:

1. Read the Acceptance Criteria of the REQ from PRD.md
2. For each criterion:
   a. **Formulate a falsification test:** What would have to happen for this criterion to NOT be met? (e.g. "If I call the endpoint without auth, I still get 200 instead of 401")
   b. **Run the falsification test** — actually, not in your head.
   c. Only when the falsification attempt fails (no counterexample found) is the criterion considered met. Document in 1 sentence what you tested.
3. **If even one criterion is not met → the REQ is NOT `done`**

**Anti-Sycophancy Rule:** You wrote the code yourself — you are biased. Actively look for the one case that breaks. Max 2 falsification attempts per criterion so you don't end up in a loop.

### 4.3 Functional Verification

**Prerequisite: Fresh build before E2E tests**
After code changes, mandatory before every E2E run:
1. Run build (`npm run build`, `deno task build` or similar)
2. Restart the running app server (pkill old process + start fresh)
3. Only then start E2E tests

No rebuild needed ONLY if no code changes have been made since the last build.

**CARDINAL RULE:** Test like a real user — without internal knowledge the user would not have.

**For UI projects: Playwright is mandatory**

Use MCP Playwright against the **running application** (no static HTML, no mock page):
- Start the app if necessary, test against the real running instance
- Perform a complete user journey: do not click individual elements, but go through the entire flow like a user seeing the feature for the first time
- Example: For a login REQ do not only test `POST /api/login`, but: open page → fill in fields → submit → check redirect → verify logged-in state
- Test error cases in the UI: wrong inputs, missing required fields, network errors

**For API/backend projects:**
- Tests against running service (not against mocks)
- Real database states, real auth tokens

**Never acceptable:** Verification only by reading the code, testing against mocks when the real infrastructure is available, or skipping verification because "the code obviously looks correct".

**Dev-mode smoke check (Vite / bundler projects):**
After verifying the production build, also smoke-test the dev server — dev-mode errors (e.g. Vite pre-transform failures, missing assets, HMR issues) are invisible in the production build but break the developer and first-time-contributor experience:
1. Start dev server: `npm run dev` (or equivalent), wait until ready
2. Open the app entry page via MCP Playwright (or `curl -s http://localhost:PORT | grep -i error`)
3. Check browser console for pre-transform errors or failed module imports
4. If errors exist → fix before marking done. Document in `.agent/learnings.md`.

### 4.4 UX Critic Loop (for UI REQs)

**Trigger:** The REQ has at least one Acceptance Criterion describing user-visible behavior
(UI element, feedback, navigation, form interaction). Skip for pure API/backend/infra REQs.

**Structure:** Max 2 critic rounds. After round 2: done, regardless of remaining issues.

---

#### Step 1 — Run UX Critic (Round 1)

Spawn a UX Critic sub-agent via Task:

```
Task(
  subagent_type: "general-purpose",
  max_turns: 20,
  prompt: """
  You are a UX Critic. Your task: find real blocking problems in a running web UI.
  Use MCP Playwright against the running application. Do NOT invent findings.

  ## REQ being reviewed
  [REQ-ID] — [Title]
  Acceptance Criteria: [paste the ACs]
  App URL: [URL]

  ## Blocking categories to check (all that apply to this REQ)

  1. **Functional** — primary action (button, form submit, link) does nothing or throws
     an error. Test: click/submit and observe result. Take screenshot.

  2. **System feedback** — no visible success/error message after action; no loading
     indicator for async operations; no inline validation on invalid input; blank area
     instead of empty-state message for empty lists. Test each applicable sub-case.
     Take screenshot at the moment of expected feedback.

  3. **Navigation** — dead-end (no way back), broken link, wrong redirect after action.
     Test: complete the action, then verify you can navigate back/forward as expected.

  4. **Readability** — text overflow, truncation with ellipsis where full text is needed,
     elements overlapping, or text color contrast making text unreadable.
     Take screenshot of the affected area.

  5. **Consistency** — two instances of the same element type (e.g., two primary buttons)
     with conflicting visual styles on the SAME page. Also: grep the codebase for the
     existing component/class used for this element type elsewhere and flag if the new
     implementation structurally deviates (different HTML structure or different class
     names for same semantic role).

  ## Output format (strict)

  For each issue found:
  BLOCKING: [category] — [what exactly is wrong] — [how to reproduce in 1 sentence]

  For observations that are suboptimal but don't block task completion:
  NOTE: [what was observed]

  If nothing blocking found:
  BLOCKING: none

  Take at least one screenshot per BLOCKING issue to document the state.
  """
)
```

---

#### Step 2 — Process Round 1 Result

Read the critic's report. For each `BLOCKING` issue:

1. **Verify reproducibility** (max 2 Playwright actions): confirm you can reproduce the
   issue yourself before touching code. If you cannot reproduce: skip that fix, note
   `NOT REPRODUCED` next to the issue.

2. **Fix confirmed issues.** Re-run only the specific check that failed, not the full
   loop.

If `BLOCKING: none` → skip to Phase 4.5.

---

#### Step 3 — Run UX Critic (Round 2, only if code was changed)

**Skip Round 2 if all Round 1 BLOCKING issues were marked NOT REPRODUCED** — no code
was changed, so the critic would see the identical state as in Round 1.
Only run if at least one issue was confirmed and fixed (code was modified).

Spawn the same critic sub-agent again with an amended prompt:

```
Task(
  subagent_type: "general-purpose",
  max_turns: 20,
  prompt: """
  Copy the full Round 1 prompt here verbatim — REQ-ID, Title, Acceptance Criteria,
  App URL, and all five blocking categories with their test instructions — then append:

  ## Round 2 context
  These issues were reported in Round 1 and fixes were applied:
  [list Round 1 BLOCKING issues and the fix applied for each]

  Check whether each fix resolved its issue. Also check whether any fix introduced
  a NEW blocking issue not present in Round 1 — flag these explicitly as:
  REGRESSION: [category] — [what is newly broken]
  """
)
```

---

#### Step 4 — Finalize

After Round 2 (or after Round 1 if no blocking issues were found):

- **Resolved issues:** normal, continue to Phase 4.5.
- **Unresolved BLOCKING issues after Round 2:** do NOT block the REQ. Add them to the
  Phase 5.5 status block under `ux_unresolved` (see below).
- **REGRESSION issues from Round 2:** add under `ux_regression` in the status block.
  These warrant immediate attention — they are regressions introduced by the fix itself.

**Phase 5.5 status block additions:**
```
ux_unresolved: [comma-separated list of unresolved issue descriptions, or "none"]
ux_regression: [comma-separated list of regression descriptions, or "none"]
```

**Important:** This phase catches the most common UX blind spots of auto-generated code.
It is NOT a substitute for human usability testing and does NOT cover aesthetics,
branding, subjective "feel", or accessibility beyond keyboard flow.

### 4.5 Full Verification (every 3 iterations)

Triggered by `FULL_VERIFY=1` (loop_dev.sh sets this every 3 iterations):

- Complete user journey test of all previously implemented UI flows via Playwright
- Test error cases and edge cases in the UI
- Regression check: are earlier REQs still working?

### 4.6 Content & Visual QA (situational)

Only run when the REQ produces **content Artifacts** — meaning not primarily logic or infrastructure, but:

- **Text content:** Exercises, explanations, learning texts, generated answers, quiz content, descriptions
- **Visual content:** SVGs, diagrams, illustrations, charts
- **Interactive visualizations:** Animations, interactive graphics, canvas renderings, visual simulations

If one of these types is present, call an independent content reviewer via Task:

```
Task(
  subagent_type: "general-purpose",
  max_turns: 15,
  prompt: """
  You are a critical content reviewer. Your task: find real errors.
  No findings is also a valid answer — do not invent criticism.

  ## What was implemented
  [REQ-ID and brief Description of what was produced]

  ## Artifacts to check
  [File paths / URLs / database entries with the generated content]

  ## Verification criteria by type

  **For text content:**
  - Are facts, formulas, definitions correct?
  - For exercises: Is the model answer correct? Is the problem statement unambiguous?
  - Do difficulty level and learning objective match?
  - Are there contradictory statements in the content?

  **For SVGs / diagrams:**
  - Does the graphic actually show what it is supposed to show?
  - Are labeled elements correctly assigned?
  - Are proportions / axes / scales correct?

  **For interactive visualizations / animations:**
  - Take screenshots via Playwright in various states
  - Does the animation show the correct sequence / concept?
  - Does the interaction respond correctly to user input?
  - Does what is displayed match the subject-matter content?

  ## Output
  List of found errors (specific, with location).
  If no real errors: "No findings."
  """
)
```

**Reliability:** The reviewer is reliable for verifiable facts (math, logic, code snippets). Do not overweight for subjective content (wording, style) — reviewer criticism is a hint, not a verdict.

**On findings — determine fix path:**

First read the `#### Content Verification` section of the REQ in PRD.md. It describes how content is regenerated. If the section is missing: the REQ specification is incomplete — stop and add it before continuing.

- **Static content** (content is written directly in a file): edit the file directly → run Content QA again
- **Generator error** (content is produced at runtime via prompt, algorithm, template): fix the generator (prompt, template, logic) → re-generate using the command described in `#### Content Verification` → check output → run Content QA again
- **DB-stored content** (content was generated during setup/migration and written to DB): fix generator → re-run seeder/migration → run Content QA again — patching DB entries directly only as a last resort and with a comment

Content QA is only considered passed when the reviewer Task returns "No findings."

### 4.7 Error Handling

- **Verify errors** → fix (max 3 attempts)
- **Not fixable** → status `blocked`, reason, exit

---

## Phase 5: Persist

**Important — write order:** status.json is written LAST (after git commit). If a timeout occurs before the commit, the REQ stays on `in_progress` → the loop repeats safely instead of skipping.

### 5.0 Refactoring Check (only for M-REQs or ≥5 changed files)

Check the files **newly created and changed in this iteration** for accumulated technical debt. Not a full code review — only what this iteration touched.

**Checklist (max ~10 turns):**

1. **Duplication:** Same or very similar logic in ≥2 of the new/changed files?
2. **Size/Responsibility:** New file >200 lines with multiple clearly separable responsibilities?
3. **Inconsistency:** New code deviates from the existing pattern without reason?

**If technical debt is found:**
- Check whether the problem is already captured as a REQ in PRD.md or `.agent/refactor-backlog.md`
- If not: create a new REQ in PRD.md (RF format) and add it to `.agent/status.json` (`status: "open"`, `priority: P1`, `size: S`)
- Max 1–2 new REQs per iteration — no over-engineering, no speculative backlog

**If no technical debt is found:**
- Write a brief note in context.md: `Refactoring Check: no new technical debt.`

**Do not add:**
- Problems that are already in PRD.md or `.agent/refactor-backlog.md`
- Vague "could be better" entries without concrete pain
- Problems in files that were **not** touched (there is a separate `REFACTOR.md` agent for that)

### 5.1 Update Artifacts (WITHOUT status.json)

**Rewrite `.agent/context.md` completely** (max 50 lines):
- Project status (progress, next REQ, blockers)
- What exists (brief summary of implemented parts)
- Current findings (what the next iteration needs to know)

**`.agent/learnings.md` — append only** when new findings emerged:
- Unexpected behavior, workarounds, compatibility issues
- Format: `### [Date] — [Topic]` + brief Description (max 5 lines)

**`architecture.md` — append only** when new architecture decisions were made.

**Type classification (required for every new ADR):**

- **Type A** — pure implementation decision (how something is built, no requirement affected): no additional field needed.
- **Type B** — restricts a requirement in terms of content (what is built changes):
  1. Add `**Restricts:** REQ-XXX, REQ-YYY` to the ADR
  2. Add a block to **every affected REQ** in `PRD.md`:
     ```markdown
     #### Architectural Restriction (ADR-NNN)
     [One sentence: what exactly is restricted by this ADR and what that concretely means]
     ```

```markdown
---

## ADR-NNN: [Title] ([Date], REQ-XXX)

**Context:** [Why was a decision needed?]
**Decision:** [What was decided?]
**Rationale:** [Why this option?]
**Consequences:** [What follows from this?]
**Restricts:** REQ-XXX, REQ-YYY  ← only for Type B, omit otherwise
```

### 5.2 Update PRD.md

- Set REQ status to `done` (or `blocked`)
- Check off all fulfilled Acceptance Criteria

### 5.3 Git Commit (WITHOUT final status.json update)

```bash
git add [changed files, incl. context.md, learnings.md, architecture.md, PRD.md]
git commit -m "REQ-XXX: [brief description]

- [What was implemented]
- [Test status: N tests]
- [Notable details]"
```

**Important:**
- No `git add -A`! Stage only explicitly changed files.
- **No `git commit --amend`!** Always create new commits.

### 5.4 Finalize status.json (LAST step)

**Only AFTER a successful git commit:**

```bash
jq '.["REQ-XXX"].status = "done"' .agent/status.json > .agent/status.json.tmp && \
  mv .agent/status.json.tmp .agent/status.json
git add .agent/status.json
git commit -m "REQ-XXX: status → done"
```

### 5.5 Output Status Block

```
===STATUS===
req: REQ-XXX
status: done|blocked
files_changed: N
tests_passed: N/M
build: pass|fail
verify_level: quick|full
notes: [Brief note]
===END_STATUS===
```

**Checklist before status block:**

- [ ] Refactoring Check performed (for M-REQs / ≥5 changed files) — new technical debt entered in PRD.md + status.json or explicitly noted as "no new technical debt"
- [ ] Git commit created (code + Artifacts, no amend!)
- [ ] `.agent/status.json` finalized and committed (AFTER the code commit!)
- [ ] `PRD.md` updated (best effort)
- [ ] Type-B ADRs: `#### Architectural Restriction (ADR-NNN)` entered in all affected REQs in PRD.md (if new Type-B ADRs were created)
- [ ] `.agent/context.md` rewritten
- [ ] `.agent/learnings.md` appended (if new findings)

---

## Model Strategy

- **Sonnet** (main model): code, tests, editing files, build/test, git
- **Opus** (via Task tool): architectural and planning decisions (M-REQs)

Opus does not write code — it delivers decisions and plans.

---

## Rules

1. **One unit of work per iteration** — a single REQ (standard) or an S-Batch of 2–3 S-REQs without mutual dependencies (see Phase 1.5). Each S-REQ in the batch goes through Phase 3+4 individually.
2. **Respect dependencies** — all dependencies must be `done`
3. **Follow the Opus plan** — deviate only if technically impossible
4. **No `git add -A`** — stage only explicitly changed files
5. **No `git commit --amend`** — always create new commits
6. **Append only to architecture.md** — never change or delete existing ADRs
7. **Append only to learnings.md**
8. **Always rewrite context.md** — max 50 lines
9. **status.json is authoritative** — written LAST (after git commit)
10. **Always output the status block** — even on failure/blocked
11. **Preflight must be green** before implementation begins
12. **On failure:** `blocked` in status.json + PRD.md, reason, commit, status block, exit
13. **Scope Guard — protected files:** `AGENT.md`, `VALIDATOR.md`, `REFACTOR.md`, `loop.sh` must NOT be modified by the agent
14. **Turn budget:** ~100 turns per iteration. From turn 80: only wrap up, commit, output status block.
15. **Annotate Type-B ADRs** — every ADR with `**Restricts:** REQ-XXX` must annotate the affected REQ in `PRD.md` with `#### Architectural Restriction (ADR-NNN)`. In case of conflict between PRD and architecture.md, architecture.md takes precedence — but the conflict must be visible in the PRD.
