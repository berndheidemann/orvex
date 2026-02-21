# Erkenntnisse

### 2026-02-21 — macOS grep -P nicht verfügbar

BSD grep unterstützt kein `-P` (PCRE). Überall `grep -oP` durch `grep -Eo` ersetzen.
Lookbehind-Patterns: in zwei grep-Aufrufe aufteilen (erst Kontext, dann Zahl extrahieren).
Betrifft: loop.sh Zeilen 444, 896, 912.

### 2026-02-21 — summarize-log.sh fehlte

loop.sh Zeile 374 rief ein nicht existierendes Skript auf → Validator blind.
Fix: summarize_log()-Funktion inline in loop.sh (jq-basiert, siehe PLAN.md DEF-2).
