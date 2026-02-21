# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-001–REQ-008 + REQ-007 abgeschlossen
- Nächstes REQ: REQ-009 (P2, M) — abhängig von REQ-006 ✓ + REQ-008 ✓
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (REQ-001–004)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Kinema-Header + Dashboard
- src/types.ts — ReqStatus, ReqEntry (mit notes?), IterationEntry, StatusData, STATUS_COLORS
- src/hooks/useStatusPoller.ts — Pollt .agent/status.json alle 2s
- src/hooks/useElapsedTime.ts — Laufzeit-Hook (mm:ss)
- src/hooks/useIterationsReader.ts — Liest .agent/iterations.jsonl, Polling alle 2s (REQ-007)
- src/components/Dashboard.ts — StatusBar + REQ-Liste + BlockedDetail + ActiveReq + Error-Hint
- src/events.ts — 6 Event-Interfaces + LoopEvent Union-Type (REQ-008)

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling
- Pfadauflösung via import.meta.url

## Hinweise für REQ-009 (Event-Stream-Reader, P2, M)
- events.ts ist fertig — LoopEvent als Union-Type verfügbar
- main.ts importiert events.ts noch nicht — das wird REQ-009 tun
- ReqEntry.notes ist optional (string | undefined) — bereits in types.ts

## Bekannte Diskrepanzen
- grep-Verifikationsbefehl in PRD.md für REQ-008 ergibt 12 statt "6":
  Interface-Namen erscheinen sowohl in Deklaration als auch im LoopEvent-Union.
  Dies ist ein Fehler im Verifikationsbefehl, nicht in der Implementierung.
- Refactoring-Check: keine neue Schuld (3 überschaubare Dateien geändert)
