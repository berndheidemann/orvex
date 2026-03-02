# Orvex — Entwicklungshinweise für Claude

## Versionsnummer

Die Versionsnummer liegt in `src/version.ts` (einzige Source of Truth):

```typescript
export const VERSION = "0.9.0";
```

**Bei jedem Commit mit user-facing Änderungen muss die Version erhöht werden.**

Konvention (Semver):
- Patch (`0.9.x`): Bugfixes, kleine Anpassungen
- Minor (`0.x.0`): Neue Features, neue Phasen, neue Befehle
- Major (`x.0.0`): Breaking changes am Init-Flow oder AGENT.md-Struktur

Die Version wird angezeigt in:
- TUI-Header (`Orvex v0.9.0 — ...`)
- `orvex --version`
