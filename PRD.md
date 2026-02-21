# PRD — Kinema

> Kinema ist ein Framework für autonome KI-Agent-Workflows mit Claude Code.
> Ziel: Migration des Shell-Orchestrators (loop.sh) zu einer interaktiven Terminal-Applikation (TUI)
> mit verbesserter Developer Experience, typisiertem Event-Schema und modularer Architektur.

---

## Wie REQs definiert sind

Jedes Requirement folgt diesem Format:

```
### REQ-001: [Titel]

- **Status:** open|in_progress|done|blocked
- **Priorität:** P0|P1|P2
- **Größe:** S|M
- **Abhängig von:** REQ-XXX | ---

#### Beschreibung
Was soll implementiert werden?

#### Akzeptanzkriterien
- [ ] [Beobachtbares Ergebnis mit konkretem Messwert]
- [ ] [NEGATIV: Was darf NICHT passieren]

#### Verifikation
- `[Befehl]` ergibt `[erwartete Ausgabe]`
```

---

## Phase 1: Sofort-Fixes (loop.sh läuft zuverlässig auf macOS)

### REQ-001: grep -oP durch grep -Eo ersetzen

- **Status:** open
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung
BSD grep (macOS) unterstützt kein `-P` (PCRE). Drei kritische Stellen in loop.sh verwenden `grep -oP` und sind auf macOS defekt.

#### Akzeptanzkriterien
- [ ] Zeile 444 (`tag_iteration`): `grep -oP 'REQ-\d+[a-z]?'` → `grep -Eo 'REQ-[0-9]+[a-z]?'`
- [ ] Zeile 896 (Validierungsintervall-Parsing): Lookbehind durch zwei-stufiges grep ersetzt (`grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'`)
- [ ] Zeile 912 (Repeat-Detection): `grep -oP 'REQ-\d+[a-z]?'` → `grep -Eo 'REQ-[0-9]+[a-z]?'`
- [ ] `./loop.sh` startet auf macOS ohne Fehler und erstellt Git-Tags korrekt
- [ ] NEGATIV: Kein `grep: invalid option -- P` in der Ausgabe auf macOS

#### Verifikation
- `bash -n loop.sh` ergibt keinen Syntax-Fehler
- Nach einem Test-Lauf: `git tag | grep iter-` zeigt korrekte Tags
- `echo "next_validation_interval: 3" | grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'` ergibt `3`

---

### REQ-002: summarize_log()-Funktion inline in loop.sh

- **Status:** open
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung
`build_validator_prompt()` ruft `scripts/summarize-log.sh` auf, das nicht existiert. Der Opus-Validator erhält für jede Iteration nur `_Log summary failed_` — der gesamte Validierungsloop ist faktisch blind.

#### Akzeptanzkriterien
- [ ] Funktion `summarize_log()` ist inline in loop.sh definiert (ersetzt den Skript-Aufruf in Zeile 374)
- [ ] Gibt Iterationsnummer, Tool-Count, Kosten, Exit-Code und Top-3-Tools aus
- [ ] Gibt geänderte Dateien aus (max 5)
- [ ] NEGATIV: Kein `_Log summary failed_` in Validator-Prompts bei vorhandenem Log

#### Verifikation
- `grep -c 'summarize_log()' loop.sh` ergibt `1`
- `grep 'summarize-log.sh' loop.sh` ergibt keine Ausgabe (alter Aufruf entfernt)
- Test mit einem JSONL-Log: `summarize_log .agent/logs/iter-001.jsonl` gibt strukturierte Ausgabe

---

### REQ-003: trap cleanup EXIT ergänzen

- **Status:** open
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung
`trap cleanup INT TERM` fängt kein `EXIT`. Bei `set -e`-Abbruch (jq-Fehler etc.) werden Lockfile, Temp-Files und Dev-Server nicht bereinigt. Claude-Kindprozesse laufen als kostenpflichtige Waisen weiter.

#### Akzeptanzkriterien
- [ ] `trap cleanup EXIT INT TERM` ersetzt `trap cleanup INT TERM`
- [ ] `cleanup()` ist idempotent (mehrfacher Aufruf ohne Fehler)
- [ ] NEGATIV: Nach einem absichtlich herbeigeführten `set -e`-Abbruch bleibt kein `.agent/loop.lock` zurück

#### Verifikation
- `grep 'trap cleanup' loop.sh` ergibt `trap cleanup EXIT INT TERM`
- `bash -c 'source loop.sh; cleanup; cleanup'` erzeugt keinen Fehler (Idempotenz)

---

### REQ-004: context.md-Länge in loop.sh durchsetzen

- **Status:** open
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung
`cat "$CONTEXT_FILE"` (Zeile 338) injiziert ohne Längenprüfung. Die "max 50 Zeilen"-Regel in AGENT.md ist Konvention, kein Code. Prompt-Overflow möglich.

#### Akzeptanzkriterien
- [ ] `head -50 "$CONTEXT_FILE"` statt `cat "$CONTEXT_FILE"` in Zeile 338
- [ ] Warnung ausgegeben wenn context.md > 50 Zeilen
- [ ] NEGATIV: Eine context.md mit 80 Zeilen führt nicht dazu, dass alle 80 Zeilen injiziert werden

#### Verifikation
- `grep 'head -50' loop.sh` findet den Eintrag in der Prompt-Build-Funktion
- Test: context.md auf 60 Zeilen setzen → Loop-Ausgabe enthält Warnung

