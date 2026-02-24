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

- **Status:** done
- **Priority:** P1
- **Size:** S
- **Depends on:** REQ-012

#### Description
Wenn `orvex` (Loop, kein Subcommand) in einem Projektverzeichnis mit `LERNSITUATION.md` gestartet wird, soll `loop_dev.sh` automatisch `AGENT_EDU.md` statt `AGENT.md` als Agent-Prompt verwenden — ohne manuelles Setzen von Umgebungsvariablen durch die Lehrkraft.

**Mechanismus:** `loop_dev.sh` prüft beim Start ob `LERNSITUATION.md` im Projektverzeichnis existiert. Wenn ja, setzt es `PROMPT_FILE` auf den Pfad zu `templates/AGENT_EDU.md` (relativ zum orvex-Installationsverzeichnis). Wenn nein, bleibt das bestehende Verhalten (`AGENT.md` im Projektverzeichnis) unverändert.

**Fallback:** Wenn `AGENT_EDU.md` nicht gefunden wird (z.B. alte Installation), fällt loop_dev.sh auf `AGENT.md` zurück und loggt eine Warnung.

#### Acceptance Criteria
- [x] `loop_dev.sh` prüft beim Start ob `LERNSITUATION.md` im Projektverzeichnis existiert
- [x] Wenn ja: `PROMPT_FILE` wird auf `templates/AGENT_EDU.md` (relativ zum orvex-Installationsverzeichnis) gesetzt; loop_dev.sh loggt "Using AGENT_EDU.md (edu project detected)"
- [x] Wenn nein: bestehendes Verhalten (`AGENT.md`) bleibt unverändert
- [x] Wenn `AGENT_EDU.md` nicht gefunden: Fallback auf `AGENT.md` mit Warnung im Log
- [x] `orvex init` + normaler Loop (kein edu-Projekt) laufen identisch wie vorher

#### Verification
Manueller Test:
```bash
# Edu-Projekt: LERNSITUATION.md vorhanden
touch /tmp/test-edu/LERNSITUATION.md
cd /tmp/test-edu && loop_dev.sh 2>&1 | grep "AGENT_EDU"  # → Zeile mit "Using AGENT_EDU.md"

# Normales Projekt: keine LERNSITUATION.md
cd /tmp/test-normal && loop_dev.sh 2>&1 | grep "AGENT_EDU"  # → keine Ausgabe
```

---

## Refactoring Requirements

### RF-001: Fix orvex validation gate for CONT-REQ-only PRDs

- **Priority:** P0
- **Size:** S
- **Status:** done
- **Depends on:** —

#### Problem

`orvex:96` uses `grep -q '^### REQ-'` to validate PRD.md. An edu-init project whose PRD.md has only CONT-REQs before the first REQ-NNN is rejected with "PRD.md contains no requirements". This blocks the entire edu-init workflow — ADR-012 documented this fix but it was never implemented.

#### Acceptance Criteria

- [x] `orvex:96` uses `grep -qE '^### (REQ|CONT)-'` instead of `grep -q '^### REQ-'`
- [x] A PRD.md containing only `### CONT-EXPL-001: Test` passes validation
- [x] A PRD.md with no headings at all still triggers the error
- [x] Existing `orvex init` and `orvex` (loop) behavior unchanged

#### Verification

```bash
echo '### CONT-EXPL-001: Test' > /tmp/test_prd.md
# Simulate the grep: should exit 0
grep -qE '^### (REQ|CONT)-' /tmp/test_prd.md && echo "PASS" || echo "FAIL"
```

---

### RF-002: Fix get_next_req_block AWK regex bug

- **Priority:** P0
- **Size:** S
- **Status:** done
- **Depends on:** —

#### Problem

