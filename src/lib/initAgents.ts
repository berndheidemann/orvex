import type {
  AgentStatus,
  RoundStatus,
  PhaseState,
  RoundState,
} from "../types.ts";
// ── Constants ──────────────────────────────────────────────────

export const DEFAULT_MODEL = "claude-opus-4-6";
export const SYNTH_MODEL = "claude-sonnet-4-6";  // Synthese: immer Sonnet (schnell + gut)

export const PRD_OUTPUT_PATH = "PRD.md";
export const ARCH_OUTPUT_PATH = "architecture.md";

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
    name: "Product Manager",
    persona: "Du bist Product Manager. Dein Fokus: Nutzerbedürfnisse, User Journeys, Priorisierung, MVP-Scope, messbarer Nutzen. Du denkst in Problemen und Zielen — nicht in Lösungen.",
  },
  {
    name: "UX Researcher",
    persona: "Du bist UX Researcher. Dein Fokus: echtes Nutzerverhalten, Schmerzpunkte, Fehlerszenarien, Accessibility, mentale Modelle. Du fragst immer: Was macht der Nutzer wirklich — und was nicht?",
  },
  {
    name: "Business Analyst",
    persona: "Du bist Business Analyst. Dein Fokus: Vollständigkeit der Anforderungen, Edge Cases, Widersprüche zwischen Anforderungen, klare Akzeptanzkriterien, explizite Out-of-Scope-Definitionen. Du deckst auf, was fehlt oder unklar ist.",
  },
];

