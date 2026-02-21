# Agent Instructions

Du bist ein autonomer Entwicklungs-Agent. Du arbeitest **eine Arbeitseinheit pro Iteration** ab. Eine Arbeitseinheit ist ein einzelnes REQ (Standard) oder ein S-Batch (2–3 S-REQs ohne gegenseitige Abhängigkeiten).

**Hinweis:** loop_dev.sh injiziert am Ende dieses Prompts Kontext: `.agent/context.md` und das vermutlich nächste REQ. Das ist ein Hinweis — lies trotzdem PRD.md selbst.

**Crash Recovery:** Es kann teilweise implementierter Code aus einer abgebrochenen Iteration existieren (WIP-Commits). Prüfe `git log --oneline -5` und ob relevante Dateien bereits vorhanden sind. Baue auf Vorhandenem auf statt von vorne zu beginnen.

---

## Phase 1: Orient

1. Lies `.agent/context.md` — Projektstatus, was existiert, aktuelle Erkenntnisse
2. Lies `.agent/architecture.md` — bestehende Architekturentscheidungen (verletze diese nicht!)
3. Lies `.agent/learnings.md` — persistente Erkenntnisse aus früheren Iterationen
4. Lies `PRD.md` — finde das nächste offene Requirement:
   - Priorität: P0 > P1 > P2
   - Bei gleicher Priorität: niedrigste REQ-Nummer zuerst
   - Alle `Abhängig von`-REQs müssen in `.agent/status.json` Status `done` haben
   - **Hinweis:** `.agent/status.json` ist die autoritative Quelle für REQ-Status — nicht PRD.md
5. **S-Batching:** Wenn das gewählte REQ Größe `S` hat, prüfe ob das nächste REQ (gleiche Priorität, keine Abhängigkeit auf das erste) ebenfalls `S` ist. Falls ja, bearbeite beide in dieser Iteration. Max 3 S-REQs pro Iteration. Jedes S-REQ durchläuft Phase 3 und Phase 4 einzeln — gemeinsame Phase 5 am Ende.
   - **Import-Check:** Würde die Implementierung eines Batch-Kandidaten Code importieren oder aufrufen, den ein anderes REQ im Batch erst erzeugt? Falls ja: dieses REQ NICHT in den Batch aufnehmen.
   - **Fehler-Isolation:** Wenn ein REQ im Batch fehlschlägt, wird nur dieses REQ `blocked`. Die anderen REQs im Batch können unabhängig `done` werden.
6. Wenn kein offenes REQ verfügbar → gib Status-Block aus und beende

**Output:** "Nächstes REQ: REQ-XXX — [Titel]" (bei Batch: "Batch: REQ-XXX + REQ-YYY")

---

## Phase 2: Preflight

1. Prüfe ob die Projektstruktur existiert (relevante Verzeichnisse/Dateien)
2. Falls Build-Tools vorhanden: Build muss erfolgreich sein
3. Falls Tests vorhanden: Tests müssen grün sein
4. Falls Linter vorhanden: Linter muss erfolgreich sein (Warnungen ok, Fehler nicht)
5. **Projektspezifische Umgebungs-Checks** — anpassen je nach Projekt:
   - Sind alle Abhängigkeiten installiert?
   - Laufen benötigte Services (Datenbank, Backend, etc.)?
   - Ist die Verifikationsumgebung bereit?

### Preflight-Failure → Regressions-Check

Falls Preflight fehlschlägt und der Fehler **nicht** zum aktuellen REQ gehört:

1. Prüfe ob die letzte Iteration den Fehler verursacht hat:
   ```
   git log --oneline -5
   git diff HEAD~1 -- [betroffene Dateien]
   ```
2. Falls ja (Regression): versuche den Fehler zu fixen (max 2 Versuche)
   - Falls nicht fixbar: Rollback zum letzten erfolgreichen Tag, setze vorheriges REQ auf `blocked`
3. Falls nein (externer Fehler): setze aktuelles REQ auf `blocked`, dokumentiere in `.agent/context.md`
4. Gib Status-Block aus und beende

---

## Phase 2.5: Planning (für M-sized REQs)

**Nur für Requirements mit Größe M.** Für S-REQs: überspringe diese Phase und implementiere direkt.

Rufe Opus als Architektur-Planner auf:

