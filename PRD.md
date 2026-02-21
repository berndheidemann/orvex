# PRD — Kinema

> Kinema ist ein Framework für autonome KI-Agent-Workflows mit Claude Code.
> Ziel: Migration des Shell-Orchestrators (loop_dev.sh) zu einer interaktiven Terminal-Applikation (TUI)
> mit verbesserter Developer Experience, typisiertem Event-Schema und modularer Architektur.

---

## Wie REQs definiert sind

Jedes Requirement folgt diesem Format:

```
### REQ-NNN: [Titel]

- **Status:** in_progress|in_progress|done|blocked
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

## Phase 1: Sofort-Fixes (loop_dev.sh läuft zuverlässig auf macOS)

### REQ-001: grep -oP durch grep -Eo ersetzen (macOS-Kompatibilität)

- **Status:** done
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung

BSD grep (macOS) unterstützt kein `-P` (PCRE). Drei kritische Stellen in `loop_dev.sh`
verwenden `grep -oP` und sind auf macOS defekt:

| Zeile | Funktion | Auswirkung |
|-------|----------|------------|
| 444 | `tag_iteration()` | Git-Tags werden nicht erstellt |
| 896 | Validierungsintervall-Parsing | Fällt auf Default 5 zurück |
| 912 | Repeat-Detection | Agent looopt endlos am selben REQ |

#### Akzeptanzkriterien

- [x] `grep -c 'grep -oP' loop_dev.sh` ergibt `0` (keine PCRE-Aufrufe verbleiben)
- [x] `echo "next_validation_interval: 3" | grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'` ergibt `3` (Validierungsintervall-Parsing korrekt)
- [x] `echo "req: REQ-042a" | grep -Eo 'REQ-[0-9]+[a-z]?'` ergibt `REQ-042a` (Repeat-Detection-Pattern matcht)
- [x] `echo "iter-3-REQ-007" | grep -Eo 'REQ-[0-9]+[a-z]?'` ergibt `REQ-007` (Tag-Pattern matcht)
- [x] NEGATIV: `grep -c 'grep -oP' loop_dev.sh` ergibt `0` (auch kein auskommentierter PCRE-Aufruf als aktive Zeile)
- [x] NEGATIV: `bash -n loop_dev.sh` ergibt Exit 0 (Syntax nach Änderung valide)

#### Verifikation

- `grep -c 'grep -oP' loop_dev.sh` ergibt `0`
- `bash -n loop_dev.sh` ergibt Exit 0
- `echo "next_validation_interval: 3" | grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'` ergibt `3`
- `echo "req: REQ-042a" | grep -Eo 'REQ-[0-9]+[a-z]?'` ergibt `REQ-042a`

#### Technische Notizen

Betroffene Zeilen in loop_dev.sh: 444, 896, 912.
Für Z. 896 (Lookbehind): `grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' | grep -Eo '[0-9]+$'`

---

### REQ-002: summarize_log()-Funktion inline in loop_dev.sh

- **Status:** done
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung

`build_validator_prompt()` ruft `scripts/summarize-log.sh` auf, das nicht existiert.
Der Opus-Validator erhält für jede Iteration nur `_Log summary failed_` — der Validierungsloop
ist faktisch blind.

Erwartetes Ausgabeformat der neuen Funktion:
```
**Iter 3**: 12 tools, $0.08, exit=0
  Top tools: Read(5) Bash(3) Edit(2)
  Files changed: src/foo.ts src/bar.ts
```

#### Akzeptanzkriterien

- [x] `grep -c 'summarize_log()' loop_dev.sh` ergibt `1` (Funktion genau einmal definiert)
- [x] `grep 'summarize-log.sh' loop_dev.sh` ergibt keine Ausgabe (alter Skript-Aufruf entfernt)
- [x] Ausgabe auf ein vorhandenes JSONL-Log enthält eine Zeile mit `tools,` und `exit=`
- [x] Ausgabe enthält eine Zeile die mit `Top tools:` beginnt
- [x] NEGATIV: Bei nicht existierendem Log-Pfad erzeugt die Funktion keine stderr-Ausgabe die mit `No such file` beginnt (graceful handling)
- [x] NEGATIV: Kein `_Log summary failed_` in Validator-Prompts wenn JSONL-Logs vorhanden sind

