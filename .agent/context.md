# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 2 läuft — REQ-001–REQ-008 abgeschlossen
- Nächstes REQ: REQ-009 (P2, M) — abhängig von REQ-006 ✓ + REQ-008 ✓
- Blocker: keine

## Validierungsergebnis (nach iter-004)
- Preflight: pass (bash -n, deno task check beide Exit 0)
- REQ-001 bis REQ-006: alle Akzeptanzkriterien erfüllt, keine Korrekturen

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (REQ-001–004)
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Kinema-Header + Dashboard (kein stdin-Reader)
- src/types.ts — ReqStatus, ReqEntry, StatusData, STATUS_COLORS
- src/hooks/useStatusPoller.ts — Pollt .agent/status.json alle 2s
- src/hooks/useElapsedTime.ts — Laufzeit-Hook (mm:ss)
- src/components/Dashboard.ts — StatusBar + REQ-Liste + ActiveReq + Error-Hint
- src/events.ts — 6 Event-Interfaces + LoopEvent Union-Type (REQ-008)

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling
- Pfadauflösung via import.meta.url

## Hinweise für REQ-009 (Event-Stream-Reader, P2, M)
- events.ts ist fertig — LoopEvent als Union-Type verfügbar
- main.ts importiert events.ts noch nicht — das wird REQ-009 tun
- PRD.md korrigieren: REQ-007/008 stehen noch als "in_progress" — bitte korrigieren

## Bekannte Diskrepanzen
- grep-Verifikationsbefehl in PRD.md für REQ-008 ergibt 12 statt "6":
  Interface-Namen erscheinen sowohl in Deklaration als auch im LoopEvent-Union.
  Dies ist ein Fehler im Verifikationsbefehl, nicht in der Implementierung.
- Refactoring-Check: keine neue Schuld (REQ-008 ist nur 1 neue Datei, 60 Zeilen)
