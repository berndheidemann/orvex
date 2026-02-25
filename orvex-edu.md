# orvex edu — Plan

## Ziel

Erweiterung von orvex um `orvex edu-init`: ein Workflow zur Erstellung didaktisch wertvoller Lernsituationen als interaktive Webseite.

---

## Neuer Flow: orvex edu-init

```
Phase 0: Lernkontext-Erfassung  (kein Debate)
  Input:  Fach, Thema, Jahrgangsstufe, Vorwissen, bekannte Misconceptions,
          verfügbare Zeit, Heterogenität der Klasse, Lehrplan-Referenz
  Output: learning-context.md

Phase 1: Didaktik-Debate
  Agents: Fachsystematiker · Lernprozess-Advokat · Realitäts-Constraint-Agent
  Output: LERNSITUATION.md
          - Operative Lernziele mit Bloom-Level (Verb + Inhalt + Bedingung + Standard)
          - Backward Design (Assessment zuerst, Inhalte rückwärts planen)
          - Differenzierungsplan (Grund- und Erweiterungsniveau)
          - Content-Typ-zu-Lernziel-Matrix (welcher Aufgabentyp für welchen Bloom-Level)
          - Kognitive Belastungssequenzierung (intrinsische Komplexität pro Konzept)
          - Formative Checkpoints (an welchen Stellen wird Lernstand geprüft)

Phase 1.5: Drehbuch-Synthese  (kein Debate, Writer-Agent)
  Liest: LERNSITUATION.md
  Output: lernpfad.md — konkrete LE-Sequenz in zeitlicher Reihenfolge mit:
          - Zeitangaben pro Abschnitt
          - vorgesehene Content-Typen
          - Aktivierungsphase, Erarbeitung, Sicherung, Transfer

Phase 2: PRD-Debate
  Agents: Fachlehrkraft · Lerndesigner · Didaktik-Analyst
  Liest:  learning-context.md + LERNSITUATION.md + lernpfad.md
  Output: PRD.md mit zwei REQ-Typen:

    CONT-EXPL-NNN   Erklärungstext        (Bloom-Level angegeben)
    CONT-TASK-NNN   Aufgabe/Übung         (Typ: Berechnung / Fallbeispiel / Reflexion)
    CONT-DIAG-NNN   Diagnoseaufgabe       (mappt auf Misconception aus LERNSITUATION.md)
    CONT-DIFF-NNNA  Grundniveau-Variante  (zu einem CONT-EXPL/TASK)
    CONT-DIFF-NNNB  Erweiterungsniveau    (zu einem CONT-EXPL/TASK)
    REQ-NNN         Technische Komponente (Quiz-Baustein, Fortschrittsanzeige, etc.)

  VERBOTEN — Bundle-Notation:
    ### CONT-DIFF-001–012   ← FALSCH: orvex behandelt das als eine atomare REQ.
                               Der Loop weist dieselbe REQ dutzende Iterationen
                               zu, ohne je "done" zu erreichen.

  KORREKT — jede Teilaufgabe als eigene REQ:
    ### CONT-DIFF-001: Challenge Stunde 1 — ...
    ### CONT-DIFF-002: Challenge Stunde 2 — ...
    ...jede mit eigenen Akzeptanzkriterien.

Phase 3: Arch-Debate  (unverändert)
  Output: architecture.md
          (entscheidet u.a. Content-Format: MDX / JSON / Frontmatter-Schema)

orvex (Loop — unverändert)
  Läuft mit AGENT_EDU.md statt AGENT.md  (via PROMPT_FILE env var)
  AGENT_EDU.md liest LERNSITUATION.md als Pflicht in Phase 1 (Orient)
  CONT-REQs → Content QA (faktisch + didaktisch) + Playwright E2E
  REQ-NNN   → normale Implementierung
```

---

## Agent-Personas

### Phase 1: Didaktik-Debate

| Agent | Perspektive | Konfliktpotenzial |
|---|---|---|
| **Fachsystematiker** | Fachliche Korrektheit, vollständige Konzeptsequenz, keine verkürzten Modelle | vs. Zugänglichkeit |
| **Lernprozess-Advokat** | Kognitive Zugänglichkeit, Vorwissensanknüpfung, Misconception-Behandlung, kein Overload | vs. Vollständigkeit |
| **Realitäts-Constraint-Agent** | 45-Minuten-Stunde, heterogene Klasse, Lehrplan-Zwang, Lehrkraft-Workload, institutionelle Grenzen | vs. didaktischer Idealismus |

### Phase 2: PRD-Debate

| Agent | Perspektive |
|---|---|
| **Fachlehrkraft** | Was braucht der Unterricht konkret? Welche Inhalte, welche Tiefe? |
| **Lerndesigner** | Learner Journey, UX der Lernenden, Interaktionsdesign |
| **Didaktik-Analyst** | Vollständigkeit, Akzeptanzkriterien für Content-REQs, Konsistenz mit LERNSITUATION.md |

---

## LERNSITUATION.md — Schema

