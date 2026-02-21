# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 1 läuft — REQ-001, REQ-002, REQ-003 abgeschlossen
- Nächstes REQ: REQ-004 (P1, S) — context.md head-Limit in loop_dev.sh
- Danach: REQ-005 (P1, M) — Kinema-TUI Grundgerüst (Deno + Ink) [hängt von REQ-001..003]
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel (grep -oP beseitigt)
  - summarize_log() Funktion inline (ersetzt externes scripts/summarize-log.sh)
  - trap cleanup EXIT INT TERM (cleanup idempotent mit rm -f)
- loop.sh — Original (Referenz, nicht verändern — Scope-Guard)
- AGENT.md, VALIDATOR.md, REFACTOR.md, PRD.md, PLAN.md
- src/ und deno.json: noch nicht vorhanden (erst durch REQ-005)
- .agent/: status.json aktualisiert, logs/ leer

## Bekannte Defekte in loop_dev.sh (aus PLAN.md)
- DEF-1: grep -oP → ERLEDIGT (REQ-001)
- DEF-2: scripts/summarize-log.sh → ERLEDIGT (REQ-002)
- DEF-3: trap cleanup ohne EXIT → ERLEDIGT (REQ-003)
- DEF-4: context.md kein head-Limit → OFFEN → REQ-004

## Erkenntnisse für die nächste Iteration
- LC_NUMERIC=C ist Pflicht für awk printf auf macOS (Locale nutzt Komma als Dezimaltrennzeichen)
- grep -c gibt Exit 1 zurück wenn Count=0 → in Prüfketten mit || true absichern
- summarize_log() nutzt sed-Extraktion für Tests: Funktion muss mit ^summarize_log() beginnen, ^} am Ende
