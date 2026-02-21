import React from "react";
import type {
  AgentStatus,
  RoundStatus,
  PhaseStatus,
  PhaseState,
  InitRunnerState,
} from "../types.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";
import { runClaude } from "../lib/runClaude.ts";
import {
  DEFAULT_MODEL,
  PRD_AGENTS,
  ARCH_AGENTS,
  PRD_OUTPUT_PATH,
  ARCH_OUTPUT_PATH,
  buildPrdPrompt,
  buildArchPrompt,
  makePhases,
  formatRoundSummary,
  formatSynthesisSummary,
  type Agent,
} from "../lib/initAgents.ts";

const { useState, useEffect, useRef, useCallback } = React;

const MAX_LIVE_LINES = 20;

export function useInitRunner(
  description: string,
  prdRounds = 3,
  archRounds = 3,
  model = DEFAULT_MODEL,
): InitRunnerState {
  const [phases, setPhases] = useState<PhaseState[]>(() => makePhases(prdRounds, archRounds));
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingArchConfirm, setAwaitingArchConfirm] = useState(false);

  const archResolveRef = useRef<((v: boolean) => void) | null>(null);
  const lineBufferRef = useRef<string>("");

  // ── State updaters ─────────────────────────────────────────

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

    const visibleParts = parts.filter(
      (l: string) => l.trim() !== "<k>" && l.trim() !== "</k>"
    );

    setLiveLines((prev: string[]) => {
      const base =
        prev.length > 0 && prev[prev.length - 1].endsWith("▌")
          ? prev.slice(0, -1)
          : prev;
      const completed = [...base, ...visibleParts];
      const withPreview = lineBufferRef.current
        ? [...completed, lineBufferRef.current + "▌"]
        : completed;
      return withPreview.slice(-MAX_LIVE_LINES);
    });
  }, []);

  // ── Phase runner (W1: useCallback with explicit deps) ──────

  const runPhase = useCallback(async (
    phaseId: "prd" | "arch",
    outputPath: string,         // W4: passed in, not hardcoded
    agents: Agent[],
    buildPrompt: (roundIdx: number, agentIdx: number, context: string, allOutputs: string[][], numRounds: number) => string,
    context: string,
    signal: AbortSignal,
    numRounds: number,
    phaseModel: string,
  ): Promise<void> => {
    const allOutputs: string[][] = [];

    // W3: single setPhases call for status + startedAt
    setPhases((prev: PhaseState[]) =>
      prev.map((p) =>
        p.id === phaseId ? { ...p, status: "running", startedAt: Date.now() } : p
      )
    );

    const phaseLabel = phaseId === "prd" ? "PRD" : "Architektur";

    for (let roundIdx = 0; roundIdx < numRounds; roundIdx++) {
      setRoundStatus(phaseId, roundIdx, "running");
      setActiveLabel(`${phaseLabel} · Runde ${roundIdx + 1} · ${agents.length} Agenten parallel…`);
      agents.forEach((_, agentIdx) =>
        setAgentStatus(phaseId, roundIdx, agentIdx, "running")
      );

      const roundOutputs = await Promise.all(
        agents.map(async (_, agentIdx) => {
          const prompt = buildPrompt(roundIdx, agentIdx, context, allOutputs, numRounds);
          const out = await runClaude(prompt, () => {}, signal, phaseModel);
          setAgentStatus(phaseId, roundIdx, agentIdx, "done");
          return out;
        })
      );

      allOutputs.push(roundOutputs);
      setRoundStatus(phaseId, roundIdx, "done");
      setLiveLines(formatRoundSummary(roundIdx + 1, agents, roundOutputs));
      lineBufferRef.current = "";
      setActiveLabel(`${phaseLabel} · Runde ${roundIdx + 1} abgeschlossen`);
    }

    const synthLabel = `${phaseLabel} · Synthese`;
    setActiveLabel(synthLabel);
    setRoundStatus(phaseId, numRounds, "running");
    setAgentStatus(phaseId, numRounds, 0, "running");
    lineBufferRef.current = "";

    const synthPrompt = buildPrompt(numRounds, 0, context, allOutputs, numRounds);
    const synthOut = await runClaude(synthPrompt, addChunk, signal, phaseModel);

    setAgentStatus(phaseId, numRounds, 0, "done");
    setRoundStatus(phaseId, numRounds, "done");
    setPhaseStatus(phaseId, "done");
    setLiveLines(formatSynthesisSummary(synthOut, phaseId));
    lineBufferRef.current = "";
    setActiveLabel("");

    await Deno.writeTextFile(outputPath, synthOut); // W4: use passed outputPath
  }, [setAgentStatus, setRoundStatus, setPhaseStatus, setLiveLines, setActiveLabel, addChunk]);

  // ── Main effect ────────────────────────────────────────────

  useEffect(() => {
    if (!description) {
      setDone(true);
      return;
    }

    const ctrl = new AbortController();

    (async () => {
      try {
        await runPhase("prd", PRD_OUTPUT_PATH, PRD_AGENTS, buildPrdPrompt, description, ctrl.signal, prdRounds, model);

        setAwaitingArchConfirm(true);
        const doArch = await new Promise<boolean>((resolve) => {
          archResolveRef.current = resolve;
        });
        setAwaitingArchConfirm(false);

        await Deno.mkdir(AGENT_DIR, { recursive: true });

        if (doArch) {
          const prdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
          await runPhase("arch", ARCH_OUTPUT_PATH, ARCH_AGENTS, buildArchPrompt, prdContent, ctrl.signal, archRounds, model);
        } else {
          await Deno.writeTextFile(
            ARCH_OUTPUT_PATH,
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
  // prdRounds, archRounds, model are fixed at mount — intentional empty deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
