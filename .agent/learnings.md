# Persistente Erkenntnisse

> Nur appenden — niemals bestehende Eintraege loeschen oder aendern.
> Format: ### [Datum] — [Thema] + kurze Beschreibung (max 5 Zeilen)

<!-- Erste Erkenntnis hier einfuegen -->

### 2026-02-21 — macOS LC_NUMERIC und awk-printf

Auf macOS mit nicht-englischer Locale (z.B. de_DE) nutzt awk Komma als Dezimaltrennzeichen.
`awk '{printf "%.2f", 0.05}'` ergibt `0,00` statt `0.05`.
Fix: immer `LC_NUMERIC=C awk` verwenden — analog zu bestehenden Aufrufen im Code.

### 2026-02-21 — grep -c Exit Code bei 0 Treffern

`grep -c 'pattern' file` gibt Exit 1 zurück wenn Count=0 (keine Treffer).
In Bash-Prüfketten mit `&&` bricht das ab. Lösung: `(grep -c ... || true)` verwenden.

### 2026-02-21 — Deno + Ink: .ts statt .tsx (deno check Kompatibilität)

`deno check` schlägt mit `.tsx` + `npm:react@18` fehl (TS2875: `react/jsx-runtime` nicht
auflösbar). Lösung: `.ts` mit `React.createElement` verwenden. `strict: true` erfordert
explizite Typen in Callbacks (z.B. `(prev: string[]) =>` statt `(prev) =>`).
`node:readline` statt `Deno.stdin` verwenden, da Ink den Node-Compat-Layer nutzt.

### 2026-02-21 — Deno: import.meta.url für relative Pfadauflösung

`Deno.cwd()` ist abhängig vom Arbeitsverzeichnis beim Aufruf. Besser: `new URL("../relative/path", import.meta.url).pathname`.
Dies ist unabhängig davon, wo die TUI gestartet wird. Gilt besonders für Polling-Hooks die
auf Konfigurationsdateien außerhalb des src/-Verzeichnisses zugreifen.

### 2026-02-21 — Validator: TUI terminiert nicht bei stdin EOF

Die Ink-TUI (src/main.ts) terminiert nicht wenn stdin schließt. Da kein stdin-Reader mehr
existiert (nur status.json-Polling), läuft die TUI perpetuell. Für die Pipe-Architektur
braucht es einen Exit-Mechanismus (z.B. SIGPIPE-Handler). Kein REQ-Revert nötig.

### 2026-02-21 — Validator: WIP-Commits vor Tests vermeiden

In iter-001 wurde ein WIP-Checkpoint committed bevor Akzeptanzkriterien getestet wurden.
Best Practice: WIP-Commits erst NACH mindestens `bash -n` und einem Smoke-Test.

### 2026-02-21 — macOS FIFO: read -t 0 blockiert wegen open()-Syscall

`read -t 0 cmd < fifo` blockiert auf macOS, weil `open(fifo, O_RDONLY)` den Prozess
pausiert bis ein Schreiber erscheint. Lösung: `read -t 1 cmd <> fifo` (read-write mode)
öffnet den FIFO ohne zu blockieren. TUI schreibt via `Deno.Command("bash", ...).spawn()`
asynchron — der bash-Prozess blockiert im Hintergrund bis loop_dev.sh mit `<>` liest.

### 2026-02-24 — AWK init_status_json: Markdown-Zeile statt Wert parsen

`init_status_json` AWK parsed Priority-Zeilen wie `- **Priority:** P1` — wenn das
Markdown-Format abweicht (z.B. `- **Priority:** P1` mit Leerzeichen), kann der volle
Markdown-String statt nur `P1` in status.json landen. REQ-016 hatte `"- **Priority:** P1"`.
Validator hat korrigiert. Sonnet muss bei PRD-Edits auf konsistentes Format achten.

### 2026-02-24 — Validator: Alle 4 Iter (001–004) ohne Regelverstöße

Erste Validierung nach 4 Iterationen: kein Scope-Guard-Verstoß, keine übersprungenen
Tests, keine ignorierten Fehler, kein git add -A. Sonnet-Agent arbeitet regelkonform.
WIP-Commits kamen jeweils NACH Test-Durchläufen (Verbesserung gegenüber früherem Befund).

### 2026-02-24 — React + deno test: --allow-env nötig bei React-Import

`deno test src/` ohne Flags schlägt fehl wenn ein Test-File transitiv React importiert.
React CJS liest `process.env.NODE_ENV` beim Laden — das erfordert `--allow-env`.
Fix: Pure-Funktionen in separates File ohne React-Import (z.B. `reviewFlowUtils.ts`),
das Test-File importiert nur von dort. React-Hooks bleiben in eigenem File (nicht direkt testbar).

### 2026-02-24 — Validator: Iter 005–009 PASS, 0 Reverts

Zweite Validierung: 19 done-REQs geprüft, alle ACs erfüllt. Keine Scope-Guard-Verstöße.
Sonnet: Bei bash-only Änderungen trotzdem `deno test` nach Edits re-runnen (iter 008 fehlte).
`deno check` in Preflight nicht vergessen, auch wenn nur bash-Files geändert werden (iter 009).
Loop_dev.sh nutzt BASH_SOURCE statt FRAMEWORK_DIR — funktional äquivalent, aber ADR-013 Abweichung.

### 2026-02-24 — Validator: Iter 010–013 PASS, 0 Reverts

Dritte Validierung: 27 done-REQs geprüft, alle ACs erfüllt. Keine Scope-Guard-Verstöße.
Iter-011 (RF-003) war vorbildlich: 10 neue Tests, iterative Fehlerbehebung, 4+ Verifikationsläufe.
Iter-012 (RF-004) und Iter-013 (RF-005) haben neue Module/Komponenten ohne dedizierte Tests
extrahiert (`debateUtils.ts`, `RunnerDashboard`). Regel: Bei Refactoring-Extraktionen mindestens
Smoke-Tests für die neuen Exports schreiben, auch wenn bestehende Integration-Tests grün sind.

### 2026-02-24 — REQ-011 AC Wording: injectSpikeReq ist TypeScript, nicht Bash

PRD REQ-011 AC#3 bezeichnet `injectSpikeReq` als "bash-Funktion". Die Funktion liegt in
`src/lib/initAgents.ts:429` (TypeScript). Funktional korrekt — nutzt `/^### REQ-\d+:/m` Regex
und skippt natürlich CONT-Abschnitte. Bei zukünftigen PRD-Edits auf korrekte Technologie-
Bezeichnungen in ACs achten.