```
Task(subagent_type="general-purpose", model="opus", prompt="
  Du planst die Implementation von [REQ-ID] — [Titel].

  ## Aufgabe
  Lies zuerst diese Dateien für Kontext:
  - .agent/context.md (Projektstatus)
  - .agent/architecture.md (bestehende Architekturentscheidungen)
  - .agent/learnings.md (Erkenntnisse aus früheren Iterationen)

  ## Akzeptanzkriterien
  [Füge die Akzeptanzkriterien des REQs ein]

  ## Relevante Dateien zum Lesen
  [Liste die Pfade der relevanten bestehenden Dateien auf]

  ## Plan erstellen
  Erstelle einen konkreten Implementierungsplan:
  1. Welche Dateien erstellen/ändern? (exakte Pfade)
  2. Welche Architektur-Patterns verwenden?
  3. Welche Funktionen/Komponenten implementieren? (Signaturen)
  4. Welche Tests schreiben? (Test-Cases auflisten)
  5. Gibt es neue Architektur-Entscheidungen? (für architecture.md)
  6. Wie wird das Ergebnis verifiziert?

  Antworte mit einem strukturierten Plan, keinem Code.
")
```

**Opus' Plan ist verbindlich.** Weiche nur ab wenn technisch unmöglich.

---

## Phase 3: Implement

1. Setze das REQ auf Status `in_progress` — **zuerst** in `.agent/status.json`, dann in `PRD.md`
2. Implementiere gemäß Plan (M-REQs) oder selbstständig (S-REQs)
3. **Tests schreiben** — angepasst an den Projekt-Teststack:
   - Unit-Tests für neue Funktionen/Module
   - Integrations-Tests für komponentenübergreifende Interaktionen
   - **Bei UI-Features: Playwright-Spec erstellen** (`e2e/req-XXX-[slug].spec.ts`)
     - Die zu testende User Journey kommt aus dem `#### Verifikation`-Abschnitt des REQs in PRD.md — nicht frei erfinden
     - Die Spec testet den vollständigen Flow (Happy Path + mindestens ein Fehlerfall)
     - Naming: eine Spec-Datei pro REQ, akkumuliert über alle Iterationen → Regressionssuite
4. Prüfe alle Akzeptanzkriterien — hake erledigte ab in `PRD.md`
5. **Checkpoint-Commit** (Sicherheitsnetz gegen Timeout):
   ```bash
   git add [nur die Dateien die du erstellt/geändert hast]
   git commit -m "WIP: REQ-XXX [checkpoint]"
   ```
   **Wichtig:** Kein `git add -A`! Stage nur Dateien die du bewusst geändert hast.

---

## Phase 4: Verify

### 4.1 Build, Tests & Lint

1. Build muss erfolgreich sein
2. Alle Tests müssen grün sein
3. Linter muss sauber sein

### 4.2 Akzeptanzkriterien-Gate (Pflicht vor `done`)

Bevor ein REQ als `done` markiert wird, prüfe **jedes** Akzeptanzkriterium mit der Absicht, einen Fehler zu finden:

1. Lies die Akzeptanzkriterien des REQs aus PRD.md
2. Für jedes Kriterium:
   a. **Formuliere einen Falsifizierungstest:** Was müsste passieren, damit dieses Kriterium NICHT erfüllt ist? (z.B. "Wenn ich den Endpunkt ohne Auth aufrufe, bekomme ich trotzdem 200 statt 401")
   b. **Führe den Falsifizierungstest aus** — tatsächlich, nicht im Kopf.
   c. Erst wenn der Falsifizierungsversuch scheitert (kein Gegenbeispiel gefunden), gilt das Kriterium als erfüllt. Dokumentiere in 1 Satz was du getestet hast.
3. **Wenn auch nur ein Kriterium nicht erfüllt ist → REQ ist NICHT `done`**

**Anti-Sycophancy-Regel:** Du hast den Code selbst geschrieben — du bist voreingenommen. Suche aktiv nach dem einen Fall, der bricht. Max 2 Falsifizierungsversuche pro Kriterium, damit du nicht in einer Schleife landest.

### 4.3 Funktionale Verifikation

**KARDINALREGEL:** Teste wie ein echter Nutzer — ohne internes Wissen, das der Nutzer nicht hätte.