#### Verifikation

- `grep -c 'summarize_log()' loop_dev.sh` ergibt `1`
- `grep 'summarize-log.sh' loop_dev.sh` ergibt keine Ausgabe
- Funktionstest mit Minimal-Log:
  ```bash
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}' > /tmp/test-iter.jsonl
  echo '{"type":"result","exit_code":0,"total_cost_usd":0.05}' >> /tmp/test-iter.jsonl
  source <(sed -n '/^summarize_log()/,/^}/p' loop_dev.sh) && summarize_log /tmp/test-iter.jsonl
  ```
  Ausgabe enthält `tools,` und `exit=0`
- `summarize_log /tmp/nonexistent.jsonl 2>/dev/null; echo $?` ergibt `0` (kein Absturz)

---

### REQ-003: trap cleanup EXIT ergänzen

- **Status:** done
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung

`trap cleanup INT TERM` in `loop_dev.sh` fängt kein `EXIT`. Bei `set -e`-Abbruch (z.B.
jq-Fehler) werden Lockfile, Temp-Files und Dev-Server nicht bereinigt. Claude-Kindprozesse
laufen als kostenpflichtige Waisen weiter.

Fix: `trap cleanup EXIT INT TERM`. `cleanup()` muss idempotent sein — alle `rm`-Aufrufe
innerhalb `cleanup()` verwenden `rm -f` (kein Fehler wenn Datei fehlt).

#### Akzeptanzkriterien

- [x] `grep 'trap cleanup' loop_dev.sh` liefert eine Zeile die `EXIT` enthält
- [x] `grep 'trap cleanup' loop_dev.sh | grep -v EXIT` ergibt keine Ausgabe (alte Form ohne EXIT ist weg)
- [x] Alle `rm`-Aufrufe innerhalb `cleanup()` nutzen das `-f` Flag
- [x] NEGATIV: `grep 'trap cleanup INT TERM$' loop_dev.sh` ergibt keine Ausgabe (keine alte Zeile ohne EXIT verbleibt)

#### Verifikation

- `grep 'trap cleanup' loop_dev.sh` ergibt `trap cleanup EXIT INT TERM`
- `grep 'trap cleanup' loop_dev.sh | wc -l | tr -d ' '` ergibt `1`
- `sed -n '/^cleanup()/,/^}/p' loop_dev.sh | grep '^\s*rm ' | grep -v 'rm -f'` ergibt keine Ausgabe

#### Technische Notizen

`cleanup()` muss idempotent sein: Wenn `.agent/loop.lock` bereits fehlt, darf ein zweiter
Aufruf keinen Fehler erzeugen. `rm -f` statt `rm` stellt das sicher.

---

### REQ-004: context.md-Länge in loop_dev.sh durchsetzen

- **Status:** done
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** ---

#### Beschreibung

`cat "$CONTEXT_FILE"` in `loop_dev.sh` injiziert `.agent/context.md` ohne Längenprüfung.
Die "max 50 Zeilen"-Regel in AGENT.md ist Konvention, kein Code. Prompt-Overflow möglich.

Fix: `head -50 "$CONTEXT_FILE"` statt `cat "$CONTEXT_FILE"`, plus Warnung wenn die Datei
die Grenze überschreitet.

#### Akzeptanzkriterien

- [x] `grep -E 'head -50.*CONTEXT_FILE|head -50 "\$CONTEXT_FILE"' loop_dev.sh` ergibt mindestens eine Zeile
- [x] `grep 'cat.*CONTEXT_FILE' loop_dev.sh` ergibt keine Ausgabe (alter cat-Aufruf entfernt)
- [x] Eine `.agent/context.md` mit 60 Zeilen führt zu einer Warnung in der loop_dev.sh-Ausgabe
- [x] NEGATIV: Eine 80-zeilige `context.md` führt nicht dazu, dass alle 80 Zeilen in den Prompt injiziert werden

