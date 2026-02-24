# PRD — orvex edu-init

> Erweiterung von orvex um einen `orvex edu-init` Workflow zur Erstellung didaktisch wertvoller Lernsituationen als interaktive Webseite.

---

## User Journeys

### UJ-001: Lehrkraft erstellt eine Lernsituation von Grund auf

**Goal:** Eine Lehrkraft möchte interaktives Unterrichtsmaterial zu einem Thema erstellen.

1. Lehrkraft startet `orvex edu-init` im Projektverzeichnis
2. Phase-0-Screen erscheint: Eingabe von Fach, Thema, Jahrgangsstufe, Vorwissen, verfügbarer Zeit
3. Didaktik-Debate läuft (Fachsystematiker · Lernprozess-Advokat · Realitäts-Constraint-Agent) → LERNSITUATION.md
4. Review-Screen: Lehrkraft prüft und editiert LERNSITUATION.md abschnittsweise
5. Drehbuch-Synthese läuft → lernpfad.md
6. EDU-PRD-Debate (Fachlehrkraft · Lerndesigner · Didaktik-Analyst) → PRD.md mit CONT-REQs + REQ-NNN
7. Review-Screen: PRD wird abschnittsweise geprüft
8. Arch-Debate → architecture.md
9. TUI zeigt "Setup complete" → `orvex` starten → Loop implementiert alles

**Error case:** Wenn `LERNSITUATION.md` bereits existiert, überspringt edu-init Phase 1 und bietet Review der bestehenden Datei an.

### UJ-002: Lehrkraft startet Loop nach edu-init

**Goal:** Nach edu-init soll `orvex` den Content und die technischen Komponenten implementieren.

1. PRD.md enthält CONT-REQs (z.B. `CONT-EXPL-001`) und REQ-NNN
2. `.agent/status.json` enthält alle REQs inkl. CONT-REQs als `open`
3. `orvex` startet → Loop verarbeitet CONT-REQs und REQ-NNN identisch
4. CONT-REQs generieren Content-Dateien → Content QA prüft faktische + didaktische Korrektheit
5. REQ-NNN bauen technische Komponenten → Playwright E2E-Tests

**Error case:** Ein CONT-REQ produziert inhaltlich falschen Content → Content QA schlägt an → REQ wird `blocked`, Lehrkraft prüft und korrigiert manuell.

---

## Requirements

### REQ-000: Walking Skeleton — Technical Foundation

- **Status:** done
- **Priority:** P0
- **Size:** M
- **Depends on:** ---

#### Description
Build the complete technical foundation according to `architecture.md`. No business content — infrastructure only: all dependencies installed, build system, linter, test runner configured, development server running, a minimal E2E layer through all architectural layers (e.g. a Hello-World endpoint that executes a DB query and is displayed in the frontend — without business logic).

#### Acceptance Criteria
- [x] All dependencies installed, no version conflicts
- [x] Build successful (no errors, no unresolved imports)
- [x] Linter clean (no errors)
- [x] Test runner starts and passes (0 failures)
- [x] Development server starts without errors
- [x] Minimal E2E layer works: one request passes through all layers to a response

#### Verification
Derive from `architecture.md` — build command green, test runner green, dev server responds.

---

### REQ-010: TypeScript-Fixes für CONT-REQ-Support

- **Status:** done
- **Priority:** P0
- **Size:** S
- **Depends on:** ---

#### Description
Zwei TypeScript-Dateien müssen erweitert werden, damit CONT-REQs korrekt erkannt und verarbeitet werden. `parseReqs` in `src/lib/reviewUtils.ts` filtert aktuell nur `### REQ-\d+`-Abschnitte — CONT-REQs (z.B. `### CONT-EXPL-001:`) werden im PRD-Review unsichtbar. Zusätzlich wird in `src/types.ts` der `PhaseState.id`-Typ um edu-spezifische Phase-IDs erweitert, die für `useEduInitRunner` benötigt werden.

