import React from "react";
import type { AgentStatus, RoundStatus, PhaseStatus, PhaseState } from "../types.ts";
import type { PhaseSink } from "./phaseRunner.ts";

/**
 * Creates an addChunk handler that accumulates streaming text into liveLines.
 * Shared by useInitRunner and useEduInitRunner.
 */
export function makeAddChunk(
  lineBufferRef: { current: string },
  setLiveLines: React.Dispatch<React.SetStateAction<string[]>>,
  maxLiveLines: number,
): (chunk: string) => void {
  return (chunk: string) => {
    lineBufferRef.current += chunk;
    const parts = lineBufferRef.current.split("\n");
    lineBufferRef.current = parts.pop() ?? "";

    const visibleParts = parts.filter(
      (l: string) => l.trim() !== "<k>" && l.trim() !== "</k>",
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
      return withPreview.slice(-maxLiveLines);
    });
  };
}

/**
 * Builds a PhaseSink that maps runDebatePhase callbacks to React state updates.
 * Shared by useInitRunner and useEduInitRunner.
 */
export function makePhaseSink(
  setPhases: React.Dispatch<React.SetStateAction<PhaseState[]>>,
  setActiveLabel: (label: string) => void,
  setAgentStreams: (streams: string[]) => void,
  setAgentWarnLevel: (level: null | "yellow" | "red") => void,
  addChunk: (chunk: string) => void,
  setLiveLines: React.Dispatch<React.SetStateAction<string[]>>,
  lineBufferRef: { current: string },
): PhaseSink {
  return {
    setPhaseRunning: (phaseId: string) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) =>
          p.id === phaseId ? { ...p, status: "running" as PhaseStatus, startedAt: Date.now() } : p
        )
      );
    },
    setAgentStatus: (phaseId: string, roundIdx: number, agentIdx: number, status: AgentStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          const rounds = p.rounds.map((r, ri) => {
            if (ri !== roundIdx) return r;
            return {
              ...r,
              agents: r.agents.map((a, ai) => ai === agentIdx ? { ...a, status } : a),
            };
          });
          return { ...p, rounds };
        })
      );
    },
    setRoundStatus: (phaseId: string, roundIdx: number, status: RoundStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          return {
            ...p,
            rounds: p.rounds.map((r, ri) => ri === roundIdx ? { ...r, status } : r),
          };
        })
      );
    },
    setPhaseStatus: (phaseId: string, status: PhaseStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => p.id === phaseId ? { ...p, status } : p)
      );
    },
    setActiveLabel,
    setAgentStreams,
    setAgentWarnLevel,
    addChunk,
    setLiveLines,
    clearLineBuffer: () => {
      lineBufferRef.current = "";
    },
  };
}
