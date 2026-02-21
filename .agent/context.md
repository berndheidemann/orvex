# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 2 läuft — REQ-001–REQ-006 abgeschlossen, Validator bestätigt
- Nächstes REQ: REQ-008 (P1, S) — Event-Schema TypeScript-Typen
- Blocker: keine

## Validierungsergebnis (nach iter-004)
- Preflight: pass (bash -n, deno task check beide Exit 0)
- REQ-001 bis REQ-006: alle Akzeptanzkriterien erfüllt, keine Korrekturen
- Gesamtkosten iter-001 bis iter-004: $8.08

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (REQ-001–004)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Kinema-Header + Dashboard (kein stdin-Reader)
- src/types.ts — ReqStatus, ReqEntry, StatusData, STATUS_COLORS
- src/hooks/useStatusPoller.ts — Pollt .agent/status.json alle 2s
- src/hooks/useElapsedTime.ts — Laufzeit-Hook (mm:ss)
- src/components/Dashboard.ts — StatusBar + REQ-Liste + ActiveReq + Error-Hint

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling
- Pfadauflösung via import.meta.url

## Hinweise für REQ-008
- src/events.ts mit 6 Interfaces erstellen — muss von main.ts importiert werden
- Kosten ($0.00) sind Platzhalter — werden erst mit Event-Schema befüllt

## Diskrepanz beachten
- PRD.md zeigt REQ-007/008/009 als "in_progress", status.json zeigt "open" — bitte PRD.md korrigieren
