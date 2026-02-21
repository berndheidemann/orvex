import React from "react";

const { useState, useEffect, useRef, useCallback } = React;

const AGENT_DIR = (
  Deno.env.get("KINEMA_AGENT_DIR") ??
  new URL("../../.agent", import.meta.url).pathname
).replace(/\/$/, "");

export type RoundStatus = "pending" | "running" | "done" | "error";
export type PhaseStatus = "pending" | "running" | "done";

export interface RoundState {
  label: string;
  agent: string;
  status: RoundStatus;
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

async function runClaudeRound(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const cmd = new Deno.Command("claude", {
    args: ["-p", "--model", "claude-opus-4-6", "--output-format", "text",
           "--dangerously-skip-permissions"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });

  const proc = cmd.spawn();
  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let output = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      output += text;
      onChunk(text);
    }
  } finally {
    reader.releaseLock();
  }
  await proc.status;
  return output;
}

function buildPrdPrompt(idx: number, desc: string, prev: string[]): string {
  switch (idx) {
    case 0: return `Du bist Software-Architekt und Product Manager.

Projektbeschreibung: ${desc}

Schlage 4–8 Requirements vor. Nutze exakt dieses Format:

### REQ-001: [Titel]

- **Priorität:** P0|P1|P2
- **Größe:** S|M
- **Abhängig von:** ---

#### Beschreibung
...

#### Akzeptanzkriterien
- [ ] ...

P0=Kernfunktion, P1=wichtig, P2=nice-to-have. S=kleine, M=größere Iteration.`;

    case 1: return `Du bist Product Manager mit Fokus auf User Experience.

Projektbeschreibung: ${desc}

Architekt-Vorschlag:
${prev[0]}

1. Kritisiere: Was fehlt? Was ist für MVP unrealistisch?
2. Ergänze für UI-REQs '#### User Journey':
   1. Nutzer öffnet [Seite]
   2. Nutzer [Aktion]
   3. System zeigt [Ergebnis]
   4. Fehlerfall: [Eingabe] → [Fehlermeldung]
3. Fehlende REQs vorschlagen (Auth, Leerzustände, Fehlerseiten)

Vollständige überarbeitete REQ-Liste ausgeben.`;

    case 2: return `Du bist Software-Architekt.

Projektbeschreibung: ${desc}

REQ-Liste nach 2 Runden:
${prev[1]}

1. Korrekte Abhängigkeiten setzen
2. Implementierbare Reihenfolge sicherstellen
3. Größen prüfen
4. Technische Verifikation ergänzen:
   #### Verifikation
   - \`[Befehl]\` → \`[Ausgabe]\`
5. MVP-unrealistische REQs entfernen

Finale REQ-Liste ausgeben.`;

    case 3: return `Du bist technischer Writer. Erstelle die finale PRD.md.

Projektbeschreibung: ${desc}

Finale REQ-Liste:
${prev[2]}

Gib NUR das fertige Markdown aus — keine Einleitung, keine Erklärungen:

# PRD — [Projektname]

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
1. ...

---

Status immer 'open'.`;

    default: return "";
  }
}

function buildArchPrompt(idx: number, prd: string, prev: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  switch (idx) {
    case 0: return `Du bist Tech Lead und Software-Architekt.

PRD des Projekts:
${prd}

Schlage konkrete Software-Architektur vor:
1. Programmiersprache & Runtime
2. Frameworks & Libraries (konkrete Namen)
3. Architektur-Pattern (MVC, Hexagonal, Monolith vs. Services …)
4. Projektstruktur (Verzeichnisbaum)
5. Datenhaltung (DB, Cache)
6. Testing-Stack (Unit, Integration, E2E)
7. Build & Dev-Tooling

Begründe jede Entscheidung. Pragmatisch — kein Overengineering.`;

    case 1: return `Du bist skeptischer Senior Developer.

PRD:
${prd}

Tech Lead-Vorschlag:
${prev[0]}

Hinterfrage kritisch:
1. Über-/Unterdimensioniert für dieses Projekt?
2. Einfachere Alternativen?
3. Praktische Probleme (Deployment, Debugging, Performance)?
4. Übersehene Risiken?
5. Eigene Empfehlung?

Konstruktiv und konkret.`;

    case 2: return `Du bist Tech Lead.

PRD:
${prd}

Dein Vorschlag:
${prev[0]}

Kritik des Senior Developers:
${prev[1]}

1. Welche Kritikpunkte nimmst du an?
2. Was verteidigst du und warum?
3. Finale überarbeitete Architektur ausgeben (vollständig).`;

    case 3: return `Du bist technischer Writer. Erstelle die finale architecture.md.

PRD:
${prd}

Finale Architektur:
${prev[2]}

Gib NUR das Markdown aus:

# Architektur-Entscheidungen

> [Ein-Satz-Zusammenfassung]

## Überblick
[3–5 Sätze: Stack, Pattern, Begründung]

## Projektstruktur
\`\`\`
[Verzeichnisbaum]
\`\`\`

---

## ADR-001: [Titel] (${today})

**Kontext:** ...
**Entscheidung:** ...
**Begründung:** ...
**Konsequenzen:** ...

---

[weitere ADRs für Sprache, Framework, DB, Testing, Build]`;

    default: return "";
  }
}

