import type {
  AgentStatus,
  RoundStatus,
  PhaseState,
  RoundState,
} from "../types.ts";
import { AGENT_DIR } from "./agentDir.ts";

// ── Constants ──────────────────────────────────────────────────

export const DEFAULT_MODEL = "claude-opus-4-6";

export const PRD_OUTPUT_PATH = "PRD.md";
export const ARCH_OUTPUT_PATH = `${AGENT_DIR}/architecture.md`;

const K_HEADER = `AUSGABEFORMAT: Deine Antwort beginnt zwingend mit:
<k>
• Stichwort: Kernaussage (max. 8 Wörter)
• Stichwort: Kernaussage (max. 8 Wörter)
• Stichwort: Kernaussage (max. 8 Wörter)
</k>
Danach folgt deine Analyse. Kein Text vor dem <k>-Block.

---
`;

const SUMMARY_DIVIDER = "─".repeat(26);

// ── Agent definitions ──────────────────────────────────────────

export interface Agent {
  name: string;
  persona: string;
}

export const PRD_AGENTS: Agent[] = [
  {
    name: "Architekt",
    persona: "Du bist Software-Architekt. Dein Fokus: technische Machbarkeit, Systemdesign, Datenmodelle, APIs, nicht-funktionale Anforderungen.",
  },
  {
    name: "Product Manager",
    persona: "Du bist Product Manager. Dein Fokus: Nutzerbedürfnisse, User Journeys, Priorisierung, MVP-Scope, messbarer Nutzen.",
  },
  {
    name: "Senior Developer",
    persona: "Du bist Senior Developer. Dein Fokus: Implementierbarkeit, Edge Cases, technische Schuld, realistische Größenschätzungen.",
  },
];

export const ARCH_AGENTS: Agent[] = [
  {
    name: "Tech Lead",
    persona: "Du bist Tech Lead. Dein Fokus: Architektur-Pattern, Tech-Stack, Projektstruktur, langfristige Wartbarkeit.",
  },
  {
    name: "Senior Developer",
    persona: "Du bist Senior Developer. Dein Fokus: Tooling, Testing-Stack, Build-System, praktische Umsetzbarkeit, DX.",
  },
  {
    name: "DevOps Engineer",
    persona: "Du bist DevOps & Security Engineer. Dein Fokus: Deployment, Skalierbarkeit, Sicherheit, Monitoring, Infrastruktur.",
  },
];

// ── Phase structure factory ────────────────────────────────────

export function makePhases(prdRounds: number, archRounds: number): PhaseState[] {
  const makeRounds = (agents: Agent[], numRounds: number): RoundState[] => [
    ...Array.from({ length: numRounds }, (_, i) => ({
      label: `Runde ${i + 1}`,
      status: "pending" as RoundStatus,
      agents: agents.map((a) => ({ name: a.name, status: "pending" as AgentStatus })),
    })),
    {
      label: "Synthese",
      status: "pending" as RoundStatus,
      agents: [{ name: "Writer", status: "pending" as AgentStatus }],
    },
  ];

  return [
    {
      id: "prd",
      label: "PRD-Generierung",
      outputPath: PRD_OUTPUT_PATH,
      status: "running",
      rounds: makeRounds(PRD_AGENTS, prdRounds),
      startedAt: null,
    },
    {
      id: "arch",
      label: "Architektur-Entwurf",
      outputPath: ARCH_OUTPUT_PATH,
      status: "pending",
      rounds: makeRounds(ARCH_AGENTS, archRounds),
      startedAt: null,
    },
  ];
}

// ── Prompt builders ────────────────────────────────────────────