#### Acceptance Criteria
- [x] `parseReqs` erkennt `### CONT-EXPL-001: Titel` und gibt Item mit `id: "CONT-EXPL-001"` zurück
- [x] `parseReqs` erkennt `### CONT-TASK-001:`, `### CONT-DIAG-001:`, `### CONT-DIFF-001A:` korrekt
- [x] `parseReqs("### REQ-001: Titel\n...")` funktioniert weiterhin unverändert
- [x] `PhaseState.id` in `types.ts` akzeptiert `"didaktik" | "drehbuch"` zusätzlich zu `"prd" | "arch"`
- [x] Alle bestehenden Tests in `src/` laufen weiterhin grün
- [x] `deno check src/main.ts` läuft fehlerfrei durch

#### Verification
`deno check src/main.ts` → exit code 0
`deno test src/` → alle Tests grün

---

### REQ-011: loop_dev.sh Fixes für CONT-REQ-Support

- **Status:** done
- **Priority:** P0
- **Size:** S
- **Depends on:** ---

#### Description
`loop_dev.sh` hat zwei Stellen, die CONT-REQs nicht kennen: (1) Die AWK-Logik in `sync_status_json` und `init_status_json` filtert auf `/^### REQ-/` — CONT-REQs landen nie in `status.json` und werden vom Loop nie verarbeitet. (2) `injectSpikeReq` sucht die Einfügeposition via dem ersten `/^### REQ-\d+:/` Match — mit CONT-REQs vor dem ersten REQ-NNN wird REQ-000 zwischen CONT-Abschnitten eingefügt statt vor allen REQ-NNN.

#### Acceptance Criteria
- [x] AWK-Pattern in `sync_status_json` matcht `### CONT-EXPL-001:`, `### CONT-TASK-001:`, `### CONT-DIAG-001:`, `### CONT-DIFF-001A:` und `### REQ-001:`
- [x] AWK-Pattern in `init_status_json` identisch erweitert
- [x] `injectSpikeReq` (bash-Funktion) fügt REQ-000 vor dem ersten `### REQ-\d+`-Abschnitt ein — nicht vor CONT-Abschnitten
- [x] Test: PRD.md mit CONT-REQs (inkl. CONT-DIFF mit Buchstaben-Suffix) vor REQ-001 → `init_status_json` erzeugt `status.json` mit allen CONT- und REQ-Einträgen; REQ-000 steht korrekt vor REQ-001 im PRD

#### Verification
Manueller Test mit Test-PRD:
```bash
echo -e "### CONT-EXPL-001: Test\n\n### CONT-DIFF-001A: Test\n\n### REQ-001: Test" > /tmp/test_prd.md
# AWK-Pattern muss alle drei Zeilen matchen
grep -E "^### (REQ|CONT)-" /tmp/test_prd.md | wc -l  # → 3
```

---

### REQ-012: Edu-Agent-Personas, Prompt-Builder und Templates

- **Status:** done
- **Priority:** P0
- **Size:** M
- **Depends on:** ---

#### Description
Kernstück des edu-init Flows: neue Agent-Personas mit echtem didaktischem Konfliktpotenzial, Prompt-Builder für drei Debate-Phasen und zwei neue Template-Dateien.

**`src/lib/eduAgents.ts` exportiert:**

Phase 1 Agents (Didaktik-Debate):
- `Fachsystematiker`: fachliche Korrektheit und Vollständigkeit, logisch aufbauende Konzeptsequenz, gegen verkürzte Modelle
- `Lernprozess-Advokat`: kognitive Zugänglichkeit, Vorwissensanknüpfung, Misconception-Behandlung, gegen Overload
- `Realitäts-Constraint-Agent`: 45-Minuten-Stunde, heterogene Klasse, Lehrplan-Zwang, Lehrkraft-Workload

Phase 2 Agents (EDU-PRD-Debate):
- `Fachlehrkraft`, `Lerndesigner`, `Didaktik-Analyst`

Prompt-Builder:
- `buildDidaktikPrompt(roundIdx, agentIdx, lernkontext, allOutputs, numRounds)` — für Phase 1 Debate
- `buildDrehbuchPrompt(lernsituationContent)` — für Phase 1.5 Synthese (einmaliger Aufruf, kein Debate). Output: `lernpfad.md` mit konkreter LE-Sequenz, Zeitplan, Content-Typ pro Abschnitt
- `buildEduPrdPrompt(roundIdx, agentIdx, combinedContext, allOutputs, numRounds)` — für Phase 2 Debate; `combinedContext` = learning-context.md + LERNSITUATION.md + lernpfad.md
- `makeEduPhases(didaktikRounds, prdRounds, archRounds)` — gibt Array mit 3 `PhaseState`-Objekten zurück (IDs: `"didaktik"`, `"prd"`, `"arch"`)