#### Verifikation

- `grep 'head -50' loop_dev.sh` zeigt den Aufruf in der Prompt-Build-Funktion
- `grep 'cat.*CONTEXT_FILE' loop_dev.sh` ergibt keine Ausgabe

---

## Phase 2: Thin TUI Shell (passiver stdout-Consumer)

### REQ-005: Kinema-TUI Grundgerüst (Deno + Ink)

- **Status:** done
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-001, REQ-002, REQ-003

#### Beschreibung

Minimales Deno/Ink-Projekt das `loop_dev.sh`-stdout konsumiert und in einem
Terminal-Dashboard darstellt. Die TUI ist rein passiv — keine eigene Logik,
kein eigener Prompt-Kanal.

Architektur: `KINEMA_TUI=1 ./loop_dev.sh "$@" 2>&1 | deno run --allow-all src/main.ts`

Das Deno-Projekt liegt direkt in `dev/` (neben loop_dev.sh).

#### Akzeptanzkriterien

- [x] `deno.json` existiert mit Tasks `dev`, `build`, `check` und Ink als Dependency
- [x] `src/main.ts` existiert und liest stdin zeilenweise ohne Absturz
- [x] Ink-App rendert mindestens einen statischen Header der den Text "Kinema" enthält
- [x] `deno task check` (TypeScript-Check) ergibt Exit 0
- [x] NEGATIV: `echo "" | deno run --allow-all src/main.ts` stürzt nicht ab (leerer stdin toleriert)
- [x] NEGATIV: TUI bricht nicht ab wenn stdin endet (EOF wird sauber behandelt)

#### Verifikation

- `test -f deno.json && echo OK` ergibt `OK`
- `test -f src/main.ts && echo OK` ergibt `OK`
- `deno task check` ergibt Exit 0
- `echo "test line" | deno run --allow-all src/main.ts; echo "exit: $?"` ergibt `exit: 0`
- `echo "" | deno run --allow-all src/main.ts; echo "exit: $?"` ergibt `exit: 0`

---

### REQ-006: Live-Status-Dashboard

- **Status:** done
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-005

#### Beschreibung

Die TUI liest `.agent/status.json` im Polling-Modus (alle 2 Sekunden) und zeigt REQ-Fortschritt,
aktuelle Phase, Laufzeit und Gesamtkosten in einem Dashboard-Layout an.

#### Akzeptanzkriterien

- [x] REQ-Liste mit Status-Farben: open=grau, in_progress=gelb, done=grün, blocked=rot
- [x] Aktives REQ und aktuelle Phase sind sichtbar
- [x] Gesamtkosten ($) und Laufzeit (mm:ss) werden angezeigt
- [x] `.agent/status.json` wird alle 2 Sekunden gepolt
- [x] NEGATIV: Fehlendes `.agent/status.json` führt nicht zum TUI-Absturz (leerer Zustand angezeigt)
- [x] NEGATIV: Invalides JSON in `.agent/status.json` führt nicht zum TUI-Absturz

#### Verifikation

- TUI starten, `status.json` manuell mit einem `in_progress`-REQ aktualisieren →
  Anzeige aktualisiert sich **innerhalb von 5 Sekunden** (2s Polling + Render-Puffer)
- `echo '{}' > .agent/status.json` → TUI zeigt leeren Zustand, kein Crash
- `echo 'invalid json' > .agent/status.json` → TUI zeigt Fehlerhinweis, kein Crash

#### Technische Notizen

Verifikations-Timeout bewusst 5s (nicht 3s): Bei 2s-Polling-Intervall kann die Anzeige
erst nach 2s + Render-Zeit aktualisieren. 3s wäre zu knapp.

---

### REQ-007: Blocked-Reason-Inline-Anzeige

