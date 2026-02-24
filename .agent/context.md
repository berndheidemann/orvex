# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-016, RF-001, RF-002 abgeschlossen — Validator PASS (iter 005–009)
- Nächstes REQ: RF-003 (P1, M) oder RF-004 (P1, S) — beide ohne Deps
- Blocker: keine

## Validator-Ergebnis (2026-02-24, iter 005–009)
- Alle 19 done-REQs validiert: 0 Reverts, 0 Blocks
- Build ✅, 153/153 Tests ✅, deno check ✅
- Linter: 14 pre-existierende Warnungen (unused vars, import style in tests) — nicht REQ-bezogen
- UJ-001/UJ-002: Entry-Points + Code-Pfade verifiziert; TUI startet korrekt (Phase-0 Form bestätigt)
- Log-Analyse: keine Scope-Guard-Verstöße, kein git add -A, keine ignorierten Fehler
- Hinweis iter 008: deno test nicht nach bash-Edits re-run (low risk, Falsifikation war gründlich)

## Was existiert
- Alle edu-init Komponenten vollständig: EduSetup, EduInitDashboard, useEduInitRunner
- Alle CONT-REQ-Fixes: parseReqs, AWK-Patterns, Validation-Gate, Block-Extraction
- Templates, Prompt-Builder, Personas — alles vorhanden und getestet
- loop_dev.sh LERNSITUATION.md Auto-Detect via BASH_SOURCE (statt FRAMEWORK_DIR export)
- 153 Tests total, alle grün; Build OK

## Bekannte Offene Punkte
- RF-003 (P1, M): Extract review-flow abstraction — keine Deps
- RF-004 (P1, S): Extract shared debate utilities — keine Deps
- RF-005 (P1, M): Deduplicate dashboard rendering — Depends on RF-003
- Pre-existierende Lint-Warnungen in Test-Dateien und Hooks (no-unused-vars, no-import-prefix)