`loop_dev.sh:430` uses `/^(### REQ-|^---)/` as the AWK block termination pattern. Two bugs: (1) the nested `^` inside the alternation is parsed as a literal character, not an anchor; (2) CONT-REQ headings don't match, so a CONT-REQ section following the target block bleeds into the extracted prompt context. This corrupts agent prompts when CONT-REQs exist in PRD.md. Documented in ADR-005 and context.md as known open issue.

#### Acceptance Criteria

- [x] AWK termination at `loop_dev.sh:430` replaced with two separate conditions per ADR-005: `found && /^### (REQ-|CONT-)/ && $0 != title { exit }` and `found && /^---/ { exit }`
- [x] Block extraction for a REQ followed by a CONT-REQ stops at the CONT-REQ heading
- [x] Block extraction for a REQ followed by `---` stops at the separator
- [x] Existing REQ-to-REQ block extraction unchanged

#### Verification

```bash
# Test PRD with mixed REQ/CONT:
cat > /tmp/test_prd.md << 'EOF'
### REQ-001: First
Description of REQ-001.
### CONT-EXPL-001: Content
This should NOT appear in REQ-001's block.
### REQ-002: Second
EOF
# Extract REQ-001 block — must not contain "CONT-EXPL-001"
```

---

### RF-003: Extract generic review-flow abstraction from hooks

- **Priority:** P1
- **Size:** M
- **Status:** done
- **Depends on:** —

#### Problem

`useEduInitRunner.ts` (904 lines) and `useInitRunner.ts` (703 lines) contain ~600 lines of nearly identical review-callback code. Each review target (LernSituation, PRD, Arch) requires the same 8 callbacks: confirm synth-done, skip review, advance, open editor, start typing, on type, submit rewrite, save/cancel edit. These are copy-pasted per target in both hooks. Any bug fix or behavior change must be applied 5 times (2 targets in init, 3 in edu), creating high risk of inconsistent fixes.

#### Acceptance Criteria

- [x] A shared review-flow module (e.g. `src/lib/reviewFlow.ts`) encapsulates the ref-synced state setter, advance, open editor, start typing, on type, submit rewrite, confirm synth-done, and skip review patterns
- [x] `useInitRunner` uses the shared module for PRD and Arch review
- [x] `useEduInitRunner` uses the shared module for LernSituation, PRD, and Arch review
- [x] All 153 existing tests pass unchanged
- [x] `deno check src/main.ts` clean

#### Verification

`deno test src/` → all green
`deno check src/main.ts` → exit code 0
Line count of `useEduInitRunner.ts` + `useInitRunner.ts` reduced by ≥30%

---

### RF-004: Extract shared debate utilities from agent modules

- **Priority:** P1
- **Size:** S
- **Status:** done
- **Depends on:** —

#### Problem

`initAgents.ts` and `eduAgents.ts` contain three identical items: `K_HEADER` constant (10 lines), `formatOthersOutput` function (17 lines), and `makeRounds` function (13 lines). Any change to the debate format (e.g. K_HEADER template) requires synchronized edits in both files.

#### Acceptance Criteria

- [x] `K_HEADER`, `formatOthersOutput`, and `makeRounds` exist in exactly one location (e.g. `src/lib/debateUtils.ts` or exported from `phaseRunner.ts`)
- [x] Both `initAgents.ts` and `eduAgents.ts` import from the shared location
- [x] No duplicate definitions of these three items remain
- [x] All existing tests pass unchanged
- [x] `deno check src/main.ts` clean

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
`grep -r 'K_HEADER' src/lib/ | wc -l` → exactly 1 definition + N imports

---

### REQ-017: Dashboard Completion Overlay

- **Status:** done
- **Priority:** P1
- **Size:** M
- **Depends on:** REQ-000

#### Description

Wenn der Loop stoppt (`loopRunning === false` nach mindestens einer Iteration), zeigt das Dashboard ein Completion Overlay — einen Vollbild-Screen der das normale Dashboard ersetzt. Das Overlay bleibt solange sichtbar bis der User `q` drückt (dann beendet sich die TUI).

