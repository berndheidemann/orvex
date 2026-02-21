# Architektur-Entscheidungen

> Nur appenden — bestehende ADRs niemals loeschen oder aendern.
> Format: ADR-NNN mit Kontext, Entscheidung, Begruendung, Konsequenzen.

<!-- Erste ADR hier einfuegen, wenn eine Architekturentscheidung getroffen wird -->

---

## ADR-001: .ts mit React.createElement statt .tsx mit JSX (2026-02-21, REQ-005)

**Kontext:** REQ-005 erfordert ein Ink-basiertes TUI-Grundgerüst. Ink nutzt React. Deno 2.x unterstützt sowohl `.ts` als auch `.tsx`.
**Entscheidung:** Verwende `.ts`-Dateien mit explizitem `React.createElement` (aliasiert als `h`) statt `.tsx`-Dateien mit JSX.
**Begründung:** `deno check` schlägt mit `.tsx` + `npm:react@18` fehl (TS2875: `react/jsx-runtime` nicht auflösbar). `createElement` besteht Type-Check fehlerfrei.
**Konsequenzen:** Etwas verboserer Code. Bei zukünftigen Deno/React-Verbesserungen kann auf JSX migriert werden.

---

## ADR-002: node:readline statt Deno.stdin für stdin-Lesen (2026-02-21, REQ-005)

**Kontext:** Die TUI muss stdin zeilenweise lesen. Deno bietet native APIs und Node-Compat-Layer.
**Entscheidung:** Verwende `node:readline` mit `process.stdin`.
**Begründung:** Ink nutzt intern `process.stdin`/`process.stdout` (Node-Compat). Mischen von `Deno.stdin` und `process.stdin` auf dem gleichen FD kann zu Race Conditions führen.
**Konsequenzen:** Abhängigkeit vom Deno-Node-Compat-Layer (stabil seit Deno 2.0).
