# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-001–REQ-011 abgeschlossen
- Nächstes REQ: REQ-012 (P0, M) — Edu-Agent-Personas, Prompt-Builder und Templates
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator + FIFO/Pause-Kontrolle (REQ-009)
  - init_status_json/sync_status_json: AWK-Pattern erkennt jetzt `### (REQ|CONT)-`
  - jq deps-Filter: `select(startswith("REQ-") or startswith("CONT-"))`
- deno.json — Tasks: dev, build, check; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Orvex-Header + Dashboard
- src/types.ts — PhaseState.id: `"prd" | "arch" | "didaktik" | "drehbuch"` (REQ-010)
- src/lib/reviewUtils.ts — parseReqs erkennt CONT-REQs (EXPL/TASK/DIAG/DIFF-001A) (REQ-010)
- src/lib/reviewUtils.test.ts — 5 neue CONT-REQ Tests (107 total)
- src/lib/initAgents.ts — injectSpikeReq korrekt: `/^### REQ-\d+:/m` (kein CONT-Match)
- src/hooks/useStatusPoller.ts, useElapsedTime.ts, useIterationsReader.ts, useKeyboardControls.ts
- src/events.ts — 6 Event-Interfaces + LoopEvent Union-Type

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling

## Erkenntnisse aus REQ-010/011
- CONT-REQ-Pattern: `CONT-[A-Z]+-\d+[A-Z]*` (z.B. CONT-EXPL-001, CONT-DIFF-001A)
- AWK-Patterns in loop_dev.sh sind für German PRD-Feldnamen (Größe, Abhängigkeiten) geschrieben
- injectSpikeReq in initAgents.ts war bereits korrekt — kein Fix nötig

## Nächstes REQ-012
- src/lib/eduAgents.ts anlegen (Personas + Prompt-Builder für Didaktik/EDU-PRD/Drehbuch)
- templates/LERNSITUATION.md und templates/AGENT_EDU.md anlegen
- makeEduPhases(2,2,2) → 3 PhaseState-Objekte mit IDs "didaktik", "prd", "arch"