- **Status:** done
- **Priorität:** P2
- **Größe:** S
- **Abhängig von:** REQ-006

#### Beschreibung

Bei blockierten REQs zeigt die TUI die letzten 3 Fehlversuche an. Datenquellen:
- Iterationsnummer und Zeitstempel aus `.agent/iterations.jsonl`
- Kurzgrund (notes) aus `.agent/status.json`

#### Akzeptanzkriterien

- [x] Blocked-REQs expandieren in der REQ-Liste zu einem Detail-View mit bis zu 3 Einträgen
- [x] Jeder Eintrag zeigt: Iterationsnummer (aus iterations.jsonl), Zeitstempel (aus iterations.jsonl), notes-Text (aus status.json)
- [x] NEGATIV: Mehr als 3 Einträge werden nicht angezeigt (kein Overflow)
- [x] NEGATIV: Wenn zu einem blocked-REQ keine Einträge in `.agent/iterations.jsonl` existieren (oder die Datei fehlt), zeigt der Detail-View "Keine Verlaufsdaten verfügbar" statt Absturz

#### Verifikation

- `status.json` mit einem blocked-REQ (notes="Test-Fehler") + 2 passenden Einträgen in
  `iterations.jsonl` → Detail-View zeigt genau 2 Einträge mit Iterationsnummer und notes
- `status.json` mit blocked-REQ, aber fehlende `iterations.jsonl` →
  Detail-View zeigt "Keine Verlaufsdaten verfügbar", kein Crash
- 5 Iterationseinträge für ein blocked-REQ → Detail-View zeigt maximal 3 Einträge

---

## Phase 3: Event-Schema + Interaktivität

### REQ-008: Event-Schema TypeScript-Typen

- **Status:** done
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** REQ-005

#### Beschreibung

Typisiertes Event-Schema als stabiles Protokoll zwischen `loop_dev.sh`-stdout und TUI.
6 Event-Typen als TypeScript-Interfaces in `src/events.ts`.

#### Akzeptanzkriterien

- [x] `src/events.ts` exportiert genau diese 6 Interfaces: `IterationStart`, `IterationEnd`, `ToolCall`, `ReqStatusChange`, `AgentOutput`, `SystemEvent`
- [x] Jedes Interface erbt von `EventBase` mit den Feldern `ts: number` und `iter: number`
- [x] Ein `LoopEvent` Union-Type ist exportiert der alle 6 Typen umfasst
- [x] `deno task check` läuft ohne TypeScript-Fehler
- [x] NEGATIV: `grep -n 'any' src/events.ts` ergibt keine Ausgabe (keine any-Types)

#### Verifikation

- `test -f src/events.ts && echo OK` ergibt `OK`
- `grep -E 'IterationStart|IterationEnd|ToolCall|ReqStatusChange|AgentOutput|SystemEvent' src/events.ts | wc -l | tr -d ' '` ergibt `6`
- `grep 'LoopEvent' src/events.ts` ergibt eine Zeile
- `grep -n 'any' src/events.ts` ergibt keine Ausgabe
- `deno task check` ergibt Exit 0

#### Technische Notizen

Vollständige Interface-Definitionen (aus `PLAN.md`):

```typescript
type Status = "open" | "in_progress" | "done" | "blocked";
type EventBase = { ts: number; iter: number };

interface IterationStart extends EventBase {
  type: "iteration:start";
  reqId: string | null;
  mode: "implement" | "validate" | "refactor";
  model: string;
}
interface IterationEnd extends EventBase {
  type: "iteration:end";
  durationMs: number; costUsd: number; toolCount: number; exitCode: number;
}
interface ToolCall extends EventBase {
  type: "tool:call";
  toolName: string;
  category: "read" | "write" | "bash" | "task" | "playwright" | "mcp";
  summary: string; taskModel?: string;
}
interface ReqStatusChange extends EventBase {
  type: "req:status"; reqId: string; from: Status; to: Status; reason?: string;
}
interface AgentOutput extends EventBase {
  type: "agent:output"; text: string; isBlocker: boolean; statusBlock?: string;
}
interface SystemEvent extends EventBase {
  type: "system:event";
  kind: "timeout" | "low_activity" | "crash_recovery" | "blocker_detected" | "auto_blocked" | "all_done";
  message: string;
}
type LoopEvent = IterationStart | IterationEnd | ToolCall | AgentOutput | ReqStatusChange | SystemEvent;
```

