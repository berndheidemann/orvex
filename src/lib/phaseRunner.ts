import type { AgentStatus, RoundStatus, PhaseStatus } from "../types.ts";
import { runClaude } from "./runClaude.ts";

// ── Agent type (owned here to avoid circular imports) ───────────

export interface Agent {
  name: string;
  persona: string;
}

// ── PhaseSink interface ─────────────────────────────────────────

/**
 * Callback interface that the hook provides to runDebatePhase.
 * The hook owns all React state; the runner calls these methods to update it.
 */
export interface PhaseSink {
  setPhaseRunning(phaseId: string): void;
  setAgentStatus(phaseId: string, roundIdx: number, agentIdx: number, status: AgentStatus): void;
  setRoundStatus(phaseId: string, roundIdx: number, status: RoundStatus): void;
  setPhaseStatus(phaseId: string, status: PhaseStatus): void;
  setActiveLabel(label: string): void;
  setAgentStreams(streams: string[]): void;
  setAgentWarnLevel(level: null | "yellow" | "red"): void;
  addChunk(chunk: string): void;
  setLiveLines(lines: string[]): void;
  clearLineBuffer(): void;
}

// ── PromptBuilder type ──────────────────────────────────────────

export type PromptBuilder = (
  roundIdx: number,
  agentIdx: number,
  context: string,
  allOutputs: string[][],
  numRounds: number,
) => string;

// ── PhaseConfig interface ───────────────────────────────────────

export interface PhaseConfig {
  phaseId: string;
  phaseLabel: string;
  outputPath: string;
  agents: Agent[];
  buildPrompt: PromptBuilder;
  context: string;
  numRounds: number;
  phaseModel: string;
  synthModel: string;
  /** Called with round outputs to build the round summary lines */
  formatRoundSummary: (roundNum: number, outputs: string[]) => string[];
  /** Called with synthesis output to build the final summary lines */
  formatSynthesisSummary: (content: string) => string[];
}

// ── runDebatePhase ──────────────────────────────────────────────

/**
 * Runs a full debate phase: N rounds of parallel agents + synthesis.
 * Returns the final synthesis content (written to outputPath).
 *
 * The caller (hook) provides a PhaseSink that maps runner callbacks to
 * React state updates. The runner owns no React state.
 */
export async function runDebatePhase(
  config: PhaseConfig,
  sink: PhaseSink,
  signal: AbortSignal,
): Promise<string> {
  const {
    phaseId,
    phaseLabel,
    outputPath,
    agents,
    buildPrompt,
    context,
    numRounds,
    phaseModel,
    synthModel,
  } = config;

  const allOutputs: string[][] = [];

  sink.setPhaseRunning(phaseId);

  for (let roundIdx = 0; roundIdx < numRounds; roundIdx++) {
    sink.setRoundStatus(phaseId, roundIdx, "running");
    sink.setActiveLabel(
      `${phaseLabel} · Round ${roundIdx + 1} · ${agents.length} agents in parallel…`,
    );
    agents.forEach((_, agentIdx) =>
      sink.setAgentStatus(phaseId, roundIdx, agentIdx, "running")
    );

    // Local buffer tracks the last streamed line per agent for the agent stream display
    const agentLastLines = new Array<string>(agents.length).fill("");
    sink.setAgentStreams(new Array(agents.length).fill(""));

    const warn5 = setTimeout(() => sink.setAgentWarnLevel("yellow"), 5 * 60 * 1000);
    const warn10 = setTimeout(() => sink.setAgentWarnLevel("red"), 10 * 60 * 1000);

    const roundOutputs = await Promise.all(
      agents.map(async (_, agentIdx) => {
        let agentBuf = "";
        const prompt = buildPrompt(roundIdx, agentIdx, context, allOutputs, numRounds);
        const out = await runClaude(
          prompt,
          (chunk: string) => {
            agentBuf += chunk;
            const lines = agentBuf
              .split("\n")
              .map((l: string) => l.trim())
              .filter((l: string) => l && l !== "<k>" && l !== "</k>");
            const last = lines[lines.length - 1] ?? "";
            if (last) {
              agentLastLines[agentIdx] = last.slice(0, 120);
              sink.setAgentStreams([...agentLastLines]);
            }
          },
          signal,
          phaseModel,
        );
        sink.setAgentStatus(phaseId, roundIdx, agentIdx, "done");
        return out;
      }),
    );

    clearTimeout(warn5);
    clearTimeout(warn10);
    sink.setAgentWarnLevel(null);

    sink.setAgentStreams([]);
    allOutputs.push(roundOutputs);
    sink.setRoundStatus(phaseId, roundIdx, "done");
    sink.setLiveLines(config.formatRoundSummary(roundIdx + 1, roundOutputs));
    sink.clearLineBuffer();
    sink.setActiveLabel(`${phaseLabel} · Round ${roundIdx + 1} complete`);
  }

  const synthLabel = `${phaseLabel} · Synthesis`;
  sink.setActiveLabel(synthLabel);
  sink.setRoundStatus(phaseId, numRounds, "running");
  sink.setAgentStatus(phaseId, numRounds, 0, "running");
  sink.clearLineBuffer();

  const synthPrompt = buildPrompt(numRounds, 0, context, allOutputs, numRounds);

  // Record file state before synthesis — the claude CLI runs as a full agent
  // with tool access. If it writes the file directly via Write tool, synthContent
  // will be just a confirmation message. We detect this and use the file content
  // instead of overwriting it with the confirmation text.
  const contentBeforeSynth = await Deno.readTextFile(outputPath).catch(() => "");

  // maxTurns=1: one shot, no room for "write file → output confirmation" pattern
  const synthContent = await runClaude(
    synthPrompt,
    sink.addChunk.bind(sink),
    signal,
    synthModel,
    1,
  );

  // Prefer file content if the agent wrote it during synthesis
  const contentAfterSynth = await Deno.readTextFile(outputPath).catch(() => "");
  const agentWroteFile =
    contentAfterSynth.trim() !== "" && contentAfterSynth !== contentBeforeSynth;
  const finalContent = agentWroteFile ? contentAfterSynth : synthContent;

  if (!finalContent.trim()) {
    throw new Error(`Synthesis produced no content`);
  }
  await Deno.writeTextFile(outputPath, finalContent);

  sink.setAgentStatus(phaseId, numRounds, 0, "done");
  sink.setRoundStatus(phaseId, numRounds, "done");
  sink.setPhaseStatus(phaseId, "done");
  sink.setLiveLines(config.formatSynthesisSummary(finalContent));
  sink.clearLineBuffer();
  sink.setActiveLabel("");

  return finalContent;
}