function formatOthersOutput(
  allOutputs: string[][],
  roundIdx: number,
  ownAgentIdx: number,
  agents: Agent[],
): string {
  return agents
    .map((a, i) => {
      const out = allOutputs[roundIdx]?.[i];
      if (!out) return null;
      return i === ownAgentIdx
        ? `--- Deine eigene Einschätzung (Runde ${roundIdx + 1}) ---\n${out}`
        : `--- ${a.name} (Runde ${roundIdx + 1}) ---\n${out}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function buildPrdPrompt(
  roundIdx: number,
  agentIdx: number,
  description: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const agent = PRD_AGENTS[agentIdx];
  const isSynthesis = roundIdx === numRounds;

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = PRD_AGENTS.map((a, i) =>
      `--- ${a.name} (finale Position) ---\n${lastRound[i] ?? "(keine Ausgabe)"}`
    ).join("\n\n");

    return `Du bist technischer Writer. Erstelle die finale PRD.md.

Projektbeschreibung: ${description}

Die Diskussion zwischen Architekt, Product Manager und Senior Developer hat folgende finale Positionen ergeben:

${all}

Gib NUR das fertige Markdown-Dokument aus — keine Einleitung, keine Erklärungen:

# PRD — [Projektname aus Beschreibung ableiten]

> [Ein-Satz-Beschreibung]

---

### REQ-001: [Titel]

- **Status:** open
- **Priorität:** P0|P1|P2
- **Größe:** S|M
- **Abhängig von:** ---

#### Beschreibung
...

#### Akzeptanzkriterien
- [ ] ...

#### Verifikation
- \`[Befehl]\` → \`[Ausgabe]\`

#### User Journey
(nur bei UI-Features)
1. Nutzer öffnet [Seite]
2. Nutzer [Aktion]
3. System zeigt [Ergebnis]
4. Fehlerfall: [Eingabe] → [Fehlermeldung]

---

Status immer 'open'. Alle REQs vollständig. Nur Markdown.`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Projektbeschreibung: ${description}

Analysiere das Projekt aus deiner Perspektive und schlage Requirements vor.
Nutze dieses Format für jedes REQ:

### REQ-NNN: [Titel]
- Priorität: P0|P1|P2
- Größe: S|M
- Abhängig von: ---
#### Beschreibung
...
#### Akzeptanzkriterien
- [ ] ...

Sei konkret und aus deiner Fachperspektive heraus. Kein generisches Aufzählen — was siehst du was andere vielleicht übersehen?`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, PRD_AGENTS);

  return `${K_HEADER}${agent.persona}

Projektbeschreibung: ${description}

Runde ${roundIdx + 1} der Diskussion. Hier sind die Einschätzungen aus Runde ${roundIdx}:

${context}

Reagiere auf die anderen Perspektiven:
1. Was übersiehst du in deiner eigenen Runde-${roundIdx}-Position?
2. Was fehlt bei den anderen?
3. Wo gibt es Konflikte zwischen den Perspektiven — wie löst du sie?
4. Gib deine verfeinerte, finale Position für diese Runde aus (vollständige REQ-Liste).`;
}

export function buildArchPrompt(
  roundIdx: number,
  agentIdx: number,
  prdContent: string,
  allOutputs: string[][],
  numRounds: number,
): string {
  const agent = ARCH_AGENTS[agentIdx];
  const isSynthesis = roundIdx === numRounds;
  const today = new Date().toISOString().slice(0, 10);

  if (isSynthesis) {
    const lastRound = allOutputs[numRounds - 1] ?? [];
    const all = ARCH_AGENTS.map((a, i) =>
      `--- ${a.name} (finale Position) ---\n${lastRound[i] ?? "(keine Ausgabe)"}`
    ).join("\n\n");

    return `Du bist technischer Writer. Erstelle die finale architecture.md.

PRD des Projekts:
${prdContent}

Finale Positionen aus der Architektur-Diskussion:

${all}

Gib NUR das Markdown aus — keine Einleitung:

# Architektur-Entscheidungen

> [Ein-Satz-Zusammenfassung des Ansatzes]

## Überblick
[3–5 Sätze: Stack, Pattern, Begründung]

## Projektstruktur
\`\`\`
[Verzeichnisbaum der wichtigsten Ordner/Dateien]
\`\`\`

---

## ADR-001: [Titel] (${today})

**Kontext:** ...
**Entscheidung:** ...
**Begründung:** ...
**Konsequenzen:** ...

---

[weitere ADRs für Sprache, Framework, DB, Testing, Build, Deployment]`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

PRD des Projekts:
${prdContent}

Analysiere die Anforderungen aus deiner Perspektive und schlage eine Architektur vor.
Sei konkret (echte Technologien, echte Versionsnummern wo relevant).
Was ist aus deiner Fachperspektive besonders wichtig?`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, ARCH_AGENTS);

  return `${K_HEADER}${agent.persona}

PRD:
${prdContent}

Runde ${roundIdx + 1} der Diskussion. Hier sind die Einschätzungen aus Runde ${roundIdx}:

${context}

Reagiere aus deiner Perspektive:
1. Was stimmst du zu?
2. Was widersprichst du und warum?
3. Was fehlt aus deiner Fachsicht?
4. Gib deine verfeinerte finale Position für diese Runde aus.`;
}

// ── Output utilities ───────────────────────────────────────────

export function extractKernthese(output: string): string {
  // 1. <k>…</k> tag
  const match = output.match(/<k>([\s\S]*?)<\/k>/i);
  if (match) return match[1].trim();

  // 2. Bullet points (•, -, *)
  const bullets = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^[•\-\*]/.test(l))
    .slice(0, 4)
    .join("\n");
  if (bullets) return bullets;

  // 3. Numbered list lines (1. 2. …)
  const numbered = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^\d+\./.test(l))
    .slice(0, 4)
    .join("\n");
  if (numbered) return numbered;

  // 4. First 3 non-empty, non-heading lines
  const lines = output
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 20 && !l.startsWith("#") && !l.startsWith("---"))
    .slice(0, 3)
    .join("\n");
  return lines || "—";
}

export function formatRoundSummary(
  roundNum: number,
  agents: Agent[],
  outputs: string[],
): string[] {
  const lines: string[] = [`Runde ${roundNum} · Kernargumente`, SUMMARY_DIVIDER, ""];
  for (let i = 0; i < agents.length; i++) {
    lines.push(agents[i].name + ":");
    const kernthese = extractKernthese(outputs[i]);
    const bullets = kernthese
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const b of bullets.length > 0 ? bullets : ["—"]) {
      lines.push("  " + b);
    }
    lines.push("");
  }
  return lines;
}

export function formatSynthesisSummary(synthOut: string, phaseId: "prd" | "arch"): string[] {
  if (phaseId === "prd") {
    const reqs = synthOut
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => /^#{1,4}\s+REQ-\d+/.test(l))
      .map((l: string) => l.replace(/^#+\s+/, "").trim());
    return [
      "Synthese · PRD.md erstellt",
      SUMMARY_DIVIDER,
      "",
      ...(reqs.length > 0
        ? reqs.map((r: string) => `  ✓ ${r}`)
        : ["  (keine REQ-Abschnitte gefunden)"]),
    ];
  }

  const adrs = synthOut
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^#{1,4}\s+ADR-\d+/.test(l))
    .map((l: string) => l.replace(/^#+\s+/, "").trim());
  return [
    "Synthese · architecture.md erstellt",
    SUMMARY_DIVIDER,
    "",
    ...(adrs.length > 0
      ? adrs.map((a: string) => `  ✓ ${a}`)
      : ["  (keine ADR-Abschnitte gefunden)"]),
  ];
}
