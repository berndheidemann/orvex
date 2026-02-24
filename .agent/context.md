# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016, RF-001–RF-004 abgeschlossen
- Nächstes REQ: RF-005 (P1, M) — Deduplicate dashboard runner rendering (Depends on RF-003: done)
- Blocker: keine

## Was existiert
- RF-004 done: `src/lib/debateUtils.ts` neu — enthält K_HEADER, makeRounds, formatOthersOutput
- initAgents.ts und eduAgents.ts importieren alle drei aus debateUtils.ts
- Keine Duplikate mehr: je genau 1 Definition in debateUtils.ts
- RF-003 done: `src/lib/reviewFlow.ts` + `src/lib/reviewFlowUtils.ts` neu (ADR-015)
- useInitRunner: 703 → 364 Zeilen; useEduInitRunner: 904 → 480 Zeilen
- 163 Tests total, alle grün
- Alle edu-init Komponenten vollständig: EduSetup, EduInitDashboard, useEduInitRunner

## Architektur-Hinweise (RF-004)
- debateUtils.ts hat keine React-Deps → direkt testbar mit deno test ohne --allow-env
- Exports: K_HEADER (const), makeRounds (function), formatOthersOutput (function)

## Architektur-Hinweise (RF-003)
- `reviewFlowUtils.ts` (keine React-Deps) ist separat von `reviewFlow.ts` (React-Hooks)
  da `deno test` ohne `--allow-env` kein React laden kann

## Bekannte Offene Punkte
- RF-005 (P1, M): Deduplicate dashboard rendering (EduRunner + InitRunner, ~280 Zeilen gemeinsam)
- Pre-existierende Lint-Warnungen in Test-Dateien und Hooks (no-unused-vars, no-import-prefix)

## Refactoring Check RF-004
Keine neuen technischen Schulden (debateUtils.ts 51 Zeilen, klare einzige Verantwortung).