---

### REQ-009: Pause/Skip/Edit-Interaktivität

- **Status:** done
- **Priorität:** P2
- **Größe:** M
- **Abhängig von:** REQ-006, REQ-008

#### Beschreibung

Erste Steuerungsmöglichkeiten in der TUI: `p` pausiert nach aktueller Iteration,
`s` überspringt das aktuelle REQ, `e` öffnet context.md im Editor.

Kommunikation mit `loop_dev.sh` über zwei Dateisystem-Signale:
- **Pause:** TUI erstellt `.agent/pause.flag` → `loop_dev.sh` wartet am Iterationsanfang bis Datei fehlt
- **Skip:** TUI schreibt `skip` in `.agent/control.fifo` → `loop_dev.sh` liest non-blocking und setzt REQ auf `blocked`

Dieses REQ umfasst **beide Seiten**: die TUI-Tastaturlogik und die loop_dev.sh-Integration.

#### Akzeptanzkriterien

- [x] Taste `p`: `.agent/pause.flag` existiert unmittelbar nach dem Tastendruck
- [x] Taste `p` nochmals (toggle): `.agent/pause.flag` wird wieder gelöscht
- [x] Taste `s`: `skip` wurde in `.agent/control.fifo` geschrieben
- [x] `loop_dev.sh` prüft am Anfang jeder Iteration ob `.agent/pause.flag` existiert und wartet ggf.
- [x] `loop_dev.sh` liest non-blocking aus `.agent/control.fifo` und setzt REQ auf `blocked` bei `skip`
- [x] Taste `e`: `$EDITOR` öffnet sich mit `.agent/context.md` als Argument (wenn `$EDITOR` gesetzt)
- [x] NEGATIV: Unbekannte Tasten haben keinen Effekt, kein Absturz
- [x] NEGATIV: Wenn `$EDITOR` nicht gesetzt ist, zeigt die TUI einen Hinweis statt Absturz

#### Verifikation

- TUI starten → `p` drücken → `test -f .agent/pause.flag && echo PAUSED` ergibt `PAUSED`
- `p` nochmals → `test ! -f .agent/pause.flag && echo RESUMED` ergibt `RESUMED`
- `grep 'pause.flag' loop_dev.sh` ergibt mindestens eine Zeile
- `grep 'control.fifo' loop_dev.sh` ergibt mindestens eine Zeile
- `bash -n loop_dev.sh` ergibt Exit 0 (Syntax valide nach Änderungen)
- `e` drücken ohne gesetzten `$EDITOR` → TUI zeigt Hinweis, kein Absturz

#### Technische Notizen

FIFO non-blocking Read: `read -t 0 cmd < .agent/control.fifo 2>/dev/null || true`
`loop_dev.sh` legt `.agent/control.fifo` beim Start via `mkfifo` an (falls nicht existent).
Pause-Check vor jedem claude-Aufruf: `while [ -f ".agent/pause.flag" ]; do sleep 1; done`

---

## Phase 3: Events-Stream + Split-Window TUI

### REQ-010: `emit_event()` in `loop_dev.sh`

- **Status:** done
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-009

#### Beschreibung

`loop_dev.sh` emittiert strukturierte JSON-Events nach `.agent/events.jsonl`, wenn `KINEMA_TUI=1` gesetzt ist. Die Funktion `emit_event()` schreibt eine JSON-Zeile in die Datei. Emit-Punkte: `iteration:start` (vor Claude-Start), `tool:call` (pro Tool-Call in `parse_progress`), `iteration:end` (nach ITER_COST/ITER_TOOLS), `req:status` (skip/auto-block), `system:event` (all_done).

