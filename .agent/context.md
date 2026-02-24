# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: 30/30 REQs done — VOLLSTÄNDIG ABGESCHLOSSEN (inkl. RF-010, RF-011)
- Alle offenen REQs implementiert

## Abgeschlossene RF-REQs dieser Iteration
- **RF-010:** `usePrdTitles.ts` regex auf `/^### (REQ-\d+[a-z]?|RF-\d+[a-z]?|CONT-[A-Z]+-\d+[A-Za-z]*): (.+)$/gm` erweitert — konsistent mit `useReqDetails.ts`
- **RF-011:** `makeAddChunk` und `makePhaseSink` in `src/lib/sinkFactory.ts` extrahiert. `useInitRunner` und `useEduInitRunner` nutzen beide die gemeinsamen Factories. Kein lokales `addChunk` mit `useCallback` mehr in Hooks.

## Architektur-Stand
- `src/lib/sinkFactory.ts` — neu erstellt: enthält `makeAddChunk` und `makePhaseSink`
- `src/hooks/useInitRunner.ts` — nutzt sinkFactory statt inline-Sink
- `src/hooks/useEduInitRunner.ts` — nutzt sinkFactory, `useCallback` aus Destructuring entfernt

## Validierungsstatus
- deno check: clean
- Tests: 174/174 pass
- RF-010 AC: Regex korrekt, RF/CONT erkannt, konsistent mit useReqDetails
- RF-011 AC: addChunk in einem Ort, PhaseSink in einem Ort, beide Hooks nutzen Factories, grep = 0

## Nächste Priorität
- Keine weiteren offenen REQs
