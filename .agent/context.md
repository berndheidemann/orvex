# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-017, RF-001–RF-009 abgeschlossen
- Nächstes REQ: CONT-EXPL-001 (P2, M) — einziges offenes REQ
- Blocker: keine

## Was existiert
- RF-009 done: REQ-Fokus-Modus im Dashboard
  - `useReqDetails` hook: liest PRD.md, parsed alle REQ/RF/CONT-Blöcke (parseReqBlocks)
  - `ReqDetailPane` Komponente: scrollbarer Detail-Inhalt mit isActive-gating
  - Dashboard: focusMode/focusCursor/focusTarget State; `r`-key togglet Modus
  - ActivityFeed: isActive prop, display:none in focus mode (state preserved)
  - Viewport folgt Cursor in focus mode; inverse Highlight für Cursor-Row
  - Hint-Zeile aktualisiert sich je Modus
  - 174 Tests total, alle grün; deno check clean
- RF-008 done: Requirements-Liste nach Status gruppiert
- RF-007 done: Viewport-basiertes Rendering der Req-Liste
- RF-006 done: Stale-Counter-Fix + displayIter
- REQ-017 done: CompletionOverlay

## Architektur-Hinweise (RF-009)
- display:"none" auf Box hält Komponente gemountet (React-State erhalten)
- useInput mit isActive gating: mehrere useInput-Aufrufe koexistieren in Ink
- parseReqBlocks nutzt matchAll mit globalem Regex für alle Heading-Typen
- focusMode useInput kommt VOR den early-returns (React Hook Rule)

## Bekannte Offene Punkte
- CONT-EXPL-001 (P2, M) — niederste Priorität

## Refactoring Check RF-009 (M, 5 Dateien)
- Keine Duplikation, keine neuen technischen Schulden.
