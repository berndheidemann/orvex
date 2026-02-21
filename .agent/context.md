# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: Phase 1 läuft — REQ-001, REQ-002, REQ-003, REQ-004 abgeschlossen
- Nächstes REQ: REQ-005 (P1, M) — Kinema-TUI Grundgerüst (Deno + Ink)
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator, macOS-kompatibel
  - summarize_log() Funktion inline (REQ-002)
  - trap cleanup EXIT INT TERM (REQ-003)
  - grep -oP → grep -Eo (REQ-001)
  - context.md head-50-Limit mit Warnung bei Überschreitung (REQ-004)
- loop.sh — Original (Referenz, nicht verändern — Scope-Guard)
- AGENT.md, VALIDATOR.md, REFACTOR.md, PRD.md, PLAN.md
- src/ und deno.json: noch nicht vorhanden (erst durch REQ-005)
- .agent/: status.json aktualisiert, logs/ leer

## Bekannte Defekte in loop_dev.sh
- DEF-1: grep -oP → ERLEDIGT (REQ-001)
- DEF-2: scripts/summarize-log.sh → ERLEDIGT (REQ-002)
- DEF-3: trap cleanup ohne EXIT → ERLEDIGT (REQ-003)
- DEF-4: context.md kein head-Limit → ERLEDIGT (REQ-004)

## Erkenntnisse für die nächste Iteration
- LC_NUMERIC=C ist Pflicht für awk printf auf macOS (Locale nutzt Komma als Dezimaltrennzeichen)
- grep -c gibt Exit 1 zurück wenn Count=0 → in Prüfketten mit || true absichern
- summarize_log() nutzt sed-Extraktion für Tests: Funktion muss mit ^summarize_log() beginnen, ^} am Ende
- REQ-005 ist M-Größe → Opus-Planning-Phase erforderlich
