# Architektur-Entscheidungen

## ADR-001: TypeScript/Deno + Ink als TUI-Stack (2026-02-21, PLAN.md)

**Kontext:** Migration von loop.sh (Bash) zu einer interaktiven Terminal-Applikation.
**Entscheidung:** TypeScript/Deno als Orchestrator, Ink (React für Terminals) als TUI-Layer.
**Begründung:** Kein node_modules, eingebauter TypeScript-Support, Permission-System für Agent-Sandboxing. Claude/MCP-Ökosystem ist TypeScript-first.
**Konsequenzen:** Bash bleibt dauerhaft als Glue-Layer für git-Operationen und System-Befehle.

## ADR-002: Vierphasiger Migrationspfad (2026-02-21, PLAN.md)

**Kontext:** Bestehender loop.sh-Orchestrator hat strukturelle Defekte und kann nicht inkrementell gefixt werden.
**Entscheidung:** Phase 1 (Sofort-Fixes) → Phase 2 (Thin TUI Shell, passive) → Phase 3 (Event-Schema) → Phase 4 (Orchestrator-Übernahme).
**Begründung:** Thin TUI zuerst: sofortiger DX-Gewinn ohne Orchestrator-Änderung. Event-Schema als stabiles Protokoll über alle Phasen.
**Konsequenzen:** Das Event-Schema (6 TypeScript-Typen) ist das stabile Protokoll der gesamten Migration — einmal definiert, überlebt es alle vier Phasen.
