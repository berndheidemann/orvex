# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016, RF-001–RF-003 abgeschlossen
- Nächstes REQ: RF-004 (P1, S) — Extract shared debate utilities (keine Deps)
- RF-005 (P1, M) — Depends on RF-003 (jetzt done), also freigegeben
- Blocker: keine

## Was existiert
- RF-003 done: `src/lib/reviewFlow.ts` + `src/lib/reviewFlowUtils.ts` neu (ADR-015)
- `useReviewTarget` hook: alle 8 Callbacks per Review-Target (confirm, skip, advance, openEditor, startTyping, onType, submitRewrite)
- `runReviewSequence`: Async-Helper für synth-done → review flow
- `useSharedEditCallbacks`: Cross-target save/cancel
- useInitRunner: 703 → 364 Zeilen (–48%); useEduInitRunner: 904 → 480 Zeilen (–47%)
- 163 Tests total (153 bestehend + 10 neue reviewFlowUtils Tests), alle grün
- Alle edu-init Komponenten vollständig: EduSetup, EduInitDashboard, useEduInitRunner
- Alle CONT-REQ-Fixes: parseReqs, AWK-Patterns, Validation-Gate, Block-Extraction

## Architektur-Hinweise (RF-003)
- `reviewFlowUtils.ts` (keine React-Deps) ist separat von `reviewFlow.ts` (React-Hooks)
  da `deno test` ohne `--allow-env` kein React laden kann
- Beide Hooks importieren via `reviewFlow.ts`; Return-Typen unverändert (behavioral parity)

## Bekannte Offene Punkte
- RF-004 (P1, S): Extract shared debate utilities (K_HEADER, formatOthersOutput, makeRounds)
- RF-005 (P1, M): Deduplicate dashboard rendering — freigegeben nach RF-003
- Pre-existierende Lint-Warnungen in Test-Dateien und Hooks (no-unused-vars, no-import-prefix)

## Refactoring Check RF-003
Keine neuen technischen Schulden (reviewFlow.ts 252 Zeilen, reviewFlowUtils.ts 64 Zeilen, klare Verantwortlichkeiten).