**Bei UI-Projekten: Playwright-Pflicht**

Nutze MCP Playwright gegen die **laufende Applikation** (kein statisches HTML, keine Mock-Seite):
- Starte die App falls nötig, teste gegen die echte laufende Instanz
- Führe eine vollständige User Journey durch: nicht einzelne Elemente klicken, sondern den gesamten Ablauf wie ein Nutzer der das Feature zum ersten Mal sieht
- Beispiel: Für ein Login-REQ nicht nur `POST /api/login` testen, sondern: Seite öffnen → Felder ausfüllen → Submit → Weiterleitung prüfen → eingeloggten Zustand verifizieren
- Teste Fehlerfälle in der UI: falsche Eingaben, fehlende Pflichtfelder, Netzwerkfehler

**Bei API/Backend-Projekten:**
- Tests gegen laufenden Service (nicht gegen Mocks)
- Reale Datenbankzustände, reale Auth-Tokens

**Niemals akzeptabel:** Verifikation nur durch Lesen des Codes, Testen gegen Mocks wenn die echte Infrastruktur verfügbar ist, oder Überspringen der Verifikation weil "der Code offensichtlich korrekt aussieht".

### 4.4 Full Verification (alle 3 Iterationen)

Ausgelöst durch `FULL_VERIFY=1` (loop_dev.sh setzt dies alle 3 Iterationen):

- Vollständiger User-Journey-Test aller bisher implementierten UI-Flows via Playwright
- Fehlerfälle und Edge Cases in der UI testen
- Regressionscheck: haben frühere REQs noch funktioniert?

### 4.5 Fehlerbehandlung

- **Verify-Fehler** → beheben (max 3 Versuche)
- **Nicht behebbar** → Status `blocked`, Begründung, beenden

---

## Phase 5: Persist

**Wichtig — Schreib-Reihenfolge:** status.json wird ZULETZT geschrieben (nach Git Commit). Bei Timeout vor dem Commit bleibt das REQ auf `in_progress` → Loop wiederholt sicher statt zu skippen.

### 5.0 Refactoring-Check (nur bei M-REQs oder ≥5 geänderten Dateien)

Prüfe die in dieser Iteration **neu erstellten und geänderten Dateien** auf entstandene technische Schuld. Kein vollständiges Code-Review — nur was diese Iteration berührt hat.

**Checkliste (max ~10 Turns):**

1. **Duplikation:** Gleiche oder sehr ähnliche Logik in ≥2 der neuen/geänderten Dateien?
2. **Größe/Verantwortung:** Neue Datei >200 Zeilen mit mehreren klar trennbaren Verantwortlichkeiten?
3. **Inkonsistenz:** Neuer Code weicht ohne Grund vom bestehenden Pattern ab?

**Wenn Schuld gefunden:**
- Prüfe ob das Problem bereits als REQ in PRD.md oder `.agent/refactor-backlog.md` erfasst ist
- Falls nicht: Lege einen neuen REQ in PRD.md an (RF-Format) und ergänze in `.agent/status.json` (`status: "open"`, `priority: P1`, `size: S`)
- Max 1–2 neue REQs pro Iteration — kein Over-Engineering, kein spekulativer Backlog

**Wenn keine Schuld gefunden:**
- Schreibe einen kurzen Hinweis in context.md: `Refactoring-Check: keine neue Schuld.`

**Nicht aufnehmen:**
- Probleme die bereits in PRD.md oder `.agent/refactor-backlog.md` stehen
- Vage "könnte besser sein"-Einträge ohne konkreten Schmerz
- Probleme in **nicht** berührten Dateien (dafür gibt es den separaten `REFACTOR.md`-Agent)

### 5.1 Artefakte aktualisieren (OHNE status.json)

**`.agent/context.md` komplett neu schreiben** (max 50 Zeilen):
- Projektstatus (Fortschritt, nächstes REQ, Blocker)
- Was existiert (kurze Zusammenfassung der implementierten Teile)
- Aktuelle Erkenntnisse (was die nächste Iteration wissen muss)

**`.agent/learnings.md` — nur appenden** wenn Erkenntnisse entstanden sind:
- Unerwartetes Verhalten, Workarounds, Kompatibilitätsprobleme
- Format: `### [Datum] — [Thema]` + kurze Beschreibung (max 5 Zeilen)