**Ausgabesprache:** Alle drei Prompt-Builder-Funktionen enthalten am Ende explizit: `"Output language: German. All generated content must be written in German."` Instruktionssprache der Prompts bleibt Englisch.

Phase 1 Synthesis-Prompt erzwingt LERNSITUATION.md im definierten Schema:
- Operative Lernziele mit Bloom-Level (Verb + Inhalt + Bedingung)
- Backward Design (Assessment-Design vor Inhalten)
- Differenzierungsplan (Grund- und Erweiterungsniveau)
- Content-Typ-zu-Lernziel-Matrix

**Neue Template-Dateien:**
- `templates/LERNSITUATION.md` — Output-Schema-Dokumentation
- `templates/AGENT_EDU.md` — AGENT.md-Variante mit zwei Erweiterungen gegenüber AGENT.md:
  1. Phase 1 (Orient): zusätzlich `LERNSITUATION.md` lesen
  2. Phase 4.5 (Content QA): erweiterte didaktische Prüfkriterien für CONT-REQs:
     - Erklärungstexte: Lesbarkeitsindex passend zur Jahrgangsstufe, Fachbegriffe bei Erstnennung erklärt, Vorwissen aktiviert statt vorausgesetzt
     - Aufgaben: Aufgabentyp passend zum Bloom-Level des Lernziels, MC-Distraktoren repräsentieren typische Misconceptions, diagnostisches Feedback bei falscher Antwort
     - Scaffolding-Sequenz: monoton steigender Schwierigkeitsgrad, erkennbarer Aufbau (Einstieg → Erarbeitung → Sicherung → Transfer)

#### Acceptance Criteria
- [x] `src/lib/eduAgents.ts` exportiert alle genannten Symbole
- [x] `makeEduPhases(2, 2, 2)` gibt Array mit 3 PhaseState-Objekten zurück, IDs: `"didaktik"`, `"prd"`, `"arch"`
- [x] `buildDidaktikPrompt(0, 0, "Fach: Chemie...", [], 2)` gibt nicht-leeren String zurück
- [x] `buildDrehbuchPrompt("# Lernsituation...")` gibt Prompt-String zurück
- [x] `buildEduPrdPrompt(0, 0, "...", [], 2)` gibt Prompt-String zurück
- [x] Phase-1-Synthesis-Prompt enthält explizit: "Bloom", "Backward Design", "Differenzierung"
- [x] Alle drei Prompt-Builder-Funktionen enthalten "Output language: German"
- [x] `templates/LERNSITUATION.md` und `templates/AGENT_EDU.md` existieren
- [x] `templates/AGENT_EDU.md` enthält erweiterte Phase-4.5-Prüfkriterien (Bloom-Level-Matching, Lesbarkeitsindex, Misconception-Distraktoren)
- [x] `deno check src/main.ts` fehlerfrei

#### Verification
`deno check src/main.ts` → exit code 0
`ls templates/LERNSITUATION.md templates/AGENT_EDU.md` → beide vorhanden

---

### REQ-013: useEduInitRunner Hook

- **Status:** done
- **Priority:** P1
- **Size:** M
- **Depends on:** REQ-010, REQ-012

#### Description
React-Hook für den 5-Phasen edu-init Flow. Analog zu `useInitRunner`, aber mit fünf Phasen:

- **Phase 0**: Lernkontext-Erfassung — kein Claude-Aufruf, Eingabedaten in `learning-context.md` schreiben
- **Phase 1**: Didaktik-Debate (N Runden, `DIDAKTIK_AGENTS`) → `LERNSITUATION.md`; danach Review
- **Phase 1.5**: Drehbuch-Synthese (einmaliger `buildDrehbuchPrompt`-Aufruf) → `lernpfad.md`
- **Phase 2**: EDU-PRD-Debate (N Runden, `EDU_PRD_AGENTS`, Kontext = learning-context.md + LERNSITUATION.md + lernpfad.md) → `PRD.md`; danach Review (nutzt erweitertes `parseReqs` für CONT-REQs)
- **Phase 3**: Arch-Debate (bestehende `ARCH_AGENTS`, unverändert) → `architecture.md`; danach Review

