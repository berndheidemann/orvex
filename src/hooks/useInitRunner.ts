import React from "react";

const { useState, useEffect, useRef, useCallback } = React;

const AGENT_DIR = (
  Deno.env.get("KINEMA_AGENT_DIR") ??
  new URL("../../.agent", import.meta.url).pathname
).replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────

export type AgentStatus = "pending" | "running" | "done";
export type RoundStatus = "pending" | "running" | "done";
export type PhaseStatus = "pending" | "running" | "done";

export interface AgentState {
  name: string;
  status: AgentStatus;
}

export interface RoundState {
  label: string;
  isSynthesis: boolean;
  status: RoundStatus;
  agents: AgentState[];
}

export interface PhaseState {
  id: "prd" | "arch";
  label: string;
  outputPath: string;
  status: PhaseStatus;
  rounds: RoundState[];
}

export interface InitRunnerState {
  phases: PhaseState[];
  liveLines: string[];
  activeLabel: string;
  done: boolean;
  error: string | null;
  awaitingArchConfirm: boolean;
  startArch: () => void;
  skipArch: () => void;
}

// ── Claude runner ──────────────────────────────────────────────

async function runClaude(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  // stream-json emits one JSON line per event — real streaming, no buffering
  // --dangerously-skip-permissions required: without it claude asks interactively
  // Prompt via stdin so no shell-escaping edge cases
  const cmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--dangerously-skip-permissions",
      "--output-format=stream-json",
      "--model", "claude-opus-4-6",
      "--max-turns", "1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const proc = cmd.spawn();
  const decoder = new TextDecoder();

  // Write prompt to stdin and close
  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  // Drain stderr in background; surface as [err] lines
  const drainStderr = (async () => {
    const errReader = proc.stderr.getReader();
    try {
      while (true) {
        const { done, value } = await errReader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.trim()) onChunk(`[err] ${line}\n`);
        }
      }
    } finally {
      errReader.releaseLock();
    }
  })();

  const reader = proc.stdout.getReader();
  let jsonBuf = "";
  let fullText = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      jsonBuf += decoder.decode(value, { stream: true });

      // Process complete JSON lines
      const lines = jsonBuf.split("\n");
      jsonBuf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          // stream-json format: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
          if (obj.type === "assistant") {
            const content: Array<{ type: string; text?: string }> =
              obj.message?.content ?? [];
            for (const item of content) {
              if (item.type === "text" && typeof item.text === "string") {
                fullText += item.text;
                onChunk(item.text);
              }
            }
          }
        } catch { /* non-JSON line, ignore */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  await drainStderr;
  const status = await proc.status;
  if (!status.success && fullText.trim() === "") {
    throw new Error(`claude exited with code ${status.code}`);
  }
  return fullText;
}

// ── Agent definitions ──────────────────────────────────────────

interface Agent { name: string; persona: string; }

