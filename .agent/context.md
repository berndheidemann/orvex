# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 2 läuft — REQ-001–REQ-006 abgeschlossen
- Nächstes REQ: REQ-008 (P1, S) — Event-Schema TypeScript-Typen (REQ-007 ist P2, REQ-008 hat Vorrang)
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (REQ-001–004)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Kinema-Header + Dashboard (kein stdin-Reader mehr)
- src/types.ts — ReqStatus, ReqEntry, StatusData, STATUS_COLORS
- src/hooks/useStatusPoller.ts — Pollt .agent/status.json alle 2s via Deno.readTextFile
- src/hooks/useElapsedTime.ts — Laufzeit-Hook (mm:ss, sekündlich incrementiert)
- src/components/Dashboard.ts — StatusBar + REQ-Liste + ActiveReq-Anzeige + Error-Hint
- .agent/: status.json (REQ-Daten), logs/ leer

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX (deno check schlägt mit JSX + npm:react@18 fehl)
- ADR-002: node:readline statt Deno.stdin (Ink nutzt Node-Compat-Layer intern)
- ADR-003: Deno.readTextFile + setInterval für Polling (watchFs unzuverlässig bei atomic writes)
- Pfadauflösung via import.meta.url (portabler als Deno.cwd())

## Erkenntnisse für die nächste Iteration (REQ-008)
- REQ-008 erstellt src/events.ts mit 6 Interfaces — unabhängig von src/components/
- deno task check prüft src/main.ts transitiv — neue Dateien müssen von main.ts importiert werden
- Kosten ($0.00) sind Platzhalter — werden erst mit REQ-008 Event-Schema befüllt
- Refactoring-Check REQ-006: keine neue Schuld
