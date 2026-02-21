# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-001–REQ-009 abgeschlossen
- Nächstes REQ: keins offen (PRD enthält REQ-001–REQ-009, alle done)
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator + FIFO/Pause-Kontrolle (REQ-009)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Kinema-Header + Dashboard
- src/types.ts — ReqStatus, ReqEntry, IterationEntry, StatusData, STATUS_COLORS
- src/hooks/useStatusPoller.ts — Pollt .agent/status.json alle 2s
- src/hooks/useElapsedTime.ts — Laufzeit-Hook (mm:ss)
- src/hooks/useIterationsReader.ts — Liest .agent/iterations.jsonl (REQ-007)
- src/hooks/useKeyboardControls.ts — p/s/e Tastatur-Steuerung + Filesystem-Signale (REQ-009)
- src/components/Dashboard.ts — Dashboard mit Keyboard-Controls-UI
- src/events.ts — 6 Event-Interfaces + LoopEvent Union-Type (REQ-008)

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling

## Erkenntnisse aus REQ-009
- macOS-FIFOs: `read -t 0 < fifo` blockiert wegen open()-Syscall
- Lösung: `read -t 1 <> fifo` (read-write mode öffnet FIFO ohne zu blockieren)
- TUI schreibt via `bash -c "echo skip > fifo"` asynchron (Deno.Command.spawn())
- Diese Schreiboperation blockiert im Hintergrund bis loop_dev.sh liest — akzeptabel

## Refactoring-Check REQ-009: keine neue Schuld
