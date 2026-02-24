# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-013 abgeschlossen
- Nächstes REQ: REQ-014 (P1, M) — EduInitDashboard Komponente — Depends on REQ-013
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator + FIFO/Pause-Kontrolle (REQ-009)
- deno.json — Tasks: dev, build, check, test; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Orvex-Header + Dashboard
- src/types.ts — PhaseState.id: `"prd" | "arch" | "didaktik"` (drehbuch entfernt, ADR-003)
- src/lib/phaseRunner.ts — NEU: PhaseSink, PhaseConfig, runDebatePhase; Agent-Typ hier definiert
- src/lib/initAgents.ts — Agent re-exportiert von phaseRunner; runPhase re-export; CONT-guard
- src/lib/reviewUtils.ts — parseSections() + buildRewritePrompt("section") (ADR-007/008)
- src/lib/eduAgents.ts — 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
- src/hooks/useInitRunner.ts — REFACTORED: delegiert an runDebatePhase via PhaseSink
- src/hooks/useEduInitRunner.ts — NEU (REQ-013): 5-Phasen-Edu-State-Machine
  - Phase 0: learning-context.md schreiben (kein Claude-Aufruf)
  - Phase 1: Didaktik-Debate → LERNSITUATION.md; Review (parseSections)
  - Phase 1.5: Single-shot runClaude (buildDrehbuchPrompt) → lernpfad.md
  - Phase 2: EDU-PRD-Debate → PRD.md; Review (parseReqs mit CONT-Support)
  - Phase 3: Arch-Debate → architecture.md; Review (parseAdrs)
  - Nach Abschluss: REQ-000 injizieren (CONT-prefix guard aktiv)
  - Idempotenz: lernsituationExists=true → Phase 1 wird übersprungen
- 153 Tests total, alle grün

## Bekannte Architekturentscheidungen
- ADR-001 (arch.md): phaseRunner.ts als zentrales Orchestrierungsmodul
- ADR-002 (arch.md): PhaseSink als Callback-Interface zwischen Runner und Hook
- ADR-003 (arch.md): "drehbuch" aus PhaseState.id entfernt
- ADR-006 (arch.md): CONT-prefix guard in injectSpikeIntoStatus
- ADR-007/008 (arch.md): parseSections + buildRewritePrompt("section") in reviewUtils.ts

## Erkenntnisse aus REQ-013
- Agent definiert in phaseRunner.ts (nicht initAgents.ts) — Zirkelimporte vermieden
- makeSink() als useCallback in useEduInitRunner — closes über React state setters
- RSUpdater-Typannotation auf synced setters nötig (strict: true in tsconfig)
- Refactoring Check: kein neues technisches Debt
