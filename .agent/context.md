# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-014 abgeschlossen
- Nächstes REQ: REQ-015 (P1, S) — edu-init Subcommand — Depends on REQ-014 ✓
- Oder: REQ-016 (P1, M) — PROMPT_FILE Auto-Detect — Depends on REQ-000 ✓
- Blocker: keine

## Was existiert
- src/components/EduSetup.ts — 6-Feld sequenzielles Formular (extracted per ADR-014, 210 Zeilen)
- src/components/EduInitDashboard.ts — EduRunner + EduInitDashboard (349 Zeilen)
- src/components/InitDashboard.ts — SynthDoneUI/ReviewUI exportiert, type-Union "lernsituation"
- src/main.ts — ORVEX_EDU_INIT_MODE + lernsituationExists routing + eduResume detection
- PhaseBlockCompact, SynthDoneUI, ReviewUI, PHASE_COLORS, ROUND_SECS, SYNTH_SECS, modelShort nun exportiert
- src/lib/reviewUtils.ts — parseReqs, parseSections, buildRewritePrompt("section")
- src/lib/eduAgents.ts — 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
- src/hooks/useEduInitRunner.ts — 5-Phasen-Edu-State-Machine (vollständig)
- templates/LERNSITUATION.md + AGENT_EDU.md — vorhanden
- 153 Tests total, alle grün; deno check src/main.ts sauber; Build OK

## Bekannte Probleme für Sonnet
1. **get_next_req_block (loop_dev.sh:414):** Nested-^-Bug + keine CONT-Terminierung (ADR-005).
   Fix: Zwei separate AWK-Bedingungen statt einer (REQ-016).
2. **REQ-016 Priority war korrupt** — Validator hat `"- **Priority:** P1"` auf `"P1"` korrigiert.

## Refactoring Check REQ-014
- EduInitDashboard.ts war 567 Zeilen → EduSetup per ADR-014 nach EduSetup.ts extrahiert
- Kein weiteres technisches Debt identifiziert

## Nächste Prioritäten
1. REQ-015 (S): orvex edu-init Subcommand — setzt ORVEX_EDU_INIT_MODE=1, startet TUI
2. REQ-016 (M): loop_dev.sh PROMPT_FILE Auto-Detect (ADR-013 + ADR-005 Fix)