**Stop-Typen und Darstellung:**

| Kind | Farbe | Headline |
|------|-------|----------|
| `all_done` | green | ✅  Alle Requirements erfüllt |
| `max_iterations` | yellow | ⏹  Maximale Iterationen erreicht |
| `timeout` | yellow | ⏱  Timeout |
| `low_activity` | yellow | 💤  Loop inaktiv |
| `no_actionable_req` | yellow | ⚠  Kein ausführbares Requirement |
| *(unbekannt / Loop-Crash)* | red | ⛔  Loop unerwartet beendet |

**Summary-Zeile** (immer angezeigt):
Laufzeit · Gesamtkosten · Anzahl Iterationen · Anzahl done-REQs / Gesamt-REQs

**Diagnose-Block** (nur wenn Kind ≠ `all_done`):
- Ein Haiku-Aufruf analysiert die letzten N Einträge aus `events.jsonl` (≤ 40 Zeilen)
- Prompt auf Englisch, Output auf Deutsch, max. 3 Sätze
- Während Haiku läuft: Spinner-Zeile "Analysiere…"
- Ergebnis wird unter der Headline angezeigt
- Bei Fehler (Haiku nicht verfügbar, Timeout): stiller Fallback — kein Diagnose-Block

**Haiku-Aufruf:**
`runClaude` aus `src/lib/runClaude.ts` mit Modell `haiku`, non-streaming (`stream: false`).
Prompt-Template (Englisch):
```
You are a loop diagnostics assistant. Given the last events from an agentic development loop,
explain in 2–3 German sentences why the loop stopped. Be concise and specific.
Stop reason reported: <kind>
Last events (JSONL):
<letzte 40 Zeilen aus events.jsonl>
```

**Keyboard:** Im Overlay ist `q` der einzige aktive Key → beendet die TUI (`process.exit(0)` / `Deno.exit(0)`).

**Implementierungshinweise:**
- `useEventsReader` exposed bereits alle Events; das Dashboard filtert daraus das letzte `system:event` mit Kind aus der Tabelle oben
- Fallback wenn kein `system:event` vorhanden aber Loop gestoppt: Kind = `unknown`
- Das Overlay ist eine eigene Funktion/Komponente innerhalb von `Dashboard.ts` (kein neue Datei nötig)
- Haiku-Aufruf: `useEffect` wenn `loopRunning === false && kind !== "all_done"`, einmalig (Guard-Flag)

#### Acceptance Criteria

- [x] Wenn `loopRunning === false && currentIter > 0`: Dashboard zeigt Completion Overlay statt des normalen Dashboards
- [x] Overlay zeigt korrekte Headline + Farbe für alle 5 definierten Stop-Kinds sowie Fallback
- [x] Summary-Zeile enthält Laufzeit, Kosten, Iterationen, REQ-Fortschritt
- [x] Bei Kind ≠ `all_done`: Haiku-Diagnose wird geladen (Spinner während Analyse) und angezeigt
- [x] Bei Kind = `all_done`: kein Diagnose-Block, kein Haiku-Aufruf
- [x] Haiku-Fehler führt zu stillem Fallback (kein Diagnose-Block, kein Error-State)
- [x] `q` beendet die TUI aus dem Overlay heraus
- [x] `deno check src/main.ts` fehlerfrei
- [x] Alle bestehenden Tests grün

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manuell: Loop mit `./loop_dev.sh 1` starten → nach Iteration zeigt TUI Overlay statt Dashboard

---

### RF-006: Fix stale iter counter and currentReq in Dashboard

- **Priority:** P1
- **Size:** S
- **Status:** done
- **Depends on:** —

#### Problem

