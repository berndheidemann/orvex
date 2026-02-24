# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016, RF-001–RF-005 abgeschlossen
- Nächstes REQ: keines bekannt (alle offenen REQs erledigt)
- Blocker: keine

## Was existiert
- RF-005 done: `RunnerDashboard` Komponente in `src/components/InitDashboard.ts` (ADR-016)
  - EduRunner: ~312 → ~145 Zeilen (–53%)
  - InitRunner: ~320 → ~165 Zeilen (–48%)
  - Shared: timer effects, layout computation, done/error screens, split-pane layout
- RF-004 done: `src/lib/debateUtils.ts` — K_HEADER, makeRounds, formatOthersOutput
- RF-003 done: `src/lib/reviewFlow.ts` + `src/lib/reviewFlowUtils.ts` (ADR-015)
- 163 Tests total, alle grün
- deno check src/main.ts clean

## Architektur-Hinweise (RF-005)
- RunnerDashboard Props: phases, liveLines, agentStreams, activeLabel, agentWarnLevel, done,
  error, subtitle, descLabel, descText, model, doneMessage, onDone, emptyStateLines?, footer?
- EduInitDashboard.ts importiert nur: useInput (ink), RunnerDashboard/SynthDoneUI/ReviewUI
  (InitDashboard.ts), useEduInitRunner, useRawBackspace, ReviewEditor, EduSetup
- InitDashboard.ts exportiert neu: RunnerDashboard, RunnerDashboardProps

## Bekannte Offene Punkte
- Keine offenen REQs in status.json
- Pre-existierende Lint-Warnungen in Test-Dateien und Hooks (no-unused-vars, no-import-prefix)

## Refactoring Check RF-005
- InitDashboard.ts: 786 Zeilen, klare Sektionen (PhaseBlockCompact, SynthDoneUI, ReviewUI,
  RunnerDashboard, InitRunner, InitDashboard). Keine Duplikation.
- EduInitDashboard.ts: 207 Zeilen, fokussiert.
- Keine neuen technischen Schulden.
