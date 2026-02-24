# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-017, RF-001–RF-007 abgeschlossen
- Nächstes REQ: RF-008 oder CONT-EXPL-001 (prüfen in PRD)
- Blocker: keine

## Was existiert
- RF-007 done: Viewport-basiertes Rendering der Req-Liste in `Dashboard.ts`
  - maxReqVisible = Math.floor((rows - FEED_OVERHEAD) / 2), min 3
  - Zentriert auf aktiven (in_progress) REQ; ohne aktiven REQ → ans Ende scrollen
  - ↑/↓ Indikatoren zeigen verborgene Einträge an
- RF-006 done: Stale-Counter-Fix in `useEventsReader.ts` + `Dashboard.ts`
  - setCurrentReq(null) bei iteration:end
  - displayIter = Math.max(currentIter, lastCompletedIter) aus iterations.jsonl
  - ActivityFeed bekommt displayIter; auto-scroll-to-bottom bei iter-Wechsel
- RF-005 done: RunnerDashboard in src/components/InitDashboard.ts (ADR-016)
- REQ-017 done: CompletionOverlay in Dashboard.ts
- 163 Tests total, alle grün; deno check clean

## Architektur-Hinweise (RF-006/RF-007)
- FEED_OVERHEAD = 11 (in Dashboard.ts) — wird für maxReqVisible genutzt
- displayIter wird nicht ins useEventsReader exportiert — Berechnung liegt in Dashboard
- ActivityFeed nutzt currentIter-Prop (= displayIter aus Dashboard) für auto-scroll-trigger

## Bekannte Offene Punkte
- RF-008 (Details unbekannt) — PRD lesen
- CONT-EXPL-001 (P2, M) — niederste Priorität

## Refactoring Check RF-006/RF-007 (S-Batch, <5 Dateien)
- Keine Duplikation, keine neuen technischen Schulden.