**runPhase:** Hook nutzt `runPhase` als exportierte Funktion aus `initAgents.ts` — keine Kopie. `initAgents.ts` muss `runPhase` zusätzlich als named export bereitstellen (minimale Änderung, kein Refactoring der bestehenden Logik).

Idempotenz: Wenn `LERNSITUATION.md` bereits existiert, wird Phase 1 übersprungen → Review wird angeboten.

Nach Abschluss: REQ-000-Walking-Skeleton wird in PRD.md + status.json injiziert (Funktion aus `initAgents.ts` wiederverwenden).

**CONT-REQ / REQ-000-Dependency:** CONT-REQs erhalten keine automatische `Depends on: REQ-000`. Sie können parallel zum Walking Skeleton implementiert werden, da Content-Dateien keine technische Infrastruktur voraussetzen. Technische REQ-NNN, die CONT-REQs konsumieren, tragen die Dependency selbst.

#### Acceptance Criteria
- [x] `src/hooks/useEduInitRunner.ts` exportiert `useEduInitRunner(config)` Hook
- [x] Hook gibt State zurück mit: `phases` (3 PhaseStates für "didaktik"/"prd"/"arch"), `liveLines`, `done`, `error`, `lernSituationReview`, `prdReview`, `archReview`, `awaitingConfirm`
- [x] Hook importiert `runPhase` aus `initAgents.ts` (kein Duplicate)
- [x] `initAgents.ts` exportiert `runPhase` als named export ohne bestehende Funktionalität zu ändern
- [x] Nach vollständigem Durchlauf existieren: `learning-context.md`, `LERNSITUATION.md`, `lernpfad.md`, `PRD.md`, `.agent/architecture.md`, `.agent/status.json`
- [x] Wenn `LERNSITUATION.md` bei Start existiert: Phase 1 wird übersprungen, Review der bestehenden Datei wird angeboten
- [x] CONT-REQs in PRD.md werden korrekt in `parseReqs`-Review-Items umgewandelt (abhängig von REQ-010)
- [x] Generierte CONT-REQs in PRD.md haben kein `Depends on: REQ-000`
- [x] `deno check src/main.ts` fehlerfrei

#### Verification
`deno check src/main.ts` → exit code 0

---

### REQ-014: EduInitDashboard Komponente

- **Status:** done
- **Priority:** P1
- **Size:** M
- **Depends on:** REQ-013

#### Description
TUI-Screen für den edu-init Flow. Nutzt `useEduInitRunner` und zeigt alle Phasen.

**Phase-0-Screen** (`EduSetup`-Komponente): Sequenzielles Formular mit Feldern:
1. Fach (Pflicht)
2. Thema (Pflicht)
3. Jahrgangsstufe (Pflicht)
4. Vorwissen der Schüler — konkret (Pflicht)
5. Verfügbare Zeit in Minuten (Pflicht)
6. Heterogenität / besondere Anforderungen (optional, Enter überspringt)

Enter wechselt zum nächsten Feld. Nach dem letzten Feld: Zusammenfassung + Bestätigung.

**Debate-Screens**: Zeigt Phase-Fortschritt analog zu `PhaseBlockCompact` in `InitDashboard.ts`.

**SynthDone + Review**: `SynthDoneUI` und `ReviewUI` aus `InitDashboard.ts` werden für neue Typen parametrisiert. Minimale Änderung: `type`-Union um `"lernsituation"` erweitern, Labels konfigurierbar machen. Kein Neubau der Komponenten.

**Review für LERNSITUATION.md**: Abschnitte werden via Heading-Parsing erkannt (`## `-Headings als Sektionsgrenzen).

#### Acceptance Criteria
- [x] `src/components/EduInitDashboard.ts` exportiert `EduInitDashboard`
- [x] Phase-0-Screen zeigt alle 6 Felder sequenziell, Enter wechselt zum nächsten
- [x] Nach Pflichtfeld-Abbruch (leerer Enter bei Pflichtfeld): Fehlermeldung, kein Weiterschalten
- [x] Debate-Screens zeigen Agent-Status mit Fortschrittsbalken
- [x] SynthDone-Screen nach Phase 1 zeigt LERNSITUATION.md-Inhalt scrollbar (↑/↓)
- [x] Review-Screen für LERNSITUATION.md zeigt Abschnitte (via `## `Heading-Parsing)
- [x] `SynthDoneUI` in `InitDashboard.ts` akzeptiert `type: "prd" | "arch" | "lernsituation"` ohne TypeScript-Fehler
- [x] `deno check src/main.ts` fehlerfrei

