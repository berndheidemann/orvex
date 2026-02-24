# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: REQ-000–REQ-012 abgeschlossen (REQ-000 war rückständig, jetzt formal done)
- Nächstes REQ: REQ-013 (P1, M) — Depends on REQ-010 + REQ-012 (beide done)
- Blocker: keine

## Was existiert
- loop_dev.sh — Orchestrator + FIFO/Pause-Kontrolle (REQ-009)
- deno.json — Tasks: dev, build, check, test; Dependencies: ink@5, react@18
- src/main.ts — Ink-TUI, zeigt Orvex-Header + Dashboard
- src/types.ts — PhaseState.id: `"prd" | "arch" | "didaktik" | "drehbuch"` (REQ-010)
- src/lib/reviewUtils.ts — parseReqs erkennt CONT-REQs (REQ-010)
- src/lib/initAgents.ts — PRD/Arch Agents + makePhases + buildPrdPrompt/buildArchPrompt
- src/lib/eduAgents.ts — NEU (REQ-012): 6 Edu-Personas, makeEduPhases, 3 Prompt-Builder
  - DIDAKTIK_AGENTS: Fachsystematiker, Lernprozess-Advokat, Realitäts-Constraint-Agent
  - EDU_PRD_AGENTS: Fachlehrkraft, Lerndesigner, Didaktik-Analyst
  - makeEduPhases(didaktikRounds, prdRounds, archRounds) → 3 PhaseState (didaktik, prd, arch)
  - buildDidaktikPrompt / buildDrehbuchPrompt / buildEduPrdPrompt
  - Alle 3 Builder enden mit "Output language: German..."
  - Synthesis-Prompt enthält Bloom, Backward Design, Differenzierung
- templates/LERNSITUATION.md — Output-Schema für Phase-1-Synthese (REQ-012)
- templates/AGENT_EDU.md — AGENT.md-Variante mit Edu-Erweiterungen (REQ-012)
  - Phase 1: zusätzlich LERNSITUATION.md + lernpfad.md lesen
  - Phase 4.5: Bloom-Level-Matching, Lesbarkeitsindex, Misconception-Distraktoren
- 143 Tests total, alle grün

## Bekannte Architekturentscheidungen
- ADR-001: .ts mit createElement statt .tsx/JSX
- ADR-002: node:readline statt Deno.stdin
- ADR-003: Deno.readTextFile + setInterval für Polling
- Gemäß architecture.md: REQ-013 implementiert useEduInitRunner Hook
  - runDebatePhase → phaseRunner.ts extrahieren (ADR-001 in arch.md)
  - PhaseSink interface als Extraktionsgrenze (ADR-002 in arch.md)
  - "drehbuch" aus PhaseState.id entfernen (ADR-003 in arch.md)

## Erkenntnisse aus REQ-012
- eduAgents.ts: formatOthersOutput als privater Helper dupliziert (kleines Debt, kein REQ)
- makeEduPhases: erste Phase status="running", andere "pending" (Pattern aus initAgents.ts)
- buildDrehbuchPrompt: abweichende Signatur (1 Arg) wegen single-shot Synthese — dokumentiert
- Refactoring Check: kein neues technisches Debt

## Erkenntnisse aus REQ-000
- REQ-000 war bereits vollständig implementiert (alle nachfolgenden REQs done)
- status.json hatte es nie formal als done markiert — in dieser Iteration korrigiert