#### Akzeptanzkriterien

- [ ] `grep -c 'emit_event()' loop_dev.sh` ergibt `1` (Funktion genau einmal definiert)
- [ ] `grep 'emit_event' loop_dev.sh | wc -l` ergibt mindestens `6` (Funktion + 5 Aufrufstellen)
- [ ] Bei `KINEMA_TUI=0` (oder ungesetzt) schreibt kein Emit-Aufruf in `.agent/events.jsonl`
- [ ] Bei `KINEMA_TUI=1` enthält `.agent/events.jsonl` nach einer Iteration Zeilen mit `iteration:start`, `tool:call`, `iteration:end`
- [ ] NEGATIV: `bash -n loop_dev.sh` ergibt Exit 0 (Syntax valide)

#### Verifikation

- `grep -c 'emit_event()' loop_dev.sh` ergibt `1`
- `KINEMA_TUI=1 ./loop_dev.sh` starten → `cat .agent/events.jsonl | head -3 | jq .type` zeigt `"iteration:start"`
- `bash -n loop_dev.sh` ergibt Exit 0

---

### REQ-011: `useEventsReader` Hook

- **Status:** done
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** REQ-010

#### Beschreibung

Neuer Deno/Ink-Hook `src/hooks/useEventsReader.ts`. Liest `events.jsonl` alle 500ms (Byte-Offset-Tracking mit `useRef`), gibt `EventsState` zurück: `{ events: LoopEvent[], currentIter: number, currentReq: string | null, totalLiveCost: number }`. Importiert `LoopEvent` aus `../events.ts`.

#### Akzeptanzkriterien

- [ ] `test -f src/hooks/useEventsReader.ts && echo OK` ergibt `OK`
- [ ] `grep 'useEventsReader' src/hooks/useEventsReader.ts` ergibt mindestens eine Zeile
- [ ] `grep 'EventsState' src/hooks/useEventsReader.ts` ergibt mindestens eine Zeile
- [ ] `deno task check` ergibt Exit 0 (TypeScript-Check sauber)
- [ ] NEGATIV: Fehlendes `events.jsonl` führt nicht zum Absturz (leerer Zustand)

#### Verifikation

- `test -f src/hooks/useEventsReader.ts && echo OK` ergibt `OK`
- `deno task check` ergibt Exit 0
- `grep -n 'any' src/hooks/useEventsReader.ts` ergibt keine Ausgabe (keine any-Types)

---

### REQ-012: Split-Window Dashboard

- **Status:** done
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-011

#### Beschreibung

`src/components/Dashboard.ts` zeigt ein Split-Window Layout: links (40%) die REQ-Liste (aus `useStatusPoller`), rechts (60%) einen scrollenden Activity-Feed (aus `useEventsReader`) mit den letzten ~20 `tool:call`-Events + aktueller Iteration als Header. Farbkodierung: `bash`=yellow, `write`=red, `read`=blue, `task`=magenta, `playwright`=cyan, `mcp`=gray. Footer unter beiden Spalten mit Kosten und Tastatur-Hints.

#### Akzeptanzkriterien

- [ ] `grep 'flexDirection.*row' src/components/Dashboard.ts` ergibt mindestens eine Zeile (Row-Layout)
- [ ] `grep 'useEventsReader' src/components/Dashboard.ts` ergibt mindestens eine Zeile
- [ ] TUI zeigt nach Start zwei Spalten (REQ-Liste links, Activity-Feed rechts)
- [ ] Tool-Call-Farben: bash=yellow, write=red, read=blue, task=magenta, playwright=cyan, mcp=gray
- [ ] `deno task build` erzeugt neues `kinema-tui` Binary
- [ ] NEGATIV: Leere `events.jsonl` führt nicht zum TUI-Absturz

#### Verifikation

- `grep 'flexDirection.*row' src/components/Dashboard.ts` ergibt mindestens eine Zeile
- `deno task check` ergibt Exit 0
- `deno task build` ergibt Exit 0
