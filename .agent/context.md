# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-017, RF-001–RF-008 abgeschlossen
- Nächstes REQ: RF-009 (P1, M) — REQ-Fokus-Modus Detail-Ansicht
- Blocker: keine

## Was existiert
- RF-008 done: Requirements-Liste nach Status gruppiert in `Dashboard.ts`
  - activeEntries (open/in_progress/blocked) oben, doneEntries unten
  - Separator "─── done ───" zwischen Gruppen (nur wenn beide nicht leer)
  - Viewport-Logik (RF-007) operiert auf groupedEntries — Active-REQ-Fokus korrekt
  - hasSeparator guard: separator nur wenn beide Gruppen > 0
- RF-007 done: Viewport-basiertes Rendering der Req-Liste
- RF-006 done: Stale-Counter-Fix + displayIter
- REQ-017 done: CompletionOverlay in Dashboard.ts
- 163 Tests total, alle grün; deno check clean

## Architektur-Hinweise (RF-008)
- groupedEntries ersetzt entries im Viewport (activeEntryIdx, reqViewStart, visibleEntries)
- entries (ungrouped) bleibt für totalReqs/doneReqs Counter und activeEntry/activeReqId
- Separator-Logik im flatMap: globalIdx = reqViewStart + localIdx; separator wenn globalIdx === activeEntries.length
- FEED_OVERHEAD = 11 (in Dashboard.ts) — wird für maxReqVisible genutzt

## Bekannte Offene Punkte
- RF-009 (P1, M) — Two-Mode Dashboard: r-key wechselt Fokus-Modus, Detail-Pane rechts
- CONT-EXPL-001 (P2, M) — niederste Priorität

## Refactoring Check RF-008 (S, <5 Dateien)
- Keine Duplikation, keine neuen technischen Schulden.