---

## Phase 2: Thin TUI Shell (passiver stdout-Consumer)

### REQ-005: Kinema-TUI Grundgerüst (Deno + Ink)

- **Status:** open
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-001, REQ-002, REQ-003

#### Beschreibung
Minimales Deno/Ink-Projekt das loop.sh-stdout konsumiert und in einem Terminal-Dashboard darstellt. Die TUI ist rein passiv — keine eigene Logik, kein eigener Prompt-Kanal.

Architektur: `KINEMA_TUI=1 ./loop.sh "$@" 2>&1 | deno run --allow-all src/main.ts`

#### Akzeptanzkriterien
- [ ] `deno.json` mit korrekten Tasks (`dev`, `build`, `check`)
- [ ] `src/main.ts` liest stdin zeilenweise und gibt es weiter (Basis-Pipe)
- [ ] Ink-App rendert mindestens einen statischen Header ("Kinema v0.1")
- [ ] `deno task check` (TypeScript-Check) läuft ohne Fehler
- [ ] NEGATIV: TUI stürzt nicht ab wenn loop.sh-stdout leer ist oder abbricht

#### Verifikation
- `cd dev && deno task check` ergibt Exit 0
- `echo "test" | deno run --allow-all src/main.ts` rendert ohne Fehler
- `deno task dev` startet die TUI (auch ohne laufendes loop.sh)

---

### REQ-006: Live-Status-Dashboard

- **Status:** open
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-005

#### Beschreibung
Die TUI liest `.agent/status.json` nach jeder Iteration und zeigt REQ-Fortschritt, aktuelle Phase, Laufzeit und Gesamtkosten in einem Dashboard-Layout an.

#### Akzeptanzkriterien
- [ ] REQ-Liste mit Status-Farben (open=grau, in_progress=gelb, done=grün, blocked=rot)
- [ ] Aktives REQ und aktuelle Phase sichtbar
- [ ] Gesamtkosten ($) und Laufzeit (mm:ss) werden angezeigt
- [ ] Polling von `.agent/status.json` alle 2 Sekunden
- [ ] NEGATIV: Fehlendes oder invalides status.json führt nicht zum TUI-Absturz

#### Verifikation
- TUI starten, status.json manuell aktualisieren → Anzeige aktualisiert sich innerhalb 3s
- `echo '{}' > .agent/status.json` → TUI zeigt leeren Zustand, kein Crash

---

### REQ-007: Blocked-Reason-Inline-Anzeige

- **Status:** open
- **Priorität:** P2
- **Größe:** S
- **Abhängig von:** REQ-006

#### Beschreibung
Bei blockierten REQs zeigt die TUI die letzten 3 Fehlversuche mit Zeitstempel und Kurzgrund an (aus `.agent/iterations.jsonl`).

#### Akzeptanzkriterien
- [ ] Blocked-REQs expandieren in der Liste zu einem Detail-View mit bis zu 3 Einträgen
- [ ] Jeder Eintrag zeigt: Iterationsnummer, Zeitstempel, notes aus status.json
- [ ] NEGATIV: Mehr als 3 Einträge werden nicht angezeigt (kein Overflow)

#### Verifikation
- status.json mit einem blocked-REQ (retry_count=2) → Detail-View zeigt 2 Einträge
- status.json mit blocked-REQ ohne notes → Detail-View zeigt "keine Details verfügbar"

---

## Phase 3: Event-Schema + Interaktivität

### REQ-008: Event-Schema TypeScript-Typen

- **Status:** open
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** REQ-005

#### Beschreibung
Typisiertes Event-Schema als stabiles Protokoll zwischen loop.sh-stdout und TUI. 6 Event-Typen (aus PLAN.md): IterationStart, IterationEnd, ToolCall, ReqStatusChange, AgentOutput, SystemEvent.

#### Akzeptanzkriterien
- [ ] `src/events.ts` mit allen 6 Typen exakt wie in PLAN.md definiert
- [ ] `LoopEvent` Union-Type exportiert
- [ ] `deno task check` läuft ohne TypeScript-Fehler
- [ ] NEGATIV: Keine `any`-Types in events.ts

#### Verifikation
- `grep 'any' src/events.ts` ergibt keine Ausgabe
- `deno task check` Exit 0

---

### REQ-009: Pause/Skip/Edit-Interaktivität

- **Status:** open
- **Priorität:** P2
- **Größe:** M
- **Abhängig von:** REQ-006, REQ-008

#### Beschreibung
Erste Steuerungsmöglichkeiten: `p` pausiert nach aktueller Iteration, `s` überspringt das aktuelle REQ, `e` öffnet context.md im Editor.

#### Akzeptanzkriterien
- [ ] Taste `p`: setzt eine Pause-Flag-Datei (`.agent/pause.flag`), loop.sh prüft diese zwischen Iterationen
- [ ] Taste `s`: schreibt `skip`-Kommando in `.agent/control.fifo`, loop.sh liest es
- [ ] Taste `e`: öffnet `$EDITOR` mit `.agent/context.md` (blockierend, TUI wartet)
- [ ] NEGATIV: Unbekannte Tasten haben keinen Effekt, kein Absturz

#### Verifikation
- `p` drücken → `.agent/pause.flag` existiert nach dem Tastendruck
- `e` drücken → Editor öffnet sich (wenn `$EDITOR` gesetzt)