`currentIter` und `currentReq` in `useEventsReader` werden nur bei `iteration:start`-Events gesetzt, nie zurückgesetzt. Zwischen Iterationen (Refactor-Phase, Gap nach `iteration:end`) bleibt `currentReq` auf dem letzten Wert stehen — der Header zeigt z.B. "Iter 8 · REQ-016" obwohl REQ-016 längst abgeschlossen ist und der Loop bei Iter 11 arbeitet. Zudem nutzt der Status-Bar `currentIter` direkt aus Events, obwohl `iterations.jsonl` die authoritative Quelle für abgeschlossene Iterationen ist.

#### Acceptance Criteria

- [x] `currentReq` wird in `useEventsReader` beim `iteration:end`-Event auf `null` gesetzt
- [x] Der Status-Bar-Counter zeigt `Math.max(currentIter, lastCompletedIter)`, wobei `lastCompletedIter` aus dem letzten Eintrag in `iterEntries` (iterations.jsonl) stammt
- [x] Der Activity-Feed-Header zeigt ebenfalls den korrekten Iter-Wert (gleiche `displayIter`-Variable)
- [x] Wenn eine neue Iteration startet (currentIter steigt), scrollt der Activity Feed automatisch zu den neuesten Einträgen (scrollOffset reset auf 0)
- [x] `deno check src/main.ts` fehlerfrei
- [x] Alle bestehenden Tests grün

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manuell: Loop starten, zwischen zwei Iterationen prüfen ob Header sofort zurückgesetzt wird statt alten Req-Namen zu zeigen

---

### RF-007: Req-Pane Viewport — Scrollbar für Requirements-Liste

- **Priority:** P1
- **Size:** S
- **Status:** done
- **Depends on:** —

#### Problem

Die linke Spalte des Dashboards rendert alle Requirements ohne Höhenbeschränkung. Bei vielen REQs (>15) übersteigt die Spaltenhöhe die Terminal-Höhe und verschiebt das gesamte Layout nach unten. Es gibt keinen Scroll-Mechanismus — überlaufende Requirements sind nicht sichtbar.

#### Acceptance Criteria

- [x] Die Req-Liste rendert maximal `Math.floor((rows - FEED_OVERHEAD) / 2)` Einträge gleichzeitig (viewport-basiertes Rendering)
- [x] Das Viewport folgt automatisch dem aktiven (in_progress) REQ — dieser wird in der Mitte des Viewports gezeigt
- [x] Gibt es keinen in_progress-REQ, scrollt das Viewport automatisch ans Ende (neueste REQs sichtbar)
- [x] Scroll-Indikatoren: `↑ N more` oben wenn Einträge darüber verborgen sind, `↓ N more` unten wenn Einträge darunter verborgen sind
- [x] Das Layout verschiebt sich bei 22+ Requirements nicht mehr nach unten
- [x] Kein neuer Keyboard-Handler nötig (Auto-Scroll, kein manueller Scroll via Keys)
- [x] `deno check src/main.ts` fehlerfrei
- [x] Alle bestehenden Tests grün

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manuell: Terminal auf 24 Zeilen verkleinern, Loop mit 22+ REQs — Layout bleibt stabil, aktiver REQ sichtbar

---

### RF-008: Requirements-Liste nach Status gruppieren

- **Priority:** P1
- **Size:** S
- **Status:** open
- **Depends on:** —

#### Problem

Die Requirements-Liste im linken Pane des Dashboards zeigt alle REQs in ihrer PRD-Reihenfolge — `open`, `in_progress`, `blocked` und `done` gemischt. Der User muss scrollen und suchen, um zu erkennen was noch aussteht. Erledigte Requirements dominieren optisch die Liste, obwohl sie für die weitere Arbeit irrelevant sind.

#### Acceptance Criteria

