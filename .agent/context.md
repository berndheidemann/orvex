# Projektkontext

> Wird von Sonnet nach jeder Iteration komplett neu geschrieben (max 50 Zeilen).
> Enthält den aktuellen Stand für die nächste Iteration.

## Status
- Projekt: 27/28 REQs done (REQ-000–REQ-017, RF-001–RF-009)
- Validator: 3. Validierung PASS — 0 Reverts, 0 Blocks
- Einziges offenes REQ: CONT-EXPL-001 (P2, M)
- Blocker: keine

## Validierungsergebnis (Iter 010–013)
- Preflight: deno check clean, 174 Tests green, deno task build OK
- Alle 27 done-REQs bestehen ihre Acceptance Criteria
- UJ-001 (edu-init): TUI startet korrekt, EduSetup-Form zeigt 6 Felder
- UJ-002 (Loop nach edu-init): CONT-REQ-Support korrekt verdrahtet
- Log-Analyse: Keine Scope-Guard-Verstöße, keine ignorierten Fehler

## Bekannte Offene Punkte
- CONT-EXPL-001 (P2, M) — einziges offenes REQ, niederste Priorität
- `debateUtils.ts` hat keine dedizierte Test-Datei (RF-004, iter-012)
- `RunnerDashboard` Komponente hat keine Tests (RF-005, iter-013)
- REQ-011 AC#3 bezeichnet `injectSpikeReq` als "bash-Funktion" — ist TypeScript

## Nächste Priorität
- CONT-EXPL-001 implementieren (letztes offenes REQ)
- Optional: Test-Coverage für debateUtils.ts und RunnerDashboard ergänzen
