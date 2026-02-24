# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016, RF-001, RF-002 abgeschlossen
- Nächstes REQ: RF-003 (P1, M) oder RF-004 (P1, S) — beide ohne Deps
- Blocker: keine

## Was existiert
- src/components/EduSetup.ts — 6-Feld sequenzielles Formular (ADR-014, 210 Zeilen)
- src/components/EduInitDashboard.ts — EduRunner + EduInitDashboard (349 Zeilen)
- src/components/InitDashboard.ts — SynthDoneUI/ReviewUI exportiert, type-Union "lernsituation"
- src/main.ts — EDU_INIT_MODE via env (ORVEX_EDU_INIT_MODE=1) ODER --edu-init CLI-Arg
- orvex — Bash-Script: init + edu-init Subcommands; FRAMEWORK_DIR via Symlink-Auflösung
- orvex-tui — Compiled Binary (77MB, arm64); unterstützt --edu-init Flag direkt
- src/lib/reviewUtils.ts — parseReqs, parseSections, buildRewritePrompt("section")
- src/lib/eduAgents.ts — 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
- src/hooks/useEduInitRunner.ts — 5-Phasen-Edu-State-Machine (vollständig)
- templates/LERNSITUATION.md + AGENT_EDU.md — vorhanden
- loop_dev.sh — LERNSITUATION.md Auto-Detect (REQ-016): setzt PROMPT_FILE auf AGENT_EDU.md
- 153 Tests total, alle grün; deno check src/main.ts sauber; Build OK

## RF-001 + RF-002 Implementierung (diese Iteration)
- RF-001: orvex:96 — `grep -q '^### REQ-'` → `grep -qE '^### (REQ|CONT)-'`
  - Fehlertext ebenfalls angepasst (erwähnt nun CONT-REQ-Format)
- RF-002: loop_dev.sh:430 — AWK-Pattern aufgeteilt in zwei separate Bedingungen:
  - `found && /^### (REQ-|CONT-)/ && $0 != title { exit }`
  - `found && /^---/ { exit }`
  - Altes Pattern `/^(### REQ-|^---)/` hatte Nested-^-Bug + fehlende CONT-REQ-Unterstützung
  - Auf macOS (nawk): altes Pattern verursachte AWK-Syntax-Fehler

## Bekannte Offene Punkte
- RF-003 (P1, M): keine Deps — nächste Iteration (Opus-Planung erforderlich)
- RF-004 (P1, S): keine Deps — kann separat oder mit anderem S-REQ gebatcht werden
- RF-005 (P1, M): Depends on RF-003 — erst nach RF-003 möglich
