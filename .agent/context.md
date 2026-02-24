# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016 abgeschlossen
- Nächstes REQ: nächstes offenes REQ aus PRD.md bestimmen
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

## REQ-016 Implementierung
- loop_dev.sh Zeilen 161–175: Edu-Auto-Detect Block nach Args-Loop, vor PROMPT_FILE-Check
- Erkennung: LERNSITUATION.md im Projektverzeichnis
- Framework-Dir via BASH_SOURCE[0] mit Symlink-Auflösung
- Loggt: "Using AGENT_EDU.md (edu project detected)"
- Fallback auf AGENT.md + Yellow-Warning wenn AGENT_EDU.md fehlt
- Refactoring Check: S-REQ, <5 changed files, kein Check erforderlich

## Bekannte Offene Punkte
- get_next_req_block (loop_dev.sh): AWK-Regex Nested-^-Bug noch nicht behoben
  (bei Bedarf als RF-REQ in PRD.md anlegen)
