import React from "react";
import type {
  AgentStatus,
  RoundStatus,
  PhaseStatus,
  PhaseState,
  InitRunnerState,
  ReviewState,
  SynthDoneState,
  InputKey,
} from "../types.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";
import { runClaude } from "../lib/runClaude.ts";
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
import { runDebatePhase, type PhaseSink } from "../lib/phaseRunner.ts";
import {
  parseReqs,
  parseAdrs,
  replaceItemInContent,
  buildRewritePrompt,
} from "../lib/reviewUtils.ts";
import { applyTypingKey, type TypingState } from "../lib/typingLogic.ts";

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
  const [prdSynthDone, setPrdSynthDone] = useState<SynthDoneState | null>(null);
  const [prdReview, setPrdReview] = useState<ReviewState | null>(null);
  const [archSynthDone, setArchSynthDone] = useState<SynthDoneState | null>(null);
  const [archReview, setArchReview] = useState<ReviewState | null>(null);

  // Arch runtime config — set by startArchWithConfig (archOnly) or startArch (default)
  const archRunConfigRef = useRef({ model, archRounds, archNote: "" });

  // Refs for async flow control
  const archResolveRef = useRef<((v: boolean) => void) | null>(null);
  const prdSynthDoneConfirmRef = useRef<((doReview: boolean) => void) | null>(null);
  const prdReviewDoneRef = useRef<(() => void) | null>(null);
  const archSynthDoneRef = useRef<((v: boolean) => void) | null>(null);
  const archReviewDoneRef = useRef<(() => void) | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Refs to read current review state from async callbacks
  const prdReviewRef = useRef<ReviewState | null>(null);
  const archReviewRef = useRef<ReviewState | null>(null);

  const lineBufferRef = useRef<string>("");

  // Keep refs in sync with state — explicit return type for contextual typing of callers
  type RS = ReviewState | null;
  type RSUpdater = (prev: RS) => RS;

  const setPrdReviewSynced: (update: RSUpdater) => void = useCallback(
    (update: RSUpdater) => {
      setPrdReview((prev: RS) => {
        const next = update(prev);
        prdReviewRef.current = next;
        return next;
      });
    },
    [],
  );

  const setArchReviewSynced: (update: RSUpdater) => void = useCallback(
    (update: RSUpdater) => {
      setArchReview((prev: RS) => {
        const next = update(prev);
        archReviewRef.current = next;
        return next;
      });
    },
    [],
  );

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

  // ── Phase runner ───────────────────────────────────────────

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
    const sink: PhaseSink = {
      setPhaseRunning: (id: string) => {
        setPhases((prev: PhaseState[]) =>
          prev.map((p) => p.id === id ? { ...p, status: "running", startedAt: Date.now() } : p)
        );
      },
      setAgentStatus: (pid: string, roundIdx: number, agentIdx: number, status: AgentStatus) => {
        setPhases((prev: PhaseState[]) =>
          prev.map((p) => {
            if (p.id !== pid) return p;
            const rounds = p.rounds.map((r, ri) => {
              if (ri !== roundIdx) return r;
              return { ...r, agents: r.agents.map((a, ai) => ai === agentIdx ? { ...a, status } : a) };
            });
            return { ...p, rounds };
          })
        );
      },
      setRoundStatus: (pid: string, roundIdx: number, status: RoundStatus) => {
        setPhases((prev: PhaseState[]) =>
          prev.map((p) => {
            if (p.id !== pid) return p;
            return { ...p, rounds: p.rounds.map((r, ri) => ri === roundIdx ? { ...r, status } : r) };
          })
        );
      },
      setPhaseStatus: (pid: string, status: PhaseStatus) => {
        setPhases((prev: PhaseState[]) => prev.map((p) => p.id === pid ? { ...p, status } : p));
      },
      setActiveLabel,
      setAgentStreams,
      setAgentWarnLevel,
      addChunk,
      setLiveLines,
      clearLineBuffer: () => { lineBufferRef.current = ""; },
    };
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

  // ── Main effect ────────────────────────────────────────────

  useEffect(() => {
    if (!description) {
      setDone(true);
      return;
    }

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    (async () => {
      try {
        // skipPrd=true (archOnly): PRD existiert bereits — trotzdem Info-Screen + Review-Angebot
        if (skipPrd) {
          const existingPrdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
          const existingPrdItems = parseReqs(existingPrdContent);
          if (existingPrdItems.length > 0) {
            setPrdSynthDone({ items: existingPrdItems, fileContent: existingPrdContent, existing: true });
            const doReview = await new Promise<boolean>((resolve) => {
              prdSynthDoneConfirmRef.current = resolve;
            });
            setPrdSynthDone(null);
            if (doReview) {
              const initialPrdReview: ReviewState = {
                items: existingPrdItems,
                currentIdx: 0,
                inputMode: "none",
                typedInput: "",
                typingCursorPos: 0,
                editorOpen: false,
                fileContent: existingPrdContent,
              };
              setPrdReviewSynced((_prev) => initialPrdReview);
              await new Promise<void>((resolve) => {
                prdReviewDoneRef.current = resolve;
              });
              setPrdReviewSynced((_prev) => null);
            }
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

            setPrdSynthDone({ items: existingPrdItems, fileContent: existingPrdContent, existing: true });
            const doReview = await new Promise<boolean>((resolve) => {
              prdSynthDoneConfirmRef.current = resolve;
            });
            setPrdSynthDone(null);

            if (doReview) {
              const initialPrdReview: ReviewState = {
                items: existingPrdItems,
                currentIdx: 0,
                inputMode: "none",
                typedInput: "",
                typingCursorPos: 0,
                editorOpen: false,
                fileContent: existingPrdContent,
              };
              setPrdReviewSynced((_prev) => initialPrdReview);
              await new Promise<void>((resolve) => {
                prdReviewDoneRef.current = resolve;
              });
              setPrdReviewSynced((_prev) => null);
            }
          } else {
            await runPhase("prd", PRD_OUTPUT_PATH, buildPrdPrompt, description, ctrl.signal, prdRounds, model);

            // PRD synthesis done: show transition screen
            const prdContent = await Deno.readTextFile(PRD_OUTPUT_PATH).catch(() => "");
            const prdItems = parseReqs(prdContent);

            // Show transition screen
            setPrdSynthDone({ items: prdItems, fileContent: prdContent });
            await new Promise<void>((resolve) => {
              prdSynthDoneConfirmRef.current = (_doReview: boolean) => resolve();
            });
            setPrdSynthDone(null);

            // Always start PRD review — control flow is deterministic here,
            // we just ran runPhase("prd"). No LLM-output-dependent branching.
            const initialPrdReview: ReviewState = {
              items: prdItems,
              currentIdx: 0,
              inputMode: "none",
              typedInput: "",
              typingCursorPos: 0,
              editorOpen: false,
              fileContent: prdContent,
            };
            setPrdReviewSynced((_prev) => initialPrdReview);
            await new Promise<void>((resolve) => {
              prdReviewDoneRef.current = resolve;
            });
            setPrdReviewSynced((_prev) => null);
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

          // Arch synthesis done: show scrollable arch + confirm review
          const archContent = await Deno.readTextFile(ARCH_OUTPUT_PATH).catch(() => "");
          const archItems = parseAdrs(archContent);

          setArchSynthDone({ items: archItems, fileContent: archContent });
          const doArchReview = await new Promise<boolean>((resolve) => {
            archSynthDoneRef.current = resolve;
          });
          setArchSynthDone(null);

          if (doArchReview && archItems.length > 0) {
            const initialArchReview: ReviewState = {
              items: archItems,
              currentIdx: 0,
              inputMode: "none",
              typedInput: "",
              typingCursorPos: 0,
              editorOpen: false,
              fileContent: archContent,
            };
            setArchReviewSynced((_prev) => initialArchReview);
            await new Promise<void>((resolve) => {
              archReviewDoneRef.current = resolve;
            });
            setArchReviewSynced((_prev) => null);
          }
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

  // ── Arch generation confirm ────────────────────────────────

  const startArch = useCallback(() => {
    // Uses the initial archRounds/model (non-archOnly confirm flow)
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

  // ── PRD Synth Done ─────────────────────────────────────────

  const confirmPrdSynthDone = useCallback(() => {
    if (prdSynthDoneConfirmRef.current) {
      prdSynthDoneConfirmRef.current(true);
      prdSynthDoneConfirmRef.current = null;
    }
  }, []);

  const skipPrdReview = useCallback(() => {
    if (prdSynthDoneConfirmRef.current) {
      prdSynthDoneConfirmRef.current(false);
      prdSynthDoneConfirmRef.current = null;
    }
  }, []);

  // ── PRD Review callbacks ───────────────────────────────────

  const advancePrdReview = useCallback(() => {
    setPrdReviewSynced((prev) => {
      if (!prev) return null;
      if (prev.currentIdx + 1 >= prev.items.length) {
        prdReviewDoneRef.current?.();
        return null;
      }
      return { ...prev, currentIdx: prev.currentIdx + 1, inputMode: "none", typedInput: "", typingCursorPos: 0 };
    });
  }, [setPrdReviewSynced]);

  const openPrdReviewEditor = useCallback(() => {
    setPrdReviewSynced((prev) => prev ? { ...prev, editorOpen: true } : null);
  }, [setPrdReviewSynced]);

  const startPrdReviewTyping = useCallback(() => {
    setPrdReviewSynced((prev) => prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null);
  }, [setPrdReviewSynced]);

  const onPrdReviewType = useCallback((char: string, key: InputKey) => {
    setPrdReviewSynced((prev) => {
      if (!prev || prev.inputMode !== "typing") return prev ?? null;
      if (key.escape) return { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      const ts: TypingState = applyTypingKey({ text: prev.typedInput, cursor: prev.typingCursorPos }, char, key);
      return { ...prev, typedInput: ts.text, typingCursorPos: ts.cursor };
    });
  }, [setPrdReviewSynced]);

  const submitPrdReviewRewrite = useCallback(async (userPrompt: string) => {
    const review = prdReviewRef.current;
    if (!review) return;
    const item = review.items[review.currentIdx];
    if (!item) return;

    setPrdReviewSynced((prev) => prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null);

    try {
      const newContent = await runClaude(
        buildRewritePrompt(item, userPrompt, "req"),
        () => {},
        ctrlRef.current!.signal,
        DEFAULT_MODEL,
        10,
      );

      const trimmed = newContent.trim();
      const currentReview = prdReviewRef.current;
      if (!currentReview) return;

      const updatedFile = replaceItemInContent(currentReview.fileContent, item.content, trimmed);
      await Deno.writeTextFile(PRD_OUTPUT_PATH, updatedFile);

      setPrdReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: trimmed };
        return { ...prev, items: newItems, fileContent: updatedFile, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      });
    } catch (e) {
      setPrdReviewSynced((prev) => prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null);
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setPrdReviewSynced]);

  // ── Arch Synth Done ────────────────────────────────────────

  const confirmArchSynthDone = useCallback(() => {
    if (archSynthDoneRef.current) {
      archSynthDoneRef.current(true);
      archSynthDoneRef.current = null;
    }
  }, []);

  const skipArchSynthDone = useCallback(() => {
    if (archSynthDoneRef.current) {
      archSynthDoneRef.current(false);
      archSynthDoneRef.current = null;
    }
  }, []);

  // ── Arch Review callbacks ──────────────────────────────────

  const advanceArchReview = useCallback(() => {
    setArchReviewSynced((prev) => {
      if (!prev) return null;
      if (prev.currentIdx + 1 >= prev.items.length) {
        archReviewDoneRef.current?.();
        return null;
      }
      return { ...prev, currentIdx: prev.currentIdx + 1, inputMode: "none", typedInput: "", typingCursorPos: 0 };
    });
  }, [setArchReviewSynced]);

  const openArchReviewEditor = useCallback(() => {
    setArchReviewSynced((prev) => prev ? { ...prev, editorOpen: true } : null);
  }, [setArchReviewSynced]);

  const startArchReviewTyping = useCallback(() => {
    setArchReviewSynced((prev) => prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null);
  }, [setArchReviewSynced]);

  const onArchReviewType = useCallback((char: string, key: InputKey) => {
    setArchReviewSynced((prev) => {
      if (!prev || prev.inputMode !== "typing") return prev ?? null;
      if (key.escape) return { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      const ts: TypingState = applyTypingKey({ text: prev.typedInput, cursor: prev.typingCursorPos }, char, key);
      return { ...prev, typedInput: ts.text, typingCursorPos: ts.cursor };
    });
  }, [setArchReviewSynced]);

  const submitArchReviewRewrite = useCallback(async (userPrompt: string) => {
    const review = archReviewRef.current;
    if (!review) return;
    const item = review.items[review.currentIdx];
    if (!item) return;

    setArchReviewSynced((prev) => prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null);

    try {
      const newContent = await runClaude(
        buildRewritePrompt(item, userPrompt, "adr"),
        () => {},
        ctrlRef.current!.signal,
        DEFAULT_MODEL,
        10,
      );

      const trimmed = newContent.trim();
      const currentReview = archReviewRef.current;
      if (!currentReview) return;

      const updatedFile = replaceItemInContent(currentReview.fileContent, item.content, trimmed);
      await Deno.writeTextFile(ARCH_OUTPUT_PATH, updatedFile);

      setArchReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: trimmed };
        return { ...prev, items: newItems, fileContent: updatedFile, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      });
    } catch (e) {
      setArchReviewSynced((prev) => prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null);
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setArchReviewSynced]);

  // ── Shared editor callbacks ────────────────────────────────

  const saveReviewEdit = useCallback(async (newContent: string) => {
    const prd = prdReviewRef.current;
    const arch = archReviewRef.current;

    if (prd?.editorOpen) {
      const item = prd.items[prd.currentIdx];
      if (!item) return;
      const updatedFile = replaceItemInContent(prd.fileContent, item.content, newContent);
      await Deno.writeTextFile(PRD_OUTPUT_PATH, updatedFile);
      setPrdReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: newContent };
        return { ...prev, items: newItems, fileContent: updatedFile, editorOpen: false };
      });
    } else if (arch?.editorOpen) {
      const item = arch.items[arch.currentIdx];
      if (!item) return;
      const updatedFile = replaceItemInContent(arch.fileContent, item.content, newContent);
      await Deno.writeTextFile(ARCH_OUTPUT_PATH, updatedFile);
      setArchReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: newContent };
        return { ...prev, items: newItems, fileContent: updatedFile, editorOpen: false };
      });
    }
  }, [setPrdReviewSynced, setArchReviewSynced]);

  const cancelReviewEdit = useCallback(() => {
    setPrdReviewSynced((prev) => prev ? { ...prev, editorOpen: false } : null);
    setArchReviewSynced((prev) => prev ? { ...prev, editorOpen: false } : null);
  }, [setPrdReviewSynced, setArchReviewSynced]);

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
    prdSynthDone,
    confirmPrdSynthDone,
    skipPrdReview,
    prdReview,
    advancePrdReview,
    openPrdReviewEditor,
    startPrdReviewTyping,
    submitPrdReviewRewrite,
    onPrdReviewType,
    archSynthDone,
    confirmArchSynthDone,
    skipArchSynthDone,
    archReview,
    advanceArchReview,
    openArchReviewEditor,
    startArchReviewTyping,
    submitArchReviewRewrite,
    onArchReviewType,
    saveReviewEdit,
    cancelReviewEdit,
  };
}
