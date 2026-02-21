# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 2 läuft — REQ-001–REQ-005 abgeschlossen
- Nächstes REQ: REQ-006 (P1, M) — Live-Status-Dashboard
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (REQ-001–004)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, liest stdin zeilenweise, zeigt "Kinema" Header
  - React.createElement statt JSX (.ts nicht .tsx) — deno check kompatibel
  - node:readline für stdin (Ink-Node-Compat-Layer)
  - Zwei-Schichten EOF-Handling: readline close + process.stdin end
  - Exit 0 nach EOF (setTimeout 100ms + unmount + process.exit)
- .agent/: status.json, logs/ leer

## Bekannte Architekturentscheidungen (REQ-005)
- ADR-001: .ts mit createElement statt .tsx/JSX (deno check schlägt mit JSX + npm:react@18 fehl)
- ADR-002: node:readline statt Deno.stdin (Ink nutzt Node-Compat-Layer intern)

## Erkenntnisse für die nächste Iteration (REQ-006)
- REQ-006 braucht .agent/status.json Polling (alle 2s) — Deno.watchFs oder setInterval+Deno.readTextFile
- Ink rendert im Alt-Screen — ANSI-Sequenzen sichtbar wenn stdout kein TTY ist (kein Problem im TUI-Modus)
- Refactoring-Check REQ-005: keine neue Schuld
