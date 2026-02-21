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
