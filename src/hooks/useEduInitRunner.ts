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
import { makeAddChunk, makePhaseSink } from "../lib/sinkFactory.ts";
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
} from "../lib/reviewUtils.ts";
import {
  useReviewTarget,
  useSharedEditCallbacks,
  runReviewSequence,
} from "../lib/reviewFlow.ts";

const { useState, useEffect, useRef } = React;

const MAX_LIVE_LINES = 20;
const DEFAULT_MODEL = "claude-opus-4-6";

// ── Config & State types ────────────────────────────────────────────

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
  /** Whether lernpfad.md already exists — skip regeneration on resume */
  lernpfadExists?: boolean;
  /** Whether PRD.md already exists — skip EDU-PRD debate on resume */
  prdExists?: boolean;
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

// ── Hook ───────────────────────────────────────────────────────────

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
    lernpfadExists = false,
    prdExists = false,
  } = config;

  const [phases, setPhases] = useState<PhaseState[]>(() => {
    const p = makeEduPhases(didaktikRounds, prdRounds, archRounds);
    const preCompleted = new Set<string>();
    if (lernsituationExists) preCompleted.add("didaktik");
    if (prdExists) preCompleted.add("prd");
    if (preCompleted.size === 0) return p;
    return p.map((phase) => {
      if (!preCompleted.has(phase.id)) return phase;
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

  const ctrlRef = useRef<AbortController | null>(null);
  const lineBufferRef = useRef<string>("");

  // ── Review targets ──────────────────────────────────────────────

  const lernTarget = useReviewTarget({
    outputPath: LERNSITUATION_OUTPUT_PATH,
    rewriteType: "section",
    rewriteModel: DEFAULT_MODEL,
    ctrlRef,
    setError: (err: string) => setError(err),
  });

  const prdTarget = useReviewTarget({
    outputPath: EDU_PRD_OUTPUT_PATH,
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

  const { saveReviewEdit, cancelReviewEdit } = useSharedEditCallbacks([
    lernTarget,
    prdTarget,
    archTarget,
  ]);

  // awaitingConfirm: true whenever any synth-done or review screen is active
  const awaitingConfirm =
    lernTarget.synthDone !== null ||
    prdTarget.synthDone !== null ||
    archTarget.synthDone !== null ||
    lernTarget.review !== null ||
    prdTarget.review !== null ||
    archTarget.review !== null;

  // ── Streaming chunk handler ─────────────────────────────────────

  const addChunk = React.useMemo(
    () => makeAddChunk(lineBufferRef, setLiveLines, MAX_LIVE_LINES),
    [],
  );

  // ── PhaseSink factory ───────────────────────────────────────────

  const makeSink = () =>
    makePhaseSink(
      setPhases, setActiveLabel, setAgentStreams, setAgentWarnLevel,
      addChunk, setLiveLines, lineBufferRef,
    );

  // ── Main effect ─────────────────────────────────────────────────

  useEffect(() => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    (async () => {
      try {
        // ── Phase 0: Write learning-context.md ─────────────────────
        // Scan project directory for additional context files (.md / .txt)
        // — same principle as the normal orvex agent reading all project files.
        const EXCLUDED = new Set([
          "learning-context.md", "LERNSITUATION.md", "lernpfad.md",
          "PRD.md", "architecture.md", "AGENT.md", "VALIDATOR.md",
          "REFACTOR.md", "REFACTOR_TEMPLATE.md",
        ]);
        const extraParts: string[] = [];
        try {
          for await (const entry of Deno.readDir(".")) {
            if (!entry.isFile) continue;
            if (EXCLUDED.has(entry.name)) continue;
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            if (ext !== "md" && ext !== "txt") continue;
            const content = await Deno.readTextFile(entry.name).catch(() => "");
            if (content.trim()) {
              extraParts.push(`## ${entry.name}\n\n${content.trim()}`);
            }
          }
        } catch { /* readDir not available or empty dir — ignore */ }

        const learningContextContent = [
          `# Lernkontext`,
          ``,
          `- **Fach:** ${fach}`,
          `- **Thema:** ${thema}`,
          `- **Jahrgangsstufe:** ${jahrgangsstufe}`,
          `- **Vorwissen:** ${vorwissen}`,
          `- **Unterrichtszeit:** ${zeitMinuten} Minuten`,
          `- **Besondere Anforderungen:** ${heterogenitaet || "(keine)"}`,
          ...(extraParts.length > 0
            ? [``, `---`, ``, `# Weitere Projektdateien`, ``, extraParts.join("\n\n---\n\n")]
            : []),
        ].join("\n");

        await Deno.writeTextFile("learning-context.md", learningContextContent);

        // ── Phase 1: Didaktik-Debate → LERNSITUATION.md ─────────────
        if (lernsituationExists) {
          // Skip generation, offer review of existing file
          const existingContent = await Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => "");
          const existingSections = parseSections(existingContent);
          await runReviewSequence(lernTarget, existingSections, existingContent, { existing: true, signal: ctrl.signal });
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
          await runReviewSequence(lernTarget, lernsituationSections, lernsituationContent, { signal: ctrl.signal });
        }

        // ── Phase 1.5: Drehbuch-Synthese → lernpfad.md ─────────────
        if (lernpfadExists) {
          setActiveLabel("Lernpfad · vorhanden — wird übersprungen");
          await new Promise((r) => setTimeout(r, 800));
          setActiveLabel("");
        } else {
          const lernsituationForDrehbuch = await Deno.readTextFile(LERNSITUATION_OUTPUT_PATH).catch(() => "");
          setActiveLabel("Lernpfad · Synthese…");
          lineBufferRef.current = "";
          const drehbuchPrompt = buildDrehbuchPrompt(lernsituationForDrehbuch);

          // Synthesis-specific controller: 4-minute timeout + chain from parent abort
          const synthCtrl = new AbortController();
          const synthTimeout = setTimeout(() => synthCtrl.abort(), 4 * 60 * 1000);
          const parentAbort = () => synthCtrl.abort();
          ctrl.signal.addEventListener("abort", parentAbort, { once: true });

          let drehbuchContent = "";
          try {
            drehbuchContent = await runClaude(
              drehbuchPrompt,
              addChunk,
              synthCtrl.signal,
              SYNTH_MODEL,
              5,   // maxTurns 5: allow model to finish after a tool call
            );
          } finally {
            clearTimeout(synthTimeout);
            ctrl.signal.removeEventListener("abort", parentAbort);
          }

          if (synthCtrl.signal.aborted && !ctrl.signal.aborted) {
            throw new Error("Lernpfad-Synthese: Timeout nach 4 Minuten");
          }
          if (!drehbuchContent.trim()) {
            throw new Error("Drehbuch-Synthese produced no content");
          }
          await Deno.writeTextFile(LERNPFAD_OUTPUT_PATH, drehbuchContent);
          setActiveLabel("");
          lineBufferRef.current = "";
        }

        // ── Phase 2: EDU-PRD-Debate → PRD.md ───────────────────────
        if (prdExists) {
          // PRD already generated — skip debate, offer review of existing file
          const existingPrd = await Deno.readTextFile(EDU_PRD_OUTPUT_PATH).catch(() => "");
          const existingReqs = parseReqs(existingPrd);
          await runReviewSequence(prdTarget, existingReqs, existingPrd, { existing: true, signal: ctrl.signal });
        } else {
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
          await runReviewSequence(prdTarget, prdItems, prdContent, { signal: ctrl.signal });
        }

        // ── Phase 3: Arch-Debate → architecture.md ──────────────────
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
        await runReviewSequence(archTarget, archItems, archContent, { signal: ctrl.signal });

        // ── Inject REQ-000 Walking Skeleton ──────────────────────────
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

  return {
    phases,
    liveLines,
    agentStreams,
    activeLabel,
    agentWarnLevel,
    done,
    error,
    lernSituationSynthDone: lernTarget.synthDone,
    prdSynthDone: prdTarget.synthDone,
    archSynthDone: archTarget.synthDone,
    lernSituationReview: lernTarget.review,
    prdReview: prdTarget.review,
    archReview: archTarget.review,
    awaitingConfirm,
    confirmLernSituationSynthDone: lernTarget.confirmSynthDone,
    skipLernSituationReview: lernTarget.skipReview,
    advanceLernSituationReview: lernTarget.advance,
    openLernSituationReviewEditor: lernTarget.openEditor,
    startLernSituationReviewTyping: lernTarget.startTyping,
    submitLernSituationReviewRewrite: lernTarget.submitRewrite,
    onLernSituationReviewType: lernTarget.onType,
    confirmPrdSynthDone: prdTarget.confirmSynthDone,
    skipPrdReview: prdTarget.skipReview,
    advancePrdReview: prdTarget.advance,
    openPrdReviewEditor: prdTarget.openEditor,
    startPrdReviewTyping: prdTarget.startTyping,
    submitPrdReviewRewrite: prdTarget.submitRewrite,
    onPrdReviewType: prdTarget.onType,
    confirmArchSynthDone: archTarget.confirmSynthDone,
    skipArchReview: archTarget.skipReview,
    advanceArchReview: archTarget.advance,
    openArchReviewEditor: archTarget.openEditor,
    startArchReviewTyping: archTarget.startTyping,
    submitArchReviewRewrite: archTarget.submitRewrite,
    onArchReviewType: archTarget.onType,
    saveReviewEdit,
    cancelReviewEdit,
  };
}
