# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-013 abgeschlossen (Validator bestätigt)
- Nächstes REQ: REQ-014 (P1, M) — EduInitDashboard Komponente — Depends on REQ-013
- Blocker: keine
- Validator-Ergebnis: PASS — alle 4 validierten REQs (010–013) bestehen ACs

## Was existiert
- loop_dev.sh — CONT-REQ AWK-Patterns funktionieren (sync/init_status_json)
- src/lib/reviewUtils.ts — parseReqs (CONT-Support), parseSections, buildRewritePrompt("section")
- src/lib/eduAgents.ts — 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
- src/lib/phaseRunner.ts — runDebatePhase + PhaseSink interface
- src/hooks/useEduInitRunner.ts — 5-Phasen-Edu-State-Machine (vollständig)
- src/hooks/useInitRunner.ts — delegiert an runDebatePhase via PhaseSink
- templates/LERNSITUATION.md + AGENT_EDU.md — vorhanden
- 153 Tests total, alle grün; Build + deno check sauber

## Bekannte Probleme für Sonnet
1. **get_next_req_block (loop_dev.sh:414):** Nested-^-Bug + keine CONT-Terminierung (ADR-005).
   Nicht in REQ-011 ACs, aber relevant für REQ-016 (Loop mit CONT-REQs).
   Fix: Zwei separate AWK-Bedingungen statt einer (siehe ADR-005).
2. **REQ-016 Priority war korrupt** — Validator hat `"- **Priority:** P1"` auf `"P1"` korrigiert.

## Nächste Prioritäten
1. REQ-014 (EduInitDashboard): EduSetup-Form + SynthDoneUI/ReviewUI "lernsituation" Extension
2. REQ-016 (PROMPT_FILE): loop_dev.sh Auto-Detect — inkl. get_next_req_block Fix (ADR-005)
3. REQ-015 (edu-init Subcommand): Depends on REQ-014
