# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-015 abgeschlossen
- Nächstes REQ: REQ-016 (P1, M) — PROMPT_FILE Auto-Detect — Depends on REQ-000 ✓
- Blocker: keine

## Was existiert
- src/components/EduSetup.ts — 6-Feld sequenzielles Formular (extracted per ADR-014, 210 Zeilen)
- src/components/EduInitDashboard.ts — EduRunner + EduInitDashboard (349 Zeilen)
- src/components/InitDashboard.ts — SynthDoneUI/ReviewUI exportiert, type-Union "lernsituation"
- src/main.ts — EDU_INIT_MODE via env (ORVEX_EDU_INIT_MODE=1) ODER --edu-init CLI-Arg
- orvex — Bash-Script: init + edu-init Subcommands; edu-init validiert git-repo, startet TUI mit --edu-init
- orvex-tui — Compiled Binary (77MB, arm64); unterstützt --edu-init Flag direkt
- src/lib/reviewUtils.ts — parseReqs, parseSections, buildRewritePrompt("section")
- src/lib/eduAgents.ts — 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
- src/hooks/useEduInitRunner.ts — 5-Phasen-Edu-State-Machine (vollständig)
- templates/LERNSITUATION.md + AGENT_EDU.md — vorhanden
- 153 Tests total, alle grün; deno check src/main.ts sauber; Build OK

## Bekannte Probleme für Sonnet
1. **get_next_req_block (loop_dev.sh:414):** Nested-^-Bug + keine CONT-Terminierung (ADR-005).
   Fix: Zwei separate AWK-Bedingungen statt einer (REQ-016).
2. **REQ-016 Priority war korrupt** — Validator hat `"- **Priority:** P1"` auf `"P1"` korrigiert.

## REQ-015 Implementierung
- `orvex edu-init` → `do_edu_init()`: git-repo check + TUI mit --edu-init starten
- `src/main.ts`: `EDU_INIT_MODE = env ODER Deno.args.includes("--edu-init")`
- `deno task build` → `orvex-tui` Binary aktualisiert (arm64)
- Refactoring Check: S-REQ, <5 changed files, kein Check erforderlich

## Nächste Prioritäten
1. REQ-016 (M): loop_dev.sh PROMPT_FILE Auto-Detect (ADR-013 + ADR-005 Fix)
