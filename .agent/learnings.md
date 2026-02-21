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