```markdown
# Lernsituation: [Titel]

## Lernkontext
- Fach / Thema / Jahrgangsstufe
- Vorwissen (konkret und prüfbar)
- Bekannte Misconceptions (mit Beschreibung)
- Curriculare Einbettung
- Verfügbare Zeit

## Lernziele (Bloom-Taxonomie, revidiert)
Operative Formel: Verb + Inhalt + Bedingung + Standard
Beispiel: "Die SuS können die Oxidationszahl eines Elements in einer
Verbindung anhand der Elektronegativität bestimmen (ohne Hilfsmittel,
Fehlerquote < 10%)"

- LZ-001: [Level] — [operatives Lernziel]
- LZ-002: ...

## Assessment-Design (Backward Design)
- Summatives Assessment: Wie wird Zielerreichung nachgewiesen?
- Formative Checkpoints: An welchen Stellen wird Lernstand geprüft?
- Erfolgskriterien für SuS (Rubrics)

## Differenzierung
- Grundniveau: [Beschreibung]
- Erweiterungsniveau: [Beschreibung]
- Unterstützungsmaßnahmen: [Scaffolding-Elemente]

## Kognitive Belastungsanalyse
- Konzepte nach intrinsischer Komplexität geordnet
- Darstellungsformen zur Reduktion extraneous load
- Sequenzierungsprinzip: konzeptuell / prozedural / situiert

## Content-Typ-zu-Lernziel-Matrix
| Lernziel-Typ (Bloom) | Geeignete Content-Typen       | Ungeeignet     |
|----------------------|-------------------------------|----------------|
| L1: Erinnern         | MC, Lückentext                | Fallstudie     |
| L2: Verstehen        | Concept Map, Erklärungs-Text  | MC             |
| L3: Anwenden         | Berechnungsaufgabe, Fallbsp.  | Lückentext     |
| L4: Analysieren      | Fehler-Erkennung, Vergleich   | MC             |
| L5/6: Bewerten       | Reflexion, offene Aufgabe     | Automatisch prüfbar |

## Methodik-Entscheide
- [Begründete Entscheidungen analog zu ADRs in architecture.md]
```

---

## Content-QA: Erweiterte Prüfkriterien

Zusätzlich zur heutigen faktischen Prüfung (Phase 4.5 in AGENT.md):

**Für Erklärungstexte:**
- Lesbarkeitsindex passend zur Jahrgangsstufe?
- Fachbegriffe bei Erstnennung erklärt?
- Vorwissen aktiviert oder nur vorausgesetzt?

**Für Aufgaben:**
- Passt Aufgabentyp zum Bloom-Level des Lernziels?
- MC-Distraktoren: repräsentieren sie typische Misconceptions?
- Gibt es diagnostisches Feedback bei falscher Antwort (nicht nur "falsch")?

**Für Scaffolding-Sequenz:**
- Monoton steigender Schwierigkeitsgrad (kein Niveau-Sprung)?
- Identifizierbarer Aufbau: Einstieg → Erarbeitung → Sicherung → Transfer?

---

## Neue und geänderte Dateien

| Datei | Art | Was |
|---|---|---|
| `src/lib/eduAgents.ts` | neu | EDU-Agent-Personas + Prompt-Builder für alle edu-Phasen |
| `templates/LERNSITUATION.md` | neu | Output-Schema (s.o.) |
| `templates/AGENT_EDU.md` | neu | Loop-Instruktionen für edu-Projekte (liest LERNSITUATION.md in Phase 1) |
| `src/hooks/useEduInitRunner.ts` | neu | Runner für die 4 Phasen (nutzt extrahiertes `runPhase`) |
| `src/components/EduInitDashboard.ts` | neu | TUI-Screen für edu-init |
| `src/lib/initAgents.ts` | edit | `runPhase` als exportierbare Funktion; `lernSituationContent` required (nicht optional) |
| `src/components/InitDashboard.ts` | edit | `ReviewUI` / `SynthDoneUI` Labels parametrisierbar machen |
| `src/types.ts` | edit | `PhaseState.id` um `"didaktik" \| "drehbuch"` erweitern |
| `src/lib/reviewUtils.ts` | edit | `parseReqs` Regex auf `(REQ\|CONT)-` erweitern |
| `loop_dev.sh` | edit | AWK-Pattern auf `(REQ\|CONT)-` erweitern; `injectSpikeReq` Fix |
| `orvex` + `src/main.ts` | edit | `edu-init` Subcommand ergänzen |

**Unverändert:** Dashboard-TUI, `AGENT.md`, `VALIDATOR.md`, `REFACTOR.md`, Loop-Logik

---

## Offene Entscheidungen

- Sprache der edu-Agents: Deutsch oder Englisch? (Mismatch mit bestehenden englischen Prompts)
- Idempotenz: Was passiert bei erneutem `orvex edu-init` wenn `LERNSITUATION.md` bereits existiert?
- `CONT-`-REQs: Dependency auf REQ-000 (Walking Skeleton) — immer, oder konfigurierbar?
