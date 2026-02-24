import React from "react";
import type {
  AgentStatus,
  RoundStatus,
  PhaseStatus,
  PhaseState,
  ReviewState,
  SynthDoneState,
  InputKey,
} from "../types.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";
import { runClaude } from "../lib/runClaude.ts";
import {
  SYNTH_MODEL,
  ARCH_AGENTS,
  ARCH_OUTPUT_PATH,
  buildArchPrompt,
  formatRoundSummary,
  formatSynthesisSummary,
  injectSpikeReq,
  injectSpikeIntoStatus,
  runPhase as runDebatePhase,
} from "../lib/initAgents.ts";
import type { PhaseSink } from "../lib/phaseRunner.ts";
import {
  DIDAKTIK_AGENTS,
  EDU_PRD_AGENTS,
  LERNSITUATION_OUTPUT_PATH,
  LERNPFAD_OUTPUT_PATH,
  EDU_PRD_OUTPUT_PATH,
  makeEduPhases,
  buildDidaktikPrompt,
  buildDrehbuchPrompt,
  buildEduPrdPrompt,
} from "../lib/eduAgents.ts";
import {
  parseReqs,
  parseAdrs,
  parseSections,
  replaceItemInContent,
  buildRewritePrompt,
} from "../lib/reviewUtils.ts";
import { applyTypingKey, type TypingState } from "../lib/typingLogic.ts";

const { useState, useEffect, useRef, useCallback } = React;

const MAX_LIVE_LINES = 20;
const DEFAULT_MODEL = "claude-opus-4-6";

// ── Config & State types ────────────────────────────────────────

export interface EduInitConfig {
  fach: string;
  thema: string;
  jahrgangsstufe: string;
  vorwissen: string;
  zeitMinuten: number;
  heterogenitaet: string;
  model?: string;
  didaktikRounds?: number;
  prdRounds?: number;
  archRounds?: number;
  /** Whether LERNSITUATION.md already exists (ADR-011) */
  lernsituationExists?: boolean;
}

export interface EduInitRunnerState {
  phases: PhaseState[];
  liveLines: string[];
  agentStreams: string[];
  activeLabel: string;
  agentWarnLevel: null | "yellow" | "red";
  done: boolean;
  error: string | null;
  // Synth-done screens (transition between generation and review)
  lernSituationSynthDone: SynthDoneState | null;
  prdSynthDone: SynthDoneState | null;
  archSynthDone: SynthDoneState | null;
  // Review states
  lernSituationReview: ReviewState | null;
  prdReview: ReviewState | null;
  archReview: ReviewState | null;
  // True whenever the hook is waiting for user confirmation (any review/synth screen)
  awaitingConfirm: boolean;
  // LernSituation synth-done callbacks
  confirmLernSituationSynthDone: () => void;
  skipLernSituationReview: () => void;
  // LernSituation review callbacks
  advanceLernSituationReview: () => void;
  openLernSituationReviewEditor: () => void;
  startLernSituationReviewTyping: () => void;
  submitLernSituationReviewRewrite: (prompt: string) => void;
  onLernSituationReviewType: (char: string, key: InputKey) => void;
  // PRD synth-done callbacks
  confirmPrdSynthDone: () => void;
  skipPrdReview: () => void;
  // PRD review callbacks
  advancePrdReview: () => void;
  openPrdReviewEditor: () => void;
  startPrdReviewTyping: () => void;
  submitPrdReviewRewrite: (prompt: string) => void;
  onPrdReviewType: (char: string, key: InputKey) => void;
  // Arch synth-done callbacks
  confirmArchSynthDone: () => void;
  skipArchReview: () => void;
  // Arch review callbacks
  advanceArchReview: () => void;
  openArchReviewEditor: () => void;
  startArchReviewTyping: () => void;
  submitArchReviewRewrite: (prompt: string) => void;
  onArchReviewType: (char: string, key: InputKey) => void;
  // Shared editor callbacks
  saveReviewEdit: (content: string) => void;
  cancelReviewEdit: () => void;
}

// ── Hook ───────────────────────────────────────────────────────