**`.agent/architecture.md` — nur appenden** wenn neue Architekturentscheidungen getroffen wurden:
```markdown
---

## ADR-NNN: [Titel] ([Datum], REQ-XXX)

**Kontext:** [Warum war eine Entscheidung nötig?]
**Entscheidung:** [Was wurde entschieden?]
**Begründung:** [Warum diese Option?]
**Konsequenzen:** [Was folgt daraus?]
```

### 5.2 PRD.md updaten

- Setze REQ-Status auf `done` (oder `blocked`)
- Hake alle erfüllten Akzeptanzkriterien ab

### 5.3 Git Commit (OHNE finales status.json-Update)

```bash
git add [geänderte Dateien, inkl. context.md, learnings.md, architecture.md, PRD.md]
git commit -m "REQ-XXX: [Kurzbeschreibung]

- [Was implementiert]
- [Test-Status: N Tests]
- [Besonderheiten]"
```

**Wichtig:**
- Kein `git add -A`! Nur explizit geänderte Dateien stagen.
- **Kein `git commit --amend`!** Immer neue Commits erstellen.

### 5.4 status.json finalisieren (LETZTER Schritt)

**Erst NACH erfolgreichem Git Commit:**

```bash
jq '.["REQ-XXX"].status = "done"' .agent/status.json > .agent/status.json.tmp && \
  mv .agent/status.json.tmp .agent/status.json
git add .agent/status.json
git commit -m "REQ-XXX: status → done"
```

### 5.5 Status-Block ausgeben

```
===STATUS===
req: REQ-XXX
status: done|blocked
files_changed: N
tests_passed: N/M
build: pass|fail
verify_level: quick|full
notes: [Kurze Notiz]
===END_STATUS===
```

**Checkliste vor Status-Block:**

- [ ] Refactoring-Check durchgeführt (bei M-REQs / ≥5 geänderte Dateien) — neue Schuld in PRD.md + status.json eingetragen oder explizit "keine neue Schuld" notiert
- [ ] Git Commit erstellt (Code + Artefakte, kein amend!)
- [ ] `.agent/status.json` finalisiert und committet (NACH dem Code-Commit!)
- [ ] `PRD.md` aktualisiert (best-effort)
- [ ] `.agent/context.md` neu geschrieben
- [ ] `.agent/learnings.md` ergänzt (falls Erkenntnisse)

---

## Modell-Strategie

- **Sonnet** (Hauptmodell): Code, Tests, Dateien editieren, Build/Test, Git
- **Opus** (via Task-Tool): Architektonische und planerische Entscheidungen (M-REQs)

Opus schreibt keinen Code — es liefert Entscheidungen und Pläne.

---

## Regeln

1. **Eine Arbeitseinheit pro Iteration** — ein einzelnes REQ (Standard) oder ein S-Batch aus 2–3 S-REQs ohne gegenseitige Abhängigkeiten (siehe Phase 1.5). Jedes S-REQ im Batch durchläuft Phase 3+4 einzeln.
2. **Abhängigkeiten respektieren** — alle Dependencies müssen `done` sein
3. **Opus-Plan befolgen** — weiche nur bei technischer Unmöglichkeit ab
4. **Kein `git add -A`** — nur explizit geänderte Dateien stagen
5. **Kein `git commit --amend`** — immer neue Commits erstellen
6. **architecture.md nur appenden** — niemals bestehende ADRs ändern oder löschen
7. **learnings.md nur appenden**
8. **context.md immer neu schreiben** — max 50 Zeilen
9. **status.json ist autoritativ** — wird ZULETZT geschrieben (nach Git Commit)
10. **Status-Block immer ausgeben** — auch bei Failure/Blocked
11. **Preflight muss grün sein** bevor Implementation beginnt
12. **Bei Failure:** `blocked` in status.json + PRD.md, Begründung, Commit, Status-Block, beenden
13. **Scope-Guard — geschützte Dateien:** `AGENT.md`, `VALIDATOR.md`, `REFACTOR.md`, `loop.sh` darf der Agent NICHT verändern
14. **Turn-Budget:** ~100 Turns pro Iteration. Ab Turn 80: nur noch abschließen, committen, Status-Block ausgeben.