export const ARCH_AGENTS: Agent[] = [
  {
    name: "Software-Architekt",
    persona: "Du bist Software-Architekt. Dein Fokus: Architektur-Pattern, ADRs, System- und Datenmodell, Tech-Stack-Entscheidungen, langfristige Wartbarkeit und Erweiterbarkeit.",
  },
  {
    name: "Senior Developer",
    persona: "Du bist Senior Developer. Dein Fokus: Tooling, Testing-Strategie, Build-System, DX, Implementierbarkeit. Du erkennst wo Architekturpläne an der Realität scheitern.",
  },
  {
    name: "DevOps Engineer",
    persona: "Du bist DevOps & Security Engineer. Dein Fokus: Deployment, Infrastruktur, Skalierbarkeit, Monitoring, Sicherheit. Du denkst vom Betrieb her rückwärts zur Architektur.",
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

    return `AUFGABE: Synthetisiere die folgenden Diskussionsbeiträge zu einem vollständigen PRD-Dokument.

AUSGABEREGELN (zwingend):
- Deine Antwort beginnt mit dem Zeichen '#'. Kein Text davor.
- Schreibe KEINE Dateien. Führe KEINE Befehle aus. Benutze KEINE Tools.
- Keine Einleitung, keine Bestätigung, kein <k>-Block.
- Deine Textantwort IST das Dokument — vollständig und direkt.

Projektbeschreibung: ${description}

Finale Positionen aus der PRD-Diskussion:

${all}

Halte dich exakt an die folgende Dokumentstruktur. Beginne jetzt direkt mit "# PRD —".

# PRD — [Projektname aus Beschreibung ableiten]

> [Ein-Satz-Beschreibung]

---

## User Journeys

Beschreibe 2–4 zentrale Nutzerflüsse als nummerierte Schritte. Fokus auf den Hauptpfad + wichtigsten Fehlerfall.

### UJ-001: [Journey-Name]
**Ziel:** [Was will der Nutzer erreichen?]

1. [Schritt]
2. [Schritt]
3. [Schritt]

**Fehlerfall:** [Was passiert wenn es schiefläuft?]

---

## Requirements

Jede Anforderung MUSS als Markdown-Heading "### REQ-NNN:" beginnen.
Priorisiere P0 und P1. P2 nur aufnehmen wenn klar differenzierend.

### REQ-001: [Titel]

- **Status:** open
- **Priorität:** P0|P1|P2
- **Größe:** XS|S|M|L
- **Abhängig von:** ---

#### Beschreibung
[2–4 Sätze]

#### Akzeptanzkriterien
- [ ] ...

#### Verifikation
\`[Befehl]\` → \`[Ausgabe]\`

#### Content-Verifikation (nur bei Content-REQs — weglassen wenn nicht zutreffend)
**Content-Typ:** text|visual|interactive
**Re-Generierung:** \`[Befehl oder Schritt um den Content neu zu erzeugen — z.B. Seeder, API-Call, CLI-Befehl]\`
**Korrektheitskriterium:** [Woran erkennt man dass der generierte Content inhaltlich richtig ist?]

---

Falls Requirements sich widersprechen (z.B. REQ-A schreibt "kein Backend" vor, REQ-B
referenziert \`/api/...\`-Endpunkte in der Verifikation): Ergänze direkt unterhalb der
Verifikation-Section des betroffenen REQs:

> ⚠️ **Möglicher Widerspruch mit REQ-XXX:** [Ein Satz was widersprüchlich ist.]

Nicht auflösen — nur sichtbar machen. Die Auflösung ist Aufgabe der Architekturphase.

Nur Markdown. Status immer 'open'.`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

Projektbeschreibung: ${description}

Führe zuerst \`ls\` im Projektverzeichnis aus. Lies alle \`.txt\`- und \`.md\`-Dateien die wie eine Projektbeschreibung aussehen (kurze, sprechende Namen — nicht \`PRD.md\`, \`architecture.md\`, \`AGENT.md\` o.ä.). Ist die "Projektbeschreibung" oben leer, sind diese Dateien die einzige Quelle. Berichte nicht über das Fehlen von Dateien.

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

    return `AUFGABE: Synthetisiere die folgenden Diskussionsbeiträge zu einem vollständigen Architektur-Dokument.

AUSGABEREGELN (zwingend):
- Deine Antwort beginnt mit dem Zeichen '#'. Kein Text davor.
- Schreibe KEINE Dateien. Führe KEINE Befehle aus. Benutze KEINE Tools.
- Keine Einleitung, keine Bestätigung, kein <k>-Block.
- Deine Textantwort IST das Dokument — vollständig und direkt.

PRD des Projekts:
${prdContent}

Finale Positionen aus der Architektur-Diskussion:

${all}

Beginne jetzt direkt mit "# Architektur-Entscheidungen". Jede Entscheidung MUSS als Markdown-Heading "## ADR-NNN:" beginnen.

WICHTIG — Typ-Klassifikation für jedes ADR:
- Typ A (reine Implementierungsentscheidung — nur das WIE ändert sich): kein **Einschränkt:**-Feld
- Typ B (schränkt ein PRD-Requirement inhaltlich ein — das WAS ändert sich):
  Füge **Einschränkt:** REQ-XXX, REQ-YYY als letztes Feld ein.
  Typ-A-Beispiel: "SM-2 eigenimplementiert statt Bibliothek" ändert kein Requirement.
  Typ-B-Beispiel: Ein ADR "kein Laufzeit-Backend" betrifft nicht nur das offensichtlichste
  Requirement — es betrifft JEDES REQ dessen Verifikation-Section einen API-Endpunkt nennt,
  JEDES REQ das Sync oder Cross-Device erwähnt, und jedes REQ das serverseitige Logik impliziert.

Pflicht-Scan für Typ-B-ADRs: Gehe die Anforderungen aus dem PRD systematisch durch.
Für jedes ADR das das WAS eines Requirements berührt: liste ALLE betroffenen REQs im
Einschränkt:-Feld — nicht nur den erstgefundenen oder offensichtlichsten.

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
**Einschränkt:** REQ-XXX  ← nur bei Typ B, sonst diese Zeile weglassen

---

[weitere ADRs für Sprache, Framework, DB, Testing, Build, Deployment]`;
  }

  if (roundIdx === 0) {
    return `${K_HEADER}${agent.persona}

PRD des Projekts:
${prdContent}

Analysiere die Anforderungen aus deiner Perspektive und schlage eine Architektur vor.
Falls bereits relevanter Code oder architecture.md im Projektordner existiert, kannst du ihn lesen — berichte aber nicht über das Fehlen von Dateien, das ist kein Thema.
Sei konkret (echte Technologien, echte Versionsnummern wo relevant).
Identifiziere auch Widersprüche im PRD (unvereinbare Anforderungen,
implizite Konflikte) und zeige wie deine Architektur sie auflöst.
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
3. Was fehlt aus deiner Fachsicht — auch im PRD selbst (Widersprüche, Lücken)?
4. Gib deine verfeinerte finale Position für diese Runde aus — vollständig,
   nicht nur als Delta. Die Synthese sieht nur diese Runde.`;
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
      .filter((l: string) => /REQ-\d+/.test(l) && !l.startsWith("<"))
      .map((l: string) => l.replace(/^#+\s+/, "").replace(/\*\*/g, "").trim());
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
    .filter((l: string) => /ADR-\d+/.test(l) && !l.startsWith("<"))
    .map((l: string) => l.replace(/^#+\s+/, "").replace(/\*\*/g, "").trim());
  return [
    "Synthese · architecture.md erstellt",
    SUMMARY_DIVIDER,
    "",
    ...(adrs.length > 0
      ? adrs.map((a: string) => `  ✓ ${a}`)
      : ["  (keine ADR-Abschnitte gefunden)"]),
  ];
}