const INIT_PHASES: PhaseState[] = [
  {
    id: "prd",
    label: "PRD-Generierung",
    outputPath: "PRD.md",
    status: "running",
    rounds: [
      { label: "Runde 1", agent: "Architekt", status: "pending" },
      { label: "Runde 2", agent: "Product Manager", status: "pending" },
      { label: "Runde 3", agent: "Architekt (verfeinert)", status: "pending" },
      { label: "Runde 4", agent: "Synthese → PRD.md", status: "pending" },
    ],
  },
  {
    id: "arch",
    label: "Architektur-Entwurf",
    outputPath: `${AGENT_DIR}/architecture.md`,
    status: "pending",
    rounds: [
      { label: "Runde 1", agent: "Tech Lead", status: "pending" },
      { label: "Runde 2", agent: "Senior Developer", status: "pending" },
      { label: "Runde 3", agent: "Tech Lead (verfeinert)", status: "pending" },
      { label: "Runde 4", agent: "Synthese → architecture.md", status: "pending" },
    ],
  },
];

const MAX_LIVE_LINES = 12;

export function useInitRunner(description: string): InitRunnerState {
  const [phases, setPhases] = useState<PhaseState[]>(() =>
    INIT_PHASES.map((p) => ({ ...p, rounds: p.rounds.map((r) => ({ ...r })) }))
  );
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingArchConfirm, setAwaitingArchConfirm] = useState(false);

  const archResolveRef = useRef<((v: boolean) => void) | null>(null);
  const lineBufferRef = useRef<string>("");

  const setRoundStatus = useCallback(
    (phaseId: "prd" | "arch", roundIdx: number, status: RoundStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          const rounds = p.rounds.map((r, i) =>
            i === roundIdx ? { ...r, status } : r
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
    if (parts.length > 0) {
      setLiveLines((prev: string[]) =>
        [...prev, ...parts].slice(-MAX_LIVE_LINES)
      );
    }
  }, []);

  useEffect(() => {
    if (!description) {
      setDone(true);
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        // ── PRD Phase ────────────────────────────────────────────
        setPhaseStatus("prd", "running");
        const prdOutputs: string[] = [];

        for (let i = 0; i < 4; i++) {
          const round = INIT_PHASES[0].rounds[i];
          setActiveLabel(`PRD · ${round.label} — ${round.agent}`);
          setRoundStatus("prd", i, "running");
          setLiveLines([]);
          lineBufferRef.current = "";

          const prompt = buildPrdPrompt(i, description, prdOutputs);
          const out = await runClaudeRound(prompt, addChunk, ctrl.signal);
          prdOutputs.push(out);
          setRoundStatus("prd", i, "done");
        }

        await Deno.writeTextFile("PRD.md", prdOutputs[3]);
        setPhaseStatus("prd", "done");
        setActiveLabel("");
        setLiveLines([]);

        // ── Ask about architecture ────────────────────────────────
        setAwaitingArchConfirm(true);
        const doArch = await new Promise<boolean>((resolve) => {
          archResolveRef.current = resolve;
        });
        setAwaitingArchConfirm(false);

        // ── Architecture Phase ────────────────────────────────────
        await Deno.mkdir(AGENT_DIR, { recursive: true });

        if (doArch) {
          setPhaseStatus("arch", "running");
          const prdContent = prdOutputs[3];
          const archOutputs: string[] = [];

          for (let i = 0; i < 4; i++) {
            const round = INIT_PHASES[1].rounds[i];
            setActiveLabel(`Architektur · ${round.label} — ${round.agent}`);
            setRoundStatus("arch", i, "running");
            setLiveLines([]);
            lineBufferRef.current = "";

            const prompt = buildArchPrompt(i, prdContent, archOutputs);
            const out = await runClaudeRound(prompt, addChunk, ctrl.signal);
            archOutputs.push(out);
            setRoundStatus("arch", i, "done");
          }

          await Deno.writeTextFile(
            `${AGENT_DIR}/architecture.md`,
            archOutputs[3],
          );
        } else {
          await Deno.writeTextFile(
            `${AGENT_DIR}/architecture.md`,
            "# Architektur-Entscheidungen\n\n(noch keine — Projekt frisch gestartet)\n",
          );
        }

        setPhaseStatus("arch", "done");
        setActiveLabel("");
        setDone(true);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(String(e));
        }
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

  return {
    phases,
    liveLines,
    activeLabel,
    done,
    error,
    awaitingArchConfirm,
    startArch,
    skipArch,
  };
}