- [ ] Die Requirements-Liste im linken Dashboard-Pane zeigt aktive REQs (Status `open`, `in_progress`, `blocked`) oben
- [ ] `done`-REQs werden unten angezeigt, visuell durch eine Trennzeile (`─── done ───`) abgesetzt
- [ ] Innerhalb jeder Gruppe bleibt die ursprüngliche PRD-Reihenfolge erhalten
- [ ] Das Verhalten der bestehenden Viewport-Logik (RF-007, falls implementiert) bleibt unverändert — der Active-REQ-Fokus bezieht sich weiterhin auf die neue Reihenfolge
- [ ] `deno check src/main.ts` fehlerfrei
- [ ] Alle bestehenden Tests grün

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manuell: Dashboard mit 5 done + 3 open REQs starten → oben 3 offene, unten Trennlinie, darunter 5 done

---

### RF-009: REQ-Fokus-Modus — Detail-Ansicht im Dashboard

- **Priority:** P1
- **Size:** M
- **Status:** open
- **Depends on:** —

#### Problem

Das Dashboard zeigt in der Requirements-Liste nur ID, Status und Titel (max. 30 Zeichen). Die vollständige Beschreibung, Acceptance Criteria, Priority, Size und Dependencies eines REQs sind während des Loops nicht einsehbar — der User muss die TUI verlassen und `PRD.md` manuell öffnen, um zu verstehen was der Agent gerade implementiert oder warum ein REQ blockiert ist.

#### Lösung: Two-Mode Dashboard

Das Dashboard kennt zwei Modi, umschaltbar mit `r`:

**Normalmodus** (Standard): unverändertes Layout — Activity Feed rechts, REQ-Liste links.

**REQ-Fokus-Modus**: Die REQ-Liste links bekommt einen beweglichen Cursor (Highlight). Das rechte Pane wechselt vom Activity Feed zur **REQ-Detailansicht** des selektierten REQs. Zurück zum Normalmodus via `r`.

```
┌─ Requirements ──────────┐ ┌─ REQ-017: Dashboard Completion Overlay ──┐
│  REQ-000  [done]        │ │ Status: open  · P1  · M                   │
│  REQ-001  [done]        │ │ Depends on: REQ-000                        │
│ ▶ REQ-017  [open]  ◀    │ │──────────────────────────────────────────  │
│  REQ-010  [open]        │ │ Wenn der Loop stoppt, zeigt das Dashboard  │
│  RF-006   [open]        │ │ ein Completion Overlay…                    │
│ ── done ──              │ │                                            │
│  REQ-002  [done]        │ │ Acceptance Criteria:                       │
│  REQ-003  [done]        │ │  [ ] loopRunning===false && iter>0 → Overlay│
│                         │ │  [ ] Headline + Farbe je Stop-Kind         │
│                         │ │  [ ] Summary: Laufzeit · Kosten · Iters    │
│                         │ │  [ ] Haiku-Diagnose bei kind≠all_done      │
│                         │ │                              [↑↓] scroll   │
└─────────────────────────┘ └────────────────────────────────────────────┘
  [r] focus mode  [↑↓] select req
```

#### Keyboard-Verhalten

| Key | Normalmodus | Fokus-Modus |
|-----|-------------|-------------|
| `r` | → Fokus-Modus (Cursor auf in_progress-REQ oder erstem open-REQ) | → Normalmodus |
| `↑` / `↓` | scroll Activity Feed | bewegt Cursor in REQ-Liste; Detail-Pane aktualisiert sofort |
| `Tab` | — | wechselt Scroll-Fokus zwischen REQ-Liste und Detail-Pane |
| `p` / `s` / `e` / `q` | unverändert | unverändert |

Im Fokus-Modus scrollt `↑`/`↓` standardmäßig die REQ-Liste. Nach `Tab`-Drücken scrollt `↑`/`↓` den Detail-Inhalt (für lange Beschreibungen / viele ACs).

#### Detail-Pane Inhalt

Gelesen aus `PRD.md` via neuem Hook `usePrdDetails` (liest PRD einmalig, parst alle REQ-Blöcke mit vollständigem Text):

