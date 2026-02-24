# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-017, RF-001–RF-005 abgeschlossen
- Nächstes REQ: RF-006 oder RF-007 (beide P1, size S, keine deps)
- Blocker: keine

## Was existiert
- REQ-017 done: `CompletionOverlay` in `src/components/Dashboard.ts`
  - 6 Stop-Kinds (all_done/max_iterations/timeout/low_activity/no_actionable_req/unknown)
  - Summary-Zeile: Laufzeit · Kosten · Iterationen · REQ-Fortschritt
  - Haiku-Diagnose via `runClaude` (guard-Flag, AbortController, stiller Fallback)
  - `q` → `exit()` aus `useApp()` → sauberer TUI-Exit
  - `detectStopKind()` filtert events[] nach letztem system:event
- RF-005 done: `RunnerDashboard` in `src/components/InitDashboard.ts` (ADR-016)
- RF-004 done: `src/lib/debateUtils.ts`
- RF-003 done: `src/lib/reviewFlow.ts` + `reviewFlowUtils.ts` (ADR-015)
- 163 Tests total, alle grün; deno check clean

## Architektur-Hinweise (REQ-017)
- Overlay: `loopRunning === false && currentIter > 0` → early return vor editingContext
- Kostenberechnung (entries, historicalCost, costStr, totalReqs, doneReqs) jetzt VOR allen
  early returns in Dashboard() — ermöglicht Overlay-Zugriff auf diese Werte
- "Loop gestoppt" Zeile aus normalem Dashboard entfernt (Overlay ersetzt es)
- useApp().exit() statt Deno.exit(0) → sauberer TUI-Teardown via main.ts cleanup()
- HAIKU_MODEL = "claude-haiku-4-5-20251001"

## Bekannte Offene Punkte
- RF-006: Fix stale iter counter and currentReq in Dashboard (P1, S)
- RF-007: Details unbekannt — PRD lesen

## Refactoring Check REQ-017
- Dashboard.ts: ~150 neue Zeilen (Overlay + Helpers). Klare Verantwortung.
- Keine Duplikation, kein neues technisches Schulden.
