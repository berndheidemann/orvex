# Projektstatus

Kinema — Migration Shell-Orchestrator → Interaktive Terminal-Applikation

## Projektstatus
- Startpunkt: loop.sh (933 Zeilen Bash) als monolithischer Orchestrator
- Phase 1 (Sofort-Fixes) steht an: macOS-Bugs, summarize_log(), trap EXIT, context.md-Länge
- Migrationspfad: Phase 1 → Thin TUI Shell → Event-Schema → Orchestrator-Übernahme

## Was existiert
- loop.sh: vollständiger Orchestrator (macOS-Bugs noch aktiv, siehe PLAN.md DEF-1 bis DEF-4)
- AGENT.md, VALIDATOR.md, REFACTOR.md: Framework-Prompts
- PLAN.md: detaillierter Migrationsplan mit Event-Schema und Tech-Stack-Entscheidungen

## Erkenntnisse für die nächste Iteration
- Lies PLAN.md vollständig — enthält konkrete Bugfixes (grep -Eo, summarize_log, trap, head -50)
- Tech-Stack-Entscheidung gefallen: TypeScript/Deno + Ink (React für Terminals)
- Bash bleibt als Glue-Layer für git und System-Befehle
