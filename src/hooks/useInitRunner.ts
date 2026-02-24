import React from "react";
import type {
  AgentStatus,
  RoundStatus,
  PhaseStatus,
  PhaseState,
  InitRunnerState,
} from "../types.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";
import {
  DEFAULT_MODEL,
  SYNTH_MODEL,
  PRD_AGENTS,
  ARCH_AGENTS,
  PRD_OUTPUT_PATH,
  ARCH_OUTPUT_PATH,
  buildPrdPrompt,
  buildArchPrompt,
  makePhases,
  formatRoundSummary,
  formatSynthesisSummary,
  injectSpikeReq,
  injectSpikeIntoStatus,
} from "../lib/initAgents.ts";
import { runDebatePhase } from "../lib/phaseRunner.ts";
import { makeAddChunk, makePhaseSink } from "../lib/sinkFactory.ts";
import {
  parseReqs,
  parseAdrs,
} from "../lib/reviewUtils.ts";
import {
  useReviewTarget,
  useSharedEditCallbacks,
  runReviewSequence,
} from "../lib/reviewFlow.ts";

const { useState, useEffect, useRef, useCallback } = React;

const MAX_LIVE_LINES = 20;

export function useInitRunner(
  description: string,
  prdRounds = 3,
  archRounds = 3,
  model = DEFAULT_MODEL,
  skipPrd = false,
): InitRunnerState {
  const [phases, setPhases] = useState<PhaseState[]>(() => {
    const p = makePhases(prdRounds, archRounds);
    if (!skipPrd) return p;
    return p.map((phase) => {
      if (phase.id !== "prd") return phase;
      return {
        ...phase,
        status: "done" as PhaseStatus,
        rounds: phase.rounds.map((r) => ({
          ...r,
          status: "done" as RoundStatus,
          agents: r.agents.map((a) => ({ ...a, status: "done" as AgentStatus })),
        })),
      };
    });
  });
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [agentStreams, setAgentStreams] = useState<string[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentWarnLevel, setAgentWarnLevel] = useState<null | "yellow" | "red">(null);
  const [awaitingArchConfirm, setAwaitingArchConfirm] = useState(false);

  // Arch runtime config — set by startArchWithConfig (archOnly) or startArch (default)
  const archRunConfigRef = useRef({ model, archRounds, archNote: "" });

  // Refs for async flow control
  const archResolveRef = useRef<((v: boolean) => void) | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const lineBufferRef = useRef<string>("");

  // ── Review targets ──────────────────────────────────────────────

  const prdTarget = useReviewTarget({
    outputPath: PRD_OUTPUT_PATH,
    rewriteType: "req",
    rewriteModel: DEFAULT_MODEL,
    ctrlRef,
    setError: (err: string) => setError(err),
  });

  const archTarget = useReviewTarget({
    outputPath: ARCH_OUTPUT_PATH,
    rewriteType: "adr",
    rewriteModel: DEFAULT_MODEL,
    ctrlRef,
    setError: (err: string) => setError(err),
  });

  const { saveReviewEdit, cancelReviewEdit } = useSharedEditCallbacks([prdTarget, archTarget]);

  // ── State updaters ─────────────────────────────────────────────

  const setPhaseStatus = useCallback(
    (phaseId: "prd" | "arch", status: PhaseStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => (p.id === phaseId ? { ...p, status } : p))
      );
    },
    [],
  );

  const addChunk = React.useMemo(
    () => makeAddChunk(lineBufferRef, setLiveLines, MAX_LIVE_LINES),
    [],
  );

  // ── Phase runner ───────────────────────────────────────────────

  const runPhase = useCallback(async (
    phaseId: "prd" | "arch",
    outputPath: string,
    buildPrompt: (roundIdx: number, agentIdx: number, context: string, allOutputs: string[][], numRounds: number) => string,
    context: string,
    signal: AbortSignal,
    numRounds: number,
    phaseModel: string,
  ): Promise<string> => {
    const phaseLabel = phaseId === "prd" ? "PRD" : "Architecture";
    const agents = phaseId === "prd" ? PRD_AGENTS : ARCH_AGENTS;
    const sink = makePhaseSink(
      setPhases, setActiveLabel, setAgentStreams, setAgentWarnLevel,
      addChunk, setLiveLines, lineBufferRef,
    );
    return await runDebatePhase(
      {
        phaseId,
        phaseLabel,
        outputPath,
        agents,
        buildPrompt,
        context,
        numRounds,
        phaseModel,
        synthModel: SYNTH_MODEL,
        formatRoundSummary: (roundNum, outputs) => formatRoundSummary(roundNum, agents, outputs),
        formatSynthesisSummary: (content) => formatSynthesisSummary(content, phaseId),
      },
      sink,
      signal,
    );
  }, [setActiveLabel, setAgentStreams, setAgentWarnLevel, addChunk, setLiveLines]);

  // ── Main effect ────────────────────────────────────────────────

  useEffect(() => {
    if (!description) {
      setDone(true);
      return;
    }

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    (async () => {
      try {
        // skipPrd=true (archOnly): PRD exists — offer review of existing file
        if (skipPrd) {
          const existingPrdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
          const existingPrdItems = parseReqs(existingPrdContent);
          if (existingPrdItems.length > 0) {
            await runReviewSequence(prdTarget, existingPrdItems, existingPrdContent, { existing: true });
          }
        }

        if (!skipPrd) {
          // Check if PRD already exists — if so, skip generation and go straight to review
          const existingPrdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
          const existingPrdItems = parseReqs(existingPrdContent);

          if (existingPrdItems.length > 0) {
            // Mark PRD phase as done without running agents
            setPhases((prev: PhaseState[]) => prev.map((p) => {
              if (p.id !== "prd") return p;
              return {
                ...p,
                status: "done" as PhaseStatus,
                rounds: p.rounds.map((r) => ({
                  ...r,
                  status: "done" as RoundStatus,
                  agents: r.agents.map((a) => ({ ...a, status: "done" as AgentStatus })),
                })),
              };
            }));

            await runReviewSequence(prdTarget, existingPrdItems, existingPrdContent, { existing: true });
          } else {
            await runPhase("prd", PRD_OUTPUT_PATH, buildPrdPrompt, description, ctrl.signal, prdRounds, model);

            const prdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
            const prdItems = parseReqs(prdContent);

            // Always start PRD review — control flow is deterministic here,
            // we just ran runPhase("prd"). No LLM-output-dependent branching.
            await runReviewSequence(prdTarget, prdItems, prdContent, { alwaysReview: true });
          }
        }

        setAwaitingArchConfirm(true);
        const doArch = await new Promise<boolean>((resolve) => {
          archResolveRef.current = resolve;
        });
        setAwaitingArchConfirm(false);

        await Deno.mkdir(AGENT_DIR, { recursive: true });

        if (doArch) {
          const { model: archModel, archRounds: numArchRounds, archNote } = archRunConfigRef.current;
          const prdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
          const archContext = archNote
            ? `Zusätzlicher Kontext / Fokus:\n${archNote}\n\n---\n\n${prdContent}`
            : prdContent;
          await runPhase("arch", ARCH_OUTPUT_PATH, buildArchPrompt, archContext, ctrl.signal, numArchRounds, archModel);

          const archContent = await Deno.readTextFile(ARCH_OUTPUT_PATH).catch(() => "");
          const archItems = parseAdrs(archContent);

          await runReviewSequence(archTarget, archItems, archContent);
        } else {
          await Deno.writeTextFile(
            ARCH_OUTPUT_PATH,
            "# Architecture Decisions\n\n(none yet — project just started)\n",
          );
          setPhaseStatus("arch", "done");
        }

        // Inject REQ-000 Walking Skeleton into PRD + status.json
        const statusPath = `${AGENT_DIR}/status.json`;
        const [prdRaw, statusRaw] = await Promise.all([
          Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => ""),
          Deno.readTextFile(statusPath).catch(() => "{}"),
        ]);
        const prdWithSpike = injectSpikeReq(prdRaw);
        const statusWithSpike = injectSpikeIntoStatus(statusRaw);
        await Promise.all([
          Deno.writeTextFile(PRD_OUTPUT_PATH, prdWithSpike),
          Deno.writeTextFile(statusPath, statusWithSpike),
        ]);

        setDone(true);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(String(e));
      }
    })();

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Arch generation confirm ────────────────────────────────────

  const startArch = useCallback(() => {
    if (archResolveRef.current) {
      archResolveRef.current(true);
      archResolveRef.current = null;
    }
  }, []);

  const startArchWithConfig = useCallback((archModel: string, numRounds: number, note: string) => {
    archRunConfigRef.current = { model: archModel, archRounds: numRounds, archNote: note };
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
    agentStreams,
    activeLabel,
    agentWarnLevel,
    done,
    error,
    awaitingArchConfirm,
    startArch,
    startArchWithConfig,
    skipArch,
    prdSynthDone: prdTarget.synthDone,
    confirmPrdSynthDone: prdTarget.confirmSynthDone,
    skipPrdReview: prdTarget.skipReview,
    prdReview: prdTarget.review,
    advancePrdReview: prdTarget.advance,
    openPrdReviewEditor: prdTarget.openEditor,
    startPrdReviewTyping: prdTarget.startTyping,
    submitPrdReviewRewrite: prdTarget.submitRewrite,
    onPrdReviewType: prdTarget.onType,
    archSynthDone: archTarget.synthDone,
    confirmArchSynthDone: archTarget.confirmSynthDone,
    skipArchSynthDone: archTarget.skipReview,
    archReview: archTarget.review,
    advanceArchReview: archTarget.advance,
    openArchReviewEditor: archTarget.openEditor,
    startArchReviewTyping: archTarget.startTyping,
    submitArchReviewRewrite: archTarget.submitRewrite,
    onArchReviewType: archTarget.onType,
    saveReviewEdit,
    cancelReviewEdit,
  };
}