const PRD_AGENTS: Agent[] = [
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

const ARCH_AGENTS: Agent[] = [
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

function buildPrdPrompt(
  roundIdx: number,
  agentIdx: number,
  description: string,
  allOutputs: string[][],
): string {
  const agent = PRD_AGENTS[agentIdx];
  const isSynthesis = roundIdx === 3;

  if (isSynthesis) {
    const lastRound = allOutputs[2] ?? [];
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

  const isFirstRound = roundIdx === 0;

  if (isFirstRound) {
    return `${agent.persona}

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

  return `${agent.persona}

Projektbeschreibung: ${description}

Runde ${roundIdx + 1} der Diskussion. Hier sind die Einschätzungen aus Runde ${roundIdx}:

${context}

Reagiere auf die anderen Perspektiven:
1. Was übersiehst du in deiner eigenen Runde-${roundIdx}-Position?
2. Was fehlt bei den anderen?
3. Wo gibt es Konflikte zwischen den Perspektiven — wie löst du sie?
4. Gib deine verfeinerte, finale Position für diese Runde aus (vollständige REQ-Liste).`;
}

function buildArchPrompt(
  roundIdx: number,
  agentIdx: number,
  prdContent: string,
  allOutputs: string[][],
): string {
  const agent = ARCH_AGENTS[agentIdx];
  const isSynthesis = roundIdx === 3;
  const today = new Date().toISOString().slice(0, 10);

  if (isSynthesis) {
    const lastRound = allOutputs[2] ?? [];
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

  const isFirstRound = roundIdx === 0;

  if (isFirstRound) {
    return `${agent.persona}

PRD des Projekts:
${prdContent}

Analysiere die Anforderungen aus deiner Perspektive und schlage eine Architektur vor.
Sei konkret (echte Technologien, echte Versionsnummern wo relevant).
Was ist aus deiner Fachperspektive besonders wichtig?`;
  }

  const context = formatOthersOutput(allOutputs, roundIdx - 1, agentIdx, ARCH_AGENTS);

  return `${agent.persona}

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

// ── Initial phase/round structure ──────────────────────────────

function makePhases(): PhaseState[] {
  const makeRounds = (agents: Agent[]): RoundState[] => [
    {
      label: "Runde 1",
      isSynthesis: false,
      status: "pending",
      agents: agents.map((a) => ({ name: a.name, status: "pending" })),
    },
    {
      label: "Runde 2",
      isSynthesis: false,
      status: "pending",
      agents: agents.map((a) => ({ name: a.name, status: "pending" })),
    },
    {
      label: "Runde 3",
      isSynthesis: false,
      status: "pending",
      agents: agents.map((a) => ({ name: a.name, status: "pending" })),
    },
    {
      label: "Synthese",
      isSynthesis: true,
      status: "pending",
      agents: [{ name: "Writer", status: "pending" }],
    },
  ];

  return [
    {
      id: "prd",
      label: "PRD-Generierung",
      outputPath: "PRD.md",
      status: "running",
      rounds: makeRounds(PRD_AGENTS),
    },
    {
      id: "arch",
      label: "Architektur-Entwurf",
      outputPath: `${AGENT_DIR}/architecture.md`,
      status: "pending",
      rounds: makeRounds(ARCH_AGENTS),
    },
  ];
}

const MAX_LIVE_LINES = 12;

// ── Hook ───────────────────────────────────────────────────────

export function useInitRunner(description: string): InitRunnerState {
  const [phases, setPhases] = useState<PhaseState[]>(makePhases);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingArchConfirm, setAwaitingArchConfirm] = useState(false);

  const archResolveRef = useRef<((v: boolean) => void) | null>(null);
  const lineBufferRef = useRef<string>("");

  const setAgentStatus = useCallback(
    (phaseId: "prd" | "arch", roundIdx: number, agentIdx: number, status: AgentStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          const rounds = p.rounds.map((r, ri) => {
            if (ri !== roundIdx) return r;
            const agents = r.agents.map((a, ai) =>
              ai === agentIdx ? { ...a, status } : a
            );
            return { ...r, agents };
          });
          return { ...p, rounds };
        })
      );
    },
    [],
  );

  const setRoundStatus = useCallback(
    (phaseId: "prd" | "arch", roundIdx: number, status: RoundStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          const rounds = p.rounds.map((r, ri) =>
            ri === roundIdx ? { ...r, status } : r
          );
          return { ...p, rounds };
        })
      );
    },
    [],
  );

  const setPhaseStatus = useCallback(
    (phaseId: "prd" | "arch", status: PhaseStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => (p.id === phaseId ? { ...p, status } : p))
      );
    },
    [],
  );

  const addChunk = useCallback((chunk: string) => {
    lineBufferRef.current += chunk;
    const parts = lineBufferRef.current.split("\n");
    lineBufferRef.current = parts.pop() ?? "";

    setLiveLines((prev: string[]) => {
      // Drop previous partial-line preview (cursor marker at end)
      const base =
        prev.length > 0 && prev[prev.length - 1].endsWith("▌")
          ? prev.slice(0, -1)
          : prev;
      const completed = [...base, ...parts];
      const withPreview = lineBufferRef.current
        ? [...completed, lineBufferRef.current + "▌"]
        : completed;
      return withPreview.slice(-MAX_LIVE_LINES);
    });
  }, []);

  async function runPhase(
    phaseId: "prd" | "arch",
    agents: Agent[],
    buildPrompt: (roundIdx: number, agentIdx: number, context: string, allOutputs: string[][]) => string,
    context: string,
    signal: AbortSignal,
  ): Promise<void> {
    // allOutputs[roundIdx][agentIdx]
    const allOutputs: string[][] = [];

    setPhaseStatus(phaseId, "running");

    // Rounds 0-2: discussion rounds (all agents per round)
    for (let roundIdx = 0; roundIdx < 3; roundIdx++) {
      setRoundStatus(phaseId, roundIdx, "running");
      const roundOutputs: string[] = [];

      for (let agentIdx = 0; agentIdx < agents.length; agentIdx++) {
        const label = `${phaseId === "prd" ? "PRD" : "Architektur"} · Runde ${roundIdx + 1} · ${agents[agentIdx].name}`;
        setActiveLabel(label);
        setAgentStatus(phaseId, roundIdx, agentIdx, "running");
        setLiveLines([]);
        lineBufferRef.current = "";

        const prompt = buildPrompt(roundIdx, agentIdx, context, allOutputs);
        const out = await runClaude(prompt, addChunk, signal);
        roundOutputs.push(out);
        setAgentStatus(phaseId, roundIdx, agentIdx, "done");
      }

      allOutputs.push(roundOutputs);
      setRoundStatus(phaseId, roundIdx, "done");
    }

    // Round 3: synthesis
    const synthLabel = `${phaseId === "prd" ? "PRD" : "Architektur"} · Synthese`;
    setActiveLabel(synthLabel);
    setRoundStatus(phaseId, 3, "running");
    setAgentStatus(phaseId, 3, 0, "running");
    setLiveLines([]);
    lineBufferRef.current = "";

    const synthPrompt = buildPrompt(3, 0, context, allOutputs);
    const synthOut = await runClaude(synthPrompt, addChunk, signal);

    setAgentStatus(phaseId, 3, 0, "done");
    setRoundStatus(phaseId, 3, "done");
    setPhaseStatus(phaseId, "done");
    setActiveLabel("");

    // Write output file
    const outputPath = phaseId === "prd"
      ? "PRD.md"
      : `${AGENT_DIR}/architecture.md`;
    await Deno.writeTextFile(outputPath, synthOut);
  }

  useEffect(() => {
    if (!description) {
      setDone(true);
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        // PRD phase
        await runPhase("prd", PRD_AGENTS, buildPrdPrompt, description, ctrl.signal);

        // Ask about architecture
        setAwaitingArchConfirm(true);
        const doArch = await new Promise<boolean>((resolve) => {
          archResolveRef.current = resolve;
        });
        setAwaitingArchConfirm(false);

        // Architecture phase
        await Deno.mkdir(AGENT_DIR, { recursive: true });

        if (doArch) {
          const prdContent = await Deno.readTextFile("PRD.md").catch(() => "");
          await runPhase("arch", ARCH_AGENTS, buildArchPrompt, prdContent, ctrl.signal);
        } else {
          await Deno.writeTextFile(
            `${AGENT_DIR}/architecture.md`,
            "# Architektur-Entscheidungen\n\n(noch keine — Projekt frisch gestartet)\n",
          );
          setPhaseStatus("arch", "done");
        }

        setDone(true);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(String(e));
      }
    })();

    return () => ctrl.abort();
  }, []);

  const startArch = useCallback(() => {
    if (archResolveRef.current) {
      archResolveRef.current(true);
      archResolveRef.current = null;
    }
  }, []);

  const skipArch = useCallback(() => {
    if (archResolveRef.current) {
      archResolveRef.current(false);
      archResolveRef.current = null;
    }
  }, []);

  return { phases, liveLines, activeLabel, done, error, awaitingArchConfirm, startArch, skipArch };
}