#### Verification
`deno check src/main.ts` → exit code 0

---

### REQ-015: edu-init Subcommand + Binary

- **Status:** done
- **Priority:** P1
- **Size:** S
- **Depends on:** REQ-014

#### Description
Integration in den orvex Entry-Point und Neucompilierung.

`orvex` Bash-Script: `edu-init` als neuer Subcommand. Validiert dass das Verzeichnis ein Git-Repo ist (wie `init`). Startet TUI mit `--edu-init` Flag statt `--init`.

`src/main.ts`: App-State-Machine erkennt `--edu-init` Arg und rendert `EduInitDashboard` statt `InitDashboard`. `orvex init` und `orvex` (Loop) bleiben unverändert.

`deno task build` → neues `orvex-tui` Binary.

#### Acceptance Criteria
- [x] `./orvex edu-init` startet ohne Fehler und zeigt Phase-0-Input-Screen (EduSetup)
- [x] `./orvex init` startet weiterhin unverändert (InitDashboard mit InitSetup)
- [x] `./orvex` (ohne Subcommand) startet Loop weiterhin unverändert
- [x] `deno task build` läuft ohne Fehler durch
- [x] Produziertes `orvex-tui` Binary startet mit `--edu-init` und zeigt Phase-0-Screen

#### Verification
`deno task build` → exit code 0
`./orvex-tui --edu-init` → zeigt EduSetup-Screen (manuell prüfen)
`./orvex-tui --init` → zeigt bestehenden InitSetup-Screen unverändert

---

### REQ-016: PROMPT_FILE-Mechanismus für Edu-Loop

- **Status:** open
- **Priority:** P1
- **Size:** S
- **Depends on:** REQ-012

#### Description
Wenn `orvex` (Loop, kein Subcommand) in einem Projektverzeichnis mit `LERNSITUATION.md` gestartet wird, soll `loop_dev.sh` automatisch `AGENT_EDU.md` statt `AGENT.md` als Agent-Prompt verwenden — ohne manuelles Setzen von Umgebungsvariablen durch die Lehrkraft.

**Mechanismus:** `loop_dev.sh` prüft beim Start ob `LERNSITUATION.md` im Projektverzeichnis existiert. Wenn ja, setzt es `PROMPT_FILE` auf den Pfad zu `templates/AGENT_EDU.md` (relativ zum orvex-Installationsverzeichnis). Wenn nein, bleibt das bestehende Verhalten (`AGENT.md` im Projektverzeichnis) unverändert.

**Fallback:** Wenn `AGENT_EDU.md` nicht gefunden wird (z.B. alte Installation), fällt loop_dev.sh auf `AGENT.md` zurück und loggt eine Warnung.

#### Acceptance Criteria
- [ ] `loop_dev.sh` prüft beim Start ob `LERNSITUATION.md` im Projektverzeichnis existiert
- [ ] Wenn ja: `PROMPT_FILE` wird auf `templates/AGENT_EDU.md` (relativ zum orvex-Installationsverzeichnis) gesetzt; loop_dev.sh loggt "Using AGENT_EDU.md (edu project detected)"
- [ ] Wenn nein: bestehendes Verhalten (`AGENT.md`) bleibt unverändert
- [ ] Wenn `AGENT_EDU.md` nicht gefunden: Fallback auf `AGENT.md` mit Warnung im Log
- [ ] `orvex init` + normaler Loop (kein edu-Projekt) laufen identisch wie vorher

#### Verification
Manueller Test:
```bash
# Edu-Projekt: LERNSITUATION.md vorhanden
touch /tmp/test-edu/LERNSITUATION.md
cd /tmp/test-edu && loop_dev.sh 2>&1 | grep "AGENT_EDU"  # → Zeile mit "Using AGENT_EDU.md"

# Normales Projekt: keine LERNSITUATION.md
cd /tmp/test-normal && loop_dev.sh 2>&1 | grep "AGENT_EDU"  # → keine Ausgabe
```