export function useEduInitRunner(config: EduInitConfig): EduInitRunnerState {
  const {
    fach,
    thema,
    jahrgangsstufe,
    vorwissen,
    zeitMinuten,
    heterogenitaet,
    model = DEFAULT_MODEL,
    didaktikRounds = 2,
    prdRounds = 2,
    archRounds = 2,
    lernsituationExists = false,
  } = config;

  const [phases, setPhases] = useState<PhaseState[]>(() => {
    const p = makeEduPhases(didaktikRounds, prdRounds, archRounds);
    if (!lernsituationExists) return p;
    // Skip Phase 1 (didaktik) if LERNSITUATION.md already exists
    return p.map((phase) => {
      if (phase.id !== "didaktik") return phase;
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

  // Synth-done states
  const [lernSituationSynthDone, setLernSituationSynthDone] = useState<SynthDoneState | null>(null);
  const [prdSynthDone, setPrdSynthDone] = useState<SynthDoneState | null>(null);
  const [archSynthDone, setArchSynthDone] = useState<SynthDoneState | null>(null);

  // Review states
  const [lernSituationReview, setLernSituationReview] = useState<ReviewState | null>(null);
  const [prdReview, setPrdReview] = useState<ReviewState | null>(null);
  const [archReview, setArchReview] = useState<ReviewState | null>(null);

  // Async flow control refs
  const lernSituationSynthDoneRef = useRef<((doReview: boolean) => void) | null>(null);
  const lernSituationReviewDoneRef = useRef<(() => void) | null>(null);
  const prdSynthDoneRef = useRef<((doReview: boolean) => void) | null>(null);
  const prdReviewDoneRef = useRef<(() => void) | null>(null);
  const archSynthDoneRef = useRef<((doReview: boolean) => void) | null>(null);
  const archReviewDoneRef = useRef<(() => void) | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Refs to read current review state from async callbacks
  const lernSituationReviewRef = useRef<ReviewState | null>(null);
  const prdReviewRef = useRef<ReviewState | null>(null);
  const archReviewRef = useRef<ReviewState | null>(null);

  const lineBufferRef = useRef<string>("");

  // awaitingConfirm: true whenever any synth-done or review screen is active
  const awaitingConfirm =
    lernSituationSynthDone !== null ||
    prdSynthDone !== null ||
    archSynthDone !== null ||
    lernSituationReview !== null ||
    prdReview !== null ||
    archReview !== null;

  // ── Ref-synced state setters ───────────────────────────────

  type RS = ReviewState | null;
  type RSUpdater = (prev: RS) => RS;

  const setLernSituationReviewSynced: (update: RSUpdater) => void = useCallback(
    (update: RSUpdater) => {
      setLernSituationReview((prev: RS) => {
        const next = update(prev);
        lernSituationReviewRef.current = next;
        return next;
      });
    },
    [],
  );

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

  // ── Streaming chunk handler ────────────────────────────────

  const addChunk = useCallback((chunk: string) => {
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
      return withPreview.slice(-MAX_LIVE_LINES);
    });
  }, []);

  // ── PhaseSink factory ──────────────────────────────────────

  const makeSink = useCallback((): PhaseSink => ({
    setPhaseRunning: (phaseId: string) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => p.id === phaseId ? { ...p, status: "running", startedAt: Date.now() } : p)
      );
    },
    setAgentStatus: (phaseId: string, roundIdx: number, agentIdx: number, status: AgentStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          const rounds = p.rounds.map((r, ri) => {
            if (ri !== roundIdx) return r;
            return { ...r, agents: r.agents.map((a, ai) => ai === agentIdx ? { ...a, status } : a) };
          });
          return { ...p, rounds };
        })
      );
    },
    setRoundStatus: (phaseId: string, roundIdx: number, status: RoundStatus) => {
      setPhases((prev: PhaseState[]) =>
        prev.map((p) => {
          if (p.id !== phaseId) return p;
          return { ...p, rounds: p.rounds.map((r, ri) => ri === roundIdx ? { ...r, status } : r) };
        })
      );
    },
    setPhaseStatus: (phaseId: string, status: PhaseStatus) => {
      setPhases((prev: PhaseState[]) => prev.map((p) => p.id === phaseId ? { ...p, status } : p));
    },
    setActiveLabel,
    setAgentStreams,
    setAgentWarnLevel,
    addChunk,
    setLiveLines,
    clearLineBuffer: () => { lineBufferRef.current = ""; },
  }), [setActiveLabel, setAgentStreams, setAgentWarnLevel, addChunk, setLiveLines]);

  // ── Main effect ────────────────────────────────────────────

  useEffect(() => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    const learningContextContent = [
      `# Lernkontext`,
      ``,
      `- **Fach:** ${fach}`,
      `- **Thema:** ${thema}`,
      `- **Jahrgangsstufe:** ${jahrgangsstufe}`,
      `- **Vorwissen:** ${vorwissen}`,
      `- **Unterrichtszeit:** ${zeitMinuten} Minuten`,
      `- **Besondere Anforderungen:** ${heterogenitaet || "(keine)"}`,
    ].join("\n");

    (async () => {
      try {
        // ── Phase 0: Write learning-context.md ─────────────────
        await Deno.writeTextFile("learning-context.md", learningContextContent);

        // ── Phase 1: Didaktik-Debate → LERNSITUATION.md ────────
        if (lernsituationExists) {
          // Skip generation, offer review of existing file
          const existingContent = await Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => "");
          const existingSections = parseSections(existingContent);
          setLernSituationSynthDone({
            items: existingSections,
            fileContent: existingContent,
            existing: true,
          });
          const doReview = await new Promise<boolean>((resolve) => {
            lernSituationSynthDoneRef.current = resolve;
          });
          setLernSituationSynthDone(null);
          if (doReview && existingSections.length > 0) {
            const initialReview: ReviewState = {
              items: existingSections,
              currentIdx: 0,
              inputMode: "none",
              typedInput: "",
              typingCursorPos: 0,
              editorOpen: false,
              fileContent: existingContent,
            };
            setLernSituationReviewSynced((_prev) => initialReview);
            await new Promise<void>((resolve) => {
              lernSituationReviewDoneRef.current = resolve;
            });
            setLernSituationReviewSynced((_prev) => null);
          }
        } else {
          await runDebatePhase(
            {
              phaseId: "didaktik",
              phaseLabel: "Didaktik",
              outputPath: LERNSITUATION_OUTPUT_PATH,
              agents: DIDAKTIK_AGENTS,
              buildPrompt: buildDidaktikPrompt,
              context: learningContextContent,
              numRounds: didaktikRounds,
              phaseModel: model,
              synthModel: SYNTH_MODEL,
              formatRoundSummary: (roundNum, outputs) =>
                formatRoundSummary(roundNum, DIDAKTIK_AGENTS, outputs),
              formatSynthesisSummary: (content) => {
                const sections = parseSections(content);
                const sectionLines = sections.length > 0
                  ? sections.map((s) => `  ✓ ${s.title}`)
                  : ["  (no sections found)"];
                return [
                  "Synthesis · LERNSITUATION.md created",
                  "─".repeat(26),
                  "",
                  ...sectionLines,
                ];
              },
            },
            makeSink(),
            ctrl.signal,
          );

          const lernsituationContent = await Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => "");
          const lernsituationSections = parseSections(lernsituationContent);
          setLernSituationSynthDone({ items: lernsituationSections, fileContent: lernsituationContent });
          const doReview = await new Promise<boolean>((resolve) => {
            lernSituationSynthDoneRef.current = resolve;
          });
          setLernSituationSynthDone(null);

          if (doReview && lernsituationSections.length > 0) {
            const initialReview: ReviewState = {
              items: lernsituationSections,
              currentIdx: 0,
              inputMode: "none",
              typedInput: "",
              typingCursorPos: 0,
              editorOpen: false,
              fileContent: lernsituationContent,
            };
            setLernSituationReviewSynced((_prev) => initialReview);
            await new Promise<void>((resolve) => {
              lernSituationReviewDoneRef.current = resolve;
            });
            setLernSituationReviewSynced((_prev) => null);
          }
        }

        // ── Phase 1.5: Drehbuch-Synthese → lernpfad.md ────────
        const lernsituationForDrehbuch = await Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => "");
        setActiveLabel("Lernpfad · Synthese…");
        lineBufferRef.current = "";
        const drehbuchPrompt = buildDrehbuchPrompt(lernsituationForDrehbuch);
        const drehbuchContent = await runClaude(
          drehbuchPrompt,
          addChunk,
          ctrl.signal,
          SYNTH_MODEL,
          1,
        );
        if (!drehbuchContent.trim()) {
          throw new Error("Drehbuch-Synthese produced no content");
        }
        await Deno.writeTextFile(LERNPFAD_OUTPUT_PATH, drehbuchContent);
        setActiveLabel("");
        lineBufferRef.current = "";

        // ── Phase 2: EDU-PRD-Debate → PRD.md ──────────────────
        const [lernkontextRaw, lernsituationRaw, lernpfadRaw] = await Promise.all([
          Deno.readTextFile("learning-context.md").catch(() => ""),
          Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => ""),
          Deno.readTextFile(LERNPFAD_OUTPUT_PATH).catch(() => ""),
        ]);
        const combinedContext = [
          "## learning-context.md",
          lernkontextRaw,
          "",
          "## LERNSITUATION.md",
          lernsituationRaw,
          "",
          "## lernpfad.md",
          lernpfadRaw,
        ].join("\n");

        await runDebatePhase(
          {
            phaseId: "prd",
            phaseLabel: "EDU-PRD",
            outputPath: EDU_PRD_OUTPUT_PATH,
            agents: EDU_PRD_AGENTS,
            buildPrompt: buildEduPrdPrompt,
            context: combinedContext,
            numRounds: prdRounds,
            phaseModel: model,
            synthModel: SYNTH_MODEL,
            formatRoundSummary: (roundNum, outputs) =>
              formatRoundSummary(roundNum, EDU_PRD_AGENTS, outputs),
            formatSynthesisSummary: (content) => formatSynthesisSummary(content, "prd"),
          },
          makeSink(),
          ctrl.signal,
        );

        const prdContent = await Deno.readTextFile(EDU_PRD_OUTPUT_PATH).catch(() => "");
        const prdItems = parseReqs(prdContent);
        setPrdSynthDone({ items: prdItems, fileContent: prdContent });
        const doPrdReview = await new Promise<boolean>((resolve) => {
          prdSynthDoneRef.current = resolve;
        });
        setPrdSynthDone(null);

        if (doPrdReview && prdItems.length > 0) {
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

        // ── Phase 3: Arch-Debate → architecture.md ─────────────
        await Deno.mkdir(AGENT_DIR, { recursive: true });
        const prdForArch = await Deno.readTextFile(EDU_PRD_OUTPUT_PATH).catch(() => "");

        await runDebatePhase(
          {
            phaseId: "arch",
            phaseLabel: "Architecture",
            outputPath: ARCH_OUTPUT_PATH,
            agents: ARCH_AGENTS,
            buildPrompt: buildArchPrompt,
            context: prdForArch,
            numRounds: archRounds,
            phaseModel: model,
            synthModel: SYNTH_MODEL,
            formatRoundSummary: (roundNum, outputs) =>
              formatRoundSummary(roundNum, ARCH_AGENTS, outputs),
            formatSynthesisSummary: (content) => formatSynthesisSummary(content, "arch"),
          },
          makeSink(),
          ctrl.signal,
        );

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

        // ── Inject REQ-000 Walking Skeleton ────────────────────
        const statusPath = `${AGENT_DIR}/status.json`;
        const [prdRaw, statusRaw] = await Promise.all([
          Deno.readTextFile(EDU_PRD_OUTPUT_PATH).catch(() => ""),
          Deno.readTextFile(statusPath).catch(() => "{}"),
        ]);
        const prdWithSpike = injectSpikeReq(prdRaw);
        const statusWithSpike = injectSpikeIntoStatus(statusRaw);
        await Promise.all([
          Deno.writeTextFile(EDU_PRD_OUTPUT_PATH, prdWithSpike),
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

  // ── LernSituation synth-done ───────────────────────────────

  const confirmLernSituationSynthDone = useCallback(() => {
    if (lernSituationSynthDoneRef.current) {
      lernSituationSynthDoneRef.current(true);
      lernSituationSynthDoneRef.current = null;
    }
  }, []);

  const skipLernSituationReview = useCallback(() => {
    if (lernSituationSynthDoneRef.current) {
      lernSituationSynthDoneRef.current(false);
      lernSituationSynthDoneRef.current = null;
    }
  }, []);

  // ── LernSituation review callbacks ────────────────────────

  const advanceLernSituationReview = useCallback(() => {
    setLernSituationReviewSynced((prev) => {
      if (!prev) return null;
      if (prev.currentIdx + 1 >= prev.items.length) {
        lernSituationReviewDoneRef.current?.();
        return null;
      }
      return { ...prev, currentIdx: prev.currentIdx + 1, inputMode: "none", typedInput: "", typingCursorPos: 0 };
    });
  }, [setLernSituationReviewSynced]);

  const openLernSituationReviewEditor = useCallback(() => {
    setLernSituationReviewSynced((prev) => prev ? { ...prev, editorOpen: true } : null);
  }, [setLernSituationReviewSynced]);

  const startLernSituationReviewTyping = useCallback(() => {
    setLernSituationReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null
    );
  }, [setLernSituationReviewSynced]);

  const onLernSituationReviewType = useCallback((char: string, key: InputKey) => {
    setLernSituationReviewSynced((prev) => {
      if (!prev || prev.inputMode !== "typing") return prev ?? null;
      if (key.escape) return { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      const ts: TypingState = applyTypingKey(
        { text: prev.typedInput, cursor: prev.typingCursorPos },
        char,
        key,
      );
      return { ...prev, typedInput: ts.text, typingCursorPos: ts.cursor };
    });
  }, [setLernSituationReviewSynced]);

  const submitLernSituationReviewRewrite = useCallback(async (userPrompt: string) => {
    const review = lernSituationReviewRef.current;
    if (!review) return;
    const item = review.items[review.currentIdx];
    if (!item) return;
    setLernSituationReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null
    );
    try {
      const newContent = await runClaude(
        buildRewritePrompt(item, userPrompt, "section"),
        () => {},
        ctrlRef.current!.signal,
        DEFAULT_MODEL,
        10,
      );
      const trimmed = newContent.trim();
      const currentReview = lernSituationReviewRef.current;
      if (!currentReview) return;
      const updatedFile = replaceItemInContent(currentReview.fileContent, item.content, trimmed);
      await Deno.writeTextFile(LERNSITUATION_OUTPUT_PATH, updatedFile);
      setLernSituationReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: trimmed };
        return { ...prev, items: newItems, fileContent: updatedFile, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      });
    } catch (e) {
      setLernSituationReviewSynced((prev) =>
        prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null
      );
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setLernSituationReviewSynced]);

  // ── PRD synth-done ─────────────────────────────────────────

  const confirmPrdSynthDone = useCallback(() => {
    if (prdSynthDoneRef.current) {
      prdSynthDoneRef.current(true);
      prdSynthDoneRef.current = null;
    }
  }, []);

  const skipPrdReview = useCallback(() => {
    if (prdSynthDoneRef.current) {
      prdSynthDoneRef.current(false);
      prdSynthDoneRef.current = null;
    }
  }, []);

  // ── PRD review callbacks ───────────────────────────────────

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
    setPrdReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null
    );
  }, [setPrdReviewSynced]);

  const onPrdReviewType = useCallback((char: string, key: InputKey) => {
    setPrdReviewSynced((prev) => {
      if (!prev || prev.inputMode !== "typing") return prev ?? null;
      if (key.escape) return { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      const ts: TypingState = applyTypingKey(
        { text: prev.typedInput, cursor: prev.typingCursorPos },
        char,
        key,
      );
      return { ...prev, typedInput: ts.text, typingCursorPos: ts.cursor };
    });
  }, [setPrdReviewSynced]);

  const submitPrdReviewRewrite = useCallback(async (userPrompt: string) => {
    const review = prdReviewRef.current;
    if (!review) return;
    const item = review.items[review.currentIdx];
    if (!item) return;
    setPrdReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null
    );
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
      await Deno.writeTextFile(EDU_PRD_OUTPUT_PATH, updatedFile);
      setPrdReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: trimmed };
        return { ...prev, items: newItems, fileContent: updatedFile, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      });
    } catch (e) {
      setPrdReviewSynced((prev) =>
        prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null
      );
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setPrdReviewSynced]);

  // ── Arch synth-done ────────────────────────────────────────

  const confirmArchSynthDone = useCallback(() => {
    if (archSynthDoneRef.current) {
      archSynthDoneRef.current(true);
      archSynthDoneRef.current = null;
    }
  }, []);

  const skipArchReview = useCallback(() => {
    if (archSynthDoneRef.current) {
      archSynthDoneRef.current(false);
      archSynthDoneRef.current = null;
    }
  }, []);

  // ── Arch review callbacks ──────────────────────────────────

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
    setArchReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null
    );
  }, [setArchReviewSynced]);

  const onArchReviewType = useCallback((char: string, key: InputKey) => {
    setArchReviewSynced((prev) => {
      if (!prev || prev.inputMode !== "typing") return prev ?? null;
      if (key.escape) return { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 };
      const ts: TypingState = applyTypingKey(
        { text: prev.typedInput, cursor: prev.typingCursorPos },
        char,
        key,
      );
      return { ...prev, typedInput: ts.text, typingCursorPos: ts.cursor };
    });
  }, [setArchReviewSynced]);

  const submitArchReviewRewrite = useCallback(async (userPrompt: string) => {
    const review = archReviewRef.current;
    if (!review) return;
    const item = review.items[review.currentIdx];
    if (!item) return;
    setArchReviewSynced((prev) =>
      prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null
    );
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
      setArchReviewSynced((prev) =>
        prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null
      );
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setArchReviewSynced]);

  // ── Shared editor callbacks ────────────────────────────────

  const saveReviewEdit = useCallback(async (newContent: string) => {
    const lern = lernSituationReviewRef.current;
    const prd = prdReviewRef.current;
    const arch = archReviewRef.current;

    if (lern?.editorOpen) {
      const item = lern.items[lern.currentIdx];
      if (!item) return;
      const updatedFile = replaceItemInContent(lern.fileContent, item.content, newContent);
      await Deno.writeTextFile(LERNSITUATION_OUTPUT_PATH, updatedFile);
      setLernSituationReviewSynced((prev) => {
        if (!prev) return null;
        const newItems = [...prev.items];
        newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: newContent };
        return { ...prev, items: newItems, fileContent: updatedFile, editorOpen: false };
      });
    } else if (prd?.editorOpen) {
      const item = prd.items[prd.currentIdx];
      if (!item) return;
      const updatedFile = replaceItemInContent(prd.fileContent, item.content, newContent);
      await Deno.writeTextFile(EDU_PRD_OUTPUT_PATH, updatedFile);
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
  }, [setLernSituationReviewSynced, setPrdReviewSynced, setArchReviewSynced]);

  const cancelReviewEdit = useCallback(() => {
    setLernSituationReviewSynced((prev) => prev ? { ...prev, editorOpen: false } : null);
    setPrdReviewSynced((prev) => prev ? { ...prev, editorOpen: false } : null);
    setArchReviewSynced((prev) => prev ? { ...prev, editorOpen: false } : null);
  }, [setLernSituationReviewSynced, setPrdReviewSynced, setArchReviewSynced]);

  return {
    phases,
    liveLines,
    agentStreams,
    activeLabel,
    agentWarnLevel,
    done,
    error,
    lernSituationSynthDone,
    prdSynthDone,
    archSynthDone,
    lernSituationReview,
    prdReview,
    archReview,
    awaitingConfirm,
    confirmLernSituationSynthDone,
    skipLernSituationReview,
    advanceLernSituationReview,
    openLernSituationReviewEditor,
    startLernSituationReviewTyping,
    submitLernSituationReviewRewrite,
    onLernSituationReviewType,
    confirmPrdSynthDone,
    skipPrdReview,
    advancePrdReview,
    openPrdReviewEditor,
    startPrdReviewTyping,
    submitPrdReviewRewrite,
    onPrdReviewType,
    confirmArchSynthDone,
    skipArchReview,
    advanceArchReview,
    openArchReviewEditor,
    startArchReviewTyping,
    submitArchReviewRewrite,
    onArchReviewType,
    saveReviewEdit,
    cancelReviewEdit,
  };
}