```
REQ-017: Dashboard Completion Overlay
Status: open  ·  Priority: P1  ·  Size: M
Depends on: REQ-000
────────────────────────────────────────
<vollständiger Description-Text, wrapping auf Pane-Breite>

Acceptance Criteria:
  [ ] Wenn loopRunning===false && currentIter>0 → Overlay
  [ ] Overlay zeigt korrekte Headline + Farbe
  [x] (bereits done-REQs zeigen ✓ statt [ ])
  …
```

Acceptance-Criteria-Checkboxen spiegeln den aktuellen `status.json`-Stand: bei `done`-REQs werden alle ACs als `[x]` angezeigt (da der Loop sie als erfüllt behandelt hat).

#### Implementierungshinweise

- Neuer Hook `usePrdDetails`: liest `PRD.md` beim Mount einmalig (kein Polling), parsed jeden REQ/RF-Block in `{ id, title, description, acceptanceCriteria[], priority, size, dependsOn }`. Analog zu `usePrdTitles`, aber vollständig.
- Neuer State `focusMode: boolean` + `cursorIdx: number` in `Dashboard.ts`
- Im Fokus-Modus: REQ-Liste rendert Cursor-Highlight (z.B. inverse Farbe oder `▶` Prefix), rechtes Pane rendert `ReqDetail`-Komponente statt `ActivityFeed`
- `ReqDetail` ist eine eigene Funktion in `Dashboard.ts` (kein neue Datei nötig)
- Die Hint-Zeile unten aktualisiert sich je Modus: Normalmodus zeigt `[r] req focus`, Fokus-Modus zeigt `[r] back to feed  [↑↓] select  [Tab] scroll detail`

#### Acceptance Criteria

- [ ] `r` wechselt zwischen Normalmodus und Fokus-Modus; Activity Feed kehrt beim Zurückwechseln unverändert zurück
- [ ] Im Fokus-Modus bewegt `↑`/`↓` den Cursor durch alle REQs der gruppierten Liste
- [ ] Das Detail-Pane zeigt vollständigen Text des selektierten REQs: Metadaten, Description, Acceptance Criteria
- [ ] Beim Eintritt in den Fokus-Modus steht der Cursor auf dem `in_progress`-REQ (falls vorhanden), sonst auf dem ersten `open`-REQ
- [ ] `Tab` wechselt den Scroll-Fokus zwischen REQ-Liste und Detail-Pane
- [ ] Langer Detail-Inhalt ist scrollbar (kein Clipping ohne Indikator)
- [ ] Alle anderen Keys (`p`, `s`, `e`, `q`) bleiben in beiden Modi aktiv
- [ ] `deno check src/main.ts` fehlerfrei
- [ ] Alle bestehenden Tests grün

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manuell: `r` drücken → Fokus-Modus; `↑`/`↓` durch REQs navigieren → Detail-Pane aktualisiert sich; `r` zurück → Activity Feed weiterhin live

---

### RF-005: Deduplicate dashboard runner rendering

- **Priority:** P1
- **Size:** M
- **Status:** done
- **Depends on:** RF-003

#### Problem

`EduRunner` in `EduInitDashboard.ts` (lines 18–330) and `InitRunner` in `InitDashboard.ts` (lines 370–690) share ~280 lines of identical dashboard rendering logic: layout width computation, timer effects, done/error early-return screens, agent stream display, split-pane layout with progress bars. Changes to the dashboard appearance must be made in both components.

#### Acceptance Criteria

- [x] Shared dashboard rendering logic extracted to a reusable component or utility (e.g. `RunnerDashboard`)
- [x] Both `EduRunner` and `InitRunner` use the shared component, passing only their specific state and config
- [x] Early-return screens (done, error, synth-done, review) handled uniformly
- [x] All existing tests pass unchanged
- [x] `deno check src/main.ts` clean

#### Verification

`deno check src/main.ts` → exit code 0
`deno test src/` → all green
Manual: `orvex init` and `orvex edu-init` display identically to before
