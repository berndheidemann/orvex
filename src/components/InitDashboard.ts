import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useInitRunner } from "../hooks/useInitRunner.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { useRawBackspace } from "../hooks/useRawBackspace.ts";
import { InitSetup, ArchSetup, type InitConfig } from "./InitSetup.ts";
import { ReviewEditor } from "./ReviewEditor.ts";
import type {
  PhaseState,
  RoundStatus,
  AgentStatus,
  PhaseStatus,
  ReviewState,
  SynthDoneState,
} from "../types.ts";
import { SYNTH_MODEL } from "../lib/initAgents.ts";
import { parseAdrConstraints } from "../lib/reviewUtils.ts";

const { createElement: h, useEffect, useState } = React;

import { ProgressBar } from "./ProgressBar.ts";

const ROUND_ICONS: Record<RoundStatus, string> = {
  pending: "○",
  running: "▶",
  done: "✓",
};

const ROUND_COLORS: Record<RoundStatus, string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
};

const AGENT_ICONS: Record<AgentStatus, string> = {
  pending: "○",
  running: "▶",
  done: "✓",
};

const AGENT_COLORS: Record<AgentStatus, string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
};

export const PHASE_COLORS: Record<PhaseStatus, string> = {
  pending: "gray",
  running: "cyan",
  done: "green",
};

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-4-6":           "Opus",
  "claude-sonnet-4-6":         "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
};
const modelShort = (id: string) => MODEL_SHORT[id] ?? id;
const SYNTH_LABEL = modelShort(SYNTH_MODEL);

export const ROUND_SECS = 120;
export const SYNTH_SECS = 720;
export { modelShort };

// ── PhaseBlockCompact ──────────────────────────────────────────

export function PhaseBlockCompact(props: {
  phase: PhaseState;
  barWidth: number;
  now: number;
  model: string;
}): React.ReactElement {
  const { phase, barWidth, now, model } = props;
  const roundModelLabel = modelShort(model);
  const totalRounds = phase.rounds.length;
  const doneRounds = phase.rounds.filter((r) => r.status === "done").length;
  const discussionRounds = totalRounds - 1;
  const estimatedMs = (discussionRounds * ROUND_SECS + SYNTH_SECS) * 1000;

  let filledWidth: number;
  let sideLabel: string;

  if (phase.status === "done") {
    filledWidth = barWidth;
    sideLabel = "✓";
  } else if (phase.status === "running" && phase.startedAt !== null) {
    const elapsed = now - phase.startedAt;
    const timeBased = Math.round((elapsed / estimatedMs) * barWidth);
    const roundBased = Math.round((doneRounds / totalRounds) * barWidth);
    filledWidth = Math.min(barWidth - 1, Math.max(timeBased, roundBased));
    const secs = Math.floor(elapsed / 1000);
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    sideLabel = mins > 0 ? `${mins}:${String(rem).padStart(2, "0")}` : `${secs}s`;
  } else {
    filledWidth = 0;
    sideLabel = `~${Math.round(estimatedMs / 60000)}min`;
  }

  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 1 },
      h(Text, { bold: true, color: PHASE_COLORS[phase.status] },
        phase.status === "done" ? `✓  ${phase.label}` :
        phase.status === "running" ? `▶  ${phase.label}` :
        `○  ${phase.label}`),
      phase.status === "pending"
        ? h(Text, { dimColor: true }, "(waiting)")
        : null,
    ),
    h(
      Box,
      { flexDirection: "row", gap: 1, paddingLeft: 3 },
      h(ProgressBar, {
        filled: filledWidth,
        total: barWidth,
        width: barWidth,
        color: PHASE_COLORS[phase.status],
      }),
      h(Text, { dimColor: true }, ` ${sideLabel}`),
    ),
    h(
      Box,
      { flexDirection: "column", paddingLeft: 3 },
      ...phase.rounds.map((round, idx) => {
        const isSynthesis = idx === phase.rounds.length - 1;
        const label = isSynthesis ? SYNTH_LABEL : roundModelLabel;
        return h(
          Box,
          { key: String(idx), flexDirection: "row", gap: 1 },
          h(Text, { color: ROUND_COLORS[round.status] }, ROUND_ICONS[round.status]),
          h(Text, { dimColor: round.status === "pending" }, round.label),
          h(Text, { dimColor: true }, " "),
          h(Text, {},
            ...round.agents.map((agent) =>
              h(Text, { color: AGENT_COLORS[agent.status] }, AGENT_ICONS[agent.status])
            )
          ),
          h(Text, { dimColor: true }, ` ${label}`),
        );
      }),
    ),
  );
}

// ── SynthDoneUI ────────────────────────────────────────────────
// Shown between synthesis completion and review start.
// PRD: shows list of REQ IDs + explanation.
// Arch: shows full scrollable architecture.md content.

export function SynthDoneUI(props: {
  type: "prd" | "arch" | "lernsituation";
  state: SynthDoneState;
}): React.ReactElement {
  const { type, state } = props;
  const { columns, rows } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);

  const divider = "─".repeat(Math.min(columns - 2, 60));
  const HEADER_H = 3; // title + divider + blank line
  const FOOTER_H = 3; // divider + hint + buttons

  let lines: string[];
  if (type === "prd") {
    const prdTitleMatch = state.fileContent.match(/^#\s+PRD\s+[—-]+\s*(.+)$/m);
    const prdTitle = prdTitleMatch ? prdTitleMatch[1].trim() : "";
    const statusLine = state.existing
      ? `○  PRD.md found — ${state.items.length} requirements`
      : `✓  PRD.md created — ${state.items.length} requirements found`;
    const introLines = state.existing
      ? [
          "Would you like to review each requirement individually,",
          "or continue directly to architecture generation?",
        ]
      : [
          "The review lets you inspect each requirement individually,",
          "adjust it, or have Opus rewrite it.",
          "Changes are saved directly to PRD.md.",
        ];
    lines = [
      statusLine,
      ...(prdTitle ? [`   ${prdTitle}`] : []),
      "",
      ...state.items.map((item) => `  ${item.id}: ${item.title}`),
      "",
      ...introLines,
    ];
  } else {
    lines = state.fileContent.split("\n");
  }

  const viewportH = Math.max(5, rows - HEADER_H - FOOTER_H);
  const maxScroll = Math.max(0, lines.length - viewportH);

  useInput((_input, key) => {
    if (key.upArrow) setScrollOffset((prev: number) => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset((prev: number) => Math.min(maxScroll, prev + 1));
  });

  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportH);
  const title = type === "prd"
    ? (state.existing ? "PRD.md — Review" : "PRD.md created")
    : type === "lernsituation"
    ? (state.existing ? "LERNSITUATION.md — Review" : "LERNSITUATION.md created")
    : "architecture.md created";

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { bold: true, color: "green" }, `✓  ${title}`),
    ),
    h(Text, { dimColor: true }, divider),
    // Content area
    h(
      Box,
      { flexDirection: "column" },
      ...visibleLines.map((line, i) =>
        h(Text, { key: String(i), wrap: "truncate" }, line || " ")
      ),
    ),
    h(Text, { dimColor: true }, divider),
    // Scroll hint + action
    h(
      Box,
      { flexDirection: "row", gap: 3 },
      maxScroll > 0
        ? h(Text, { dimColor: true },
            `  ↑/↓ scroll  (${scrollOffset + 1}–${Math.min(scrollOffset + viewportH, lines.length)} / ${lines.length})`)
        : null,
    ),
    type === "prd"
      ? (state.existing
          ? h(Text, { dimColor: true }, "  [Enter / y] Start review    [Esc / n] Skip → continue to architecture")
          : h(Text, { dimColor: true }, "  [Enter] Start review"))
      : h(Text, { dimColor: true }, "  [Enter / y] Start review    [Esc / n] Skip"),
  );
}

// ── ReviewUI ───────────────────────────────────────────────────
// Scrollable, self-contained. Handles ↑/↓ for scroll internally.

export function ReviewUI(props: {
  review: ReviewState;
  type: "prd" | "arch" | "lernsituation";
}): React.ReactElement {
  const { review, type } = props;
  const { columns, rows } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);

  const { items, currentIdx, inputMode, typedInput, typingCursorPos } = review;
  const item = items[currentIdx];
  const total = items.length;

  // Reset scroll when moving to a new item
  useEffect(() => {
    setScrollOffset(0);
  }, [currentIdx]);

  const allLines = item ? item.content.split("\n") : [];
  const constraints = type === "arch" && item ? parseAdrConstraints(item.content) : [];
  const hasConstraint = constraints.length > 0;
  const HEADER_H = 4 + (hasConstraint ? 2 : 0); // title bar + REQ header + [warning] + divider
  const FOOTER_H = inputMode === "typing" ? 3 : 2; // divider + hint(s)
  const viewportH = Math.max(5, rows - HEADER_H - FOOTER_H);
  const maxScroll = Math.max(0, allLines.length - viewportH);

  useInput((_input, key) => {
    if (inputMode !== "none") return;
    if (key.upArrow) setScrollOffset((prev: number) => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset((prev: number) => Math.min(maxScroll, prev + 1));
  });

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + viewportH);
  const divider = "─".repeat(Math.min(columns - 2, 60));
  const typeLabel = type === "prd" ? "PRD Review"
    : type === "lernsituation" ? "Lernsituation Review"
    : "Architecture Review";
  const itemLabel = type === "prd" ? "REQ"
    : type === "lernsituation" ? "Section"
    : "ADR";

  if (!item) {
    return h(
      Box,
      { flexDirection: "column", paddingX: 1 },
      h(Text, { color: "yellow", bold: true }, `⚠  No ${itemLabel} sections found`),
      h(Text, { dimColor: true }, `File was generated but no sections were detected.`),
      h(Text, { dimColor: true }, "  [Enter] Continue"),
    );
  }

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    // Title bar
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { bold: true }, typeLabel),
    ),
    // Item header
    h(
      Box,
      { flexDirection: "row" },
      h(Text, { bold: true, color: "yellow" },
        ` ${itemLabel} ${currentIdx + 1} / ${total} — ${item.id}: ${item.title}`),
    ),
    // Scope-constraint warning (Typ-B-ADRs only)
    hasConstraint
      ? h(
          Box,
          { flexDirection: "column", paddingLeft: 1 },
          h(Text, { color: "yellow", bold: true },
            `⚠  Scope constraint — affects: ${constraints.join(", ")}`),
          h(Text, { color: "yellow" },
            "   This ADR changes the product scope. Check the affected PRD requirement."),
        )
      : null,
    h(Text, { dimColor: true }, divider),
    // Scrollable content
    h(
      Box,
      { flexDirection: "column" },
      ...visibleLines.map((line, i) =>
        h(Text, { key: String(i), wrap: "truncate" }, line || " ")
      ),
    ),
    h(Text, { dimColor: true }, divider),
    // Footer
    inputMode === "rewriting"
      ? h(Text, { color: "yellow" }, `  ⟳  Opus is rewriting ${item.id}…`)
      : inputMode === "typing"
      ? h(
          Box,
          { flexDirection: "column" },
          h(
            Box,
            { flexDirection: "row" },
            h(Text, { color: "cyan" }, "  ⟩ "),
            h(Text, {}, typedInput.slice(0, typingCursorPos)),
            h(Text, { inverse: true }, typedInput[typingCursorPos] ?? " "),
            h(Text, {}, typedInput.slice(typingCursorPos + 1)),
          ),
          h(Text, { dimColor: true }, "  [Enter] Send  [Esc] Cancel  [←/→] Cursor"),
        )
      : h(
          Box,
          { flexDirection: "row", gap: 2 },
          h(Text, { dimColor: true }, "  [Enter] Next  [e] Edit  [r] Opus-Rewrite"),
          maxScroll > 0
            ? h(Text, { dimColor: true },
                `  ↑/↓ scroll (${scrollOffset + 1}–${Math.min(scrollOffset + viewportH, allLines.length)} / ${allLines.length})`)
            : null,
        ),
  );
}

// ── RunnerDashboard ────────────────────────────────────────────
// Shared dashboard layout for InitRunner and EduRunner.
// Owns: timer effects, layout computation, done/error screens,
//       split-pane layout with phases + live output.

export interface RunnerDashboardProps {
  // State
  phases: PhaseState[];
  liveLines: string[];
  agentStreams: string[];
  activeLabel: string;
  agentWarnLevel: null | "yellow" | "red";
  done: boolean;
  error: string | null;
  // Config
  subtitle: string;
  descLabel: string;
  descText: string;
  model: string;
  doneMessage: string;
  // Callbacks
  onDone?: () => void;
  // Optional slots
  emptyStateLines?: string[];
  footer?: React.ReactElement | null;
}

export function RunnerDashboard(props: RunnerDashboardProps): React.ReactElement {
  const {
    phases, liveLines, agentStreams, activeLabel, agentWarnLevel,
    done, error, subtitle, descLabel, descText, model, doneMessage,
    onDone, emptyStateLines = [], footer = null,
  } = props;

  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const leftWidth = Math.min(32, Math.max(22, Math.floor(columns * 0.35)));
  const rightWidth = columns - leftWidth - 1;
  const liveHeight = Math.max(5, rows - 8);

  const hasAgentStreams = agentStreams.length > 0;
  const runningPhase = phases.find((p) => p.status === "running");
  const runningRound = runningPhase?.rounds.find((r) => r.status === "running");
  const streamAgents = runningRound?.agents ?? [];

  const agentSectionHeight = hasAgentStreams ? streamAgents.length + 1 : 0;
  const summaryHeight = Math.max(0, liveHeight - agentSectionHeight);
  const visibleLines = liveLines.slice(-summaryHeight);

  const divider = "─".repeat(Math.min(columns, 60));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setElapsed(0);
    if (!activeLabel) return;
    const id = setInterval(() => setElapsed((s: number) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activeLabel]);

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => onDone ? onDone() : exit(), 400);
      return () => clearTimeout(t);
    }
  }, [done]);

  if (done) {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { bold: true, color: "green" }, doneMessage),
      h(Text, { dimColor: true }, "Saving files…"),
    );
  }

  if (error) {
    // Strip "Error: " prefix added by String(e) on Error objects
    const errMsg = error.replace(/^Error:\s*/, "");
    const lower = errMsg.toLowerCase();

    let errTitle = "Fehler";
    let errHint: string | null = null;
    if (lower.includes("expired") || lower.includes("oauth") || lower.includes("authenticat")) {
      errTitle = "Fehler — Authentifizierung";
      errHint = "claude /login  →  dann orvex neu starten";
    } else if (lower.includes("timed out") || lower.includes("timeout")) {
      errTitle = "Fehler — Timeout";
      errHint = "orvex neu starten — der Prozess setzt fort wo er aufgehört hat";
    } else if (lower.includes("rate limit") || lower.includes("overloaded")) {
      errTitle = "Fehler — Rate Limit";
      errHint = "Kurz warten, dann orvex neu starten";
    }

    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { color: "red", bold: true }, `⚠  ${errTitle}`),
      h(Text, {}, ""),
      h(Text, { wrap: "wrap" }, errMsg),
      errHint
        ? h(Box, { flexDirection: "column", marginTop: 1 },
            h(Text, { dimColor: true }, "─".repeat(Math.min(columns, 50))),
            h(Text, { color: "yellow" }, `→  ${errHint}`),
          )
        : null,
      liveLines.length > 0
        ? h(
            Box,
            { flexDirection: "column", marginTop: 1 },
            h(Text, { dimColor: true }, "Last output:"),
            ...liveLines.map((line, i) =>
              h(Text, { key: String(i), dimColor: true, wrap: "truncate" }, line)
            ),
          )
        : null,
    );
  }

  const descPreview = descText.length > columns - 20
    ? descText.slice(0, columns - 23) + "…"
    : descText;

  const leftBarWidth = Math.max(4, leftWidth - 8);
  const splitDivider = "─".repeat(leftWidth) + "┬" + "─".repeat(rightWidth);
  const splitFooter = "─".repeat(leftWidth) + "┴" + "─".repeat(rightWidth);

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, subtitle),
    ),
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { paddingLeft: 1, marginBottom: 0 },
      h(Text, { dimColor: true }, descLabel),
      h(Text, {}, descPreview),
    ),
    h(Text, { dimColor: true }, splitDivider),
    h(
      Box,
      { flexDirection: "row" },
      h(
        Box,
        { flexDirection: "column", width: leftWidth },
        ...phases.map((phase) =>
          h(PhaseBlockCompact, { key: phase.id, phase, barWidth: leftBarWidth, now, model })
        ),
      ),
      h(Text, { dimColor: true }, "│"),
      h(
        Box,
        { flexDirection: "column", width: rightWidth, paddingLeft: 1 },
        activeLabel
          ? h(
              Box,
              { flexDirection: "row", gap: 1 },
              h(Text, { color: "yellow", bold: true }, activeLabel),
              h(Text, { dimColor: true }, `(${elapsed}s)`),
            )
          : null,
        activeLabel
          ? h(Text, { dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2)))
          : null,
        agentWarnLevel === "yellow"
          ? h(Text, { color: "yellow" }, "⚠  Taking longer than usual — Claude is still thinking…")
          : agentWarnLevel === "red"
          ? h(Text, { color: "red", bold: true }, "⚠  Very long wait — Claude may have an issue, but a result can still arrive. [Ctrl+C] to cancel.")
          : null,
        ...(() => {
          const result: React.ReactElement[] = [];

          if (visibleLines.length > 0) {
            visibleLines.forEach((line, i) =>
              result.push(h(Text, { key: `l${i}`, wrap: "truncate" }, line))
            );
          } else if (emptyStateLines.length > 0 && !hasAgentStreams && runningPhase && activeLabel) {
            emptyStateLines.forEach((line, i) =>
              result.push(h(Text, { key: `i${i}`, dimColor: true, wrap: "truncate" }, line))
            );
          }

          if (hasAgentStreams && streamAgents.length > 0) {
            if (result.length > 0) {
              result.push(h(Text, { key: "sdiv", dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2))));
            }
            streamAgents.forEach((agent, i) => {
              const stream = agentStreams[i] ?? "";
              const maxTextWidth = rightWidth - agent.name.length - 6;
              result.push(
                h(Box, { key: `ag${i}`, flexDirection: "row", gap: 1 },
                  h(Text, { color: agent.status === "done" ? "green" : "yellow" },
                    agent.status === "done" ? "✓" : "▶"),
                  h(Text, { bold: agent.status === "running" }, agent.name),
                  h(Text, { dimColor: true, wrap: "truncate" },
                    stream ? `  ${stream.slice(0, maxTextWidth)}` : "  …"),
                )
              );
            });
          }

          return result;
        })(),
      ),
    ),
    h(Text, { dimColor: true }, splitFooter),
    footer,
  );
}

// ── InitRunner ─────────────────────────────────────────────────

function InitRunner(props: {
  description: string;
  model: string;
  prdRounds: number;
  archRounds: number;
  appType?: string;
  skipPrd?: boolean;
  onDone?: () => void;
}): React.ReactElement {
  const { description, model, prdRounds, archRounds, appType = "web", skipPrd = false, onDone } = props;
  const rawWasBackspace = useRawBackspace();
  const state = useInitRunner(description, prdRounds, archRounds, model, skipPrd, appType);

  useInput((input, key) => {
    // PRD review — editor open: ReviewEditor handles its own input
    if (state.prdReview?.editorOpen) return;

    // PRD synth done transition
    if (state.prdSynthDone) {
      if (key.return || input === "j" || input === "y") state.confirmPrdSynthDone();
      else if (state.prdSynthDone.existing && (key.escape || input === "n")) state.skipPrdReview();
      return;
    }

    // PRD review
    if (state.prdReview) {
      if (state.prdReview.inputMode === "none") {
        if (key.return) { state.advancePrdReview(); return; }
        if (input === "e") { state.openPrdReviewEditor(); return; }
        if (input === "r") { state.startPrdReviewTyping(); return; }
      } else if (state.prdReview.inputMode === "typing") {
        if (key.return) { state.submitPrdReviewRewrite(state.prdReview.typedInput); return; }
        const fixedKey = { ...key, backspace: key.backspace || (key.delete && rawWasBackspace.current) };
        state.onPrdReviewType(input, fixedKey);
      }
      return;
    }

    // Arch generation confirm
    if (state.awaitingArchConfirm) {
      // In archOnly mode ArchSetup handles its own input — don't intercept here
      if (!skipPrd) {
        if (key.return || input === "j" || input === "y") state.startArch();
        else if (key.escape || input === "n") state.skipArch();
      }
      return;
    }

    // Arch review — editor open: ReviewEditor handles its own input
    if (state.archReview?.editorOpen) return;

    // Arch synth done transition
    if (state.archSynthDone) {
      if (key.return || input === "j" || input === "y") state.confirmArchSynthDone();
      else if (key.escape || input === "n") state.skipArchSynthDone();
      return;
    }

    // Arch review
    if (state.archReview) {
      if (state.archReview.inputMode === "none") {
        if (key.return) { state.advanceArchReview(); return; }
        if (input === "e") { state.openArchReviewEditor(); return; }
        if (input === "r") { state.startArchReviewTyping(); return; }
      } else if (state.archReview.inputMode === "typing") {
        if (key.return) { state.submitArchReviewRewrite(state.archReview.typedInput); return; }
        const fixedKey = { ...key, backspace: key.backspace || (key.delete && rawWasBackspace.current) };
        state.onArchReviewType(input, fixedKey);
      }
      return;
    }
  });

  // ── Early-return screens ───────────────────────────────────

  // archOnly: show ArchSetup as a full-screen at awaitingArchConfirm
  // (after PRD review, before arch generation)
  if (state.awaitingArchConfirm && skipPrd) {
    return h(ArchSetup, {
      prdTitle: description,
      onStart: (cfg: InitConfig) =>
        state.startArchWithConfig(cfg.model, cfg.archRounds, cfg.archNote ?? ""),
      onSkip: state.skipArch,
    });
  }

  // PRD synth done transition
  if (state.prdSynthDone) {
    return h(SynthDoneUI, { type: "prd", state: state.prdSynthDone });
  }

  // PRD review editor
  if (state.prdReview?.editorOpen) {
    const item = state.prdReview.items[state.prdReview.currentIdx];
    if (item) {
      return h(ReviewEditor, {
        title: item.id,
        initialContent: item.content,
        onSave: state.saveReviewEdit,
        onCancel: state.cancelReviewEdit,
      });
    }
  }

  // PRD review
  if (state.prdReview) {
    return h(ReviewUI, { review: state.prdReview, type: "prd" });
  }

  // Arch synth done transition (scrollable arch content)
  if (state.archSynthDone) {
    return h(SynthDoneUI, { type: "arch", state: state.archSynthDone });
  }

  // Arch review editor
  if (state.archReview?.editorOpen) {
    const item = state.archReview.items[state.archReview.currentIdx];
    if (item) {
      return h(ReviewEditor, {
        title: item.id,
        initialContent: item.content,
        onSave: state.saveReviewEdit,
        onCancel: state.cancelReviewEdit,
      });
    }
  }

  // Arch review
  if (state.archReview) {
    return h(ReviewUI, { review: state.archReview, type: "arch" });
  }

  // ── Normal dashboard ───────────────────────────────────────

  const runningPhase = state.phases.find((p) => p.status === "running");
  const emptyStateLines: string[] = (!state.agentStreams.length && runningPhase && state.activeLabel)
    ? (runningPhase.id === "prd"
        ? [
            "Product Manager, UX Researcher and Business Analyst",
            "are forming their initial takes on the topic.",
            "",
            `Over ${prdRounds} discussion rounds they refine their`,
            "positions and respond to each other.",
            "The synthesis is saved as PRD.md.",
          ]
        : [
            "Software Architect, Senior Developer and DevOps Engineer",
            "analyze the PRD and propose an architecture.",
            "",
            `Over ${archRounds} discussion rounds they develop`,
            "architecture decisions together.",
            "The synthesis is saved as architecture.md.",
          ])
    : [];

  const footer = state.awaitingArchConfirm
    ? h(
        Box,
        { flexDirection: "column", marginTop: 0 },
        h(Text, { bold: true, color: "green" }, "  ✓  PRD.md done"),
        h(Text, {}, "  Also generate a software architecture?"),
        h(Text, { dimColor: true },
          "  [Enter / y]  Yes, generate architecture    [Esc / n]  Skip"),
      )
    : null;

  return h(RunnerDashboard, {
    phases: state.phases,
    liveLines: state.liveLines,
    agentStreams: state.agentStreams,
    activeLabel: state.activeLabel,
    agentWarnLevel: state.agentWarnLevel,
    done: state.done,
    error: state.error,
    subtitle: "Project Setup",
    descLabel: "Description: ",
    descText: description,
    model,
    doneMessage: "✓  Setup complete",
    onDone,
    emptyStateLines,
    footer,
  });
}

// ── InitDashboard ──────────────────────────────────────────────

export function InitDashboard(props: {
  description: string;
  archOnly?: boolean;
  skipSetup?: boolean; // true when launched by an agent with explicit description
  onDone?: () => void;
}): React.ReactElement {
  const { description: initialDescription, archOnly = false, skipSetup = false, onDone } = props;

  // archOnly: start InitRunner immediately (PRD review inside), ArchSetup appears
  // at awaitingArchConfirm step inside InitRunner.
  // skipSetup: agent provided explicit description — also skip setup.
  const [config, setConfig] = useState<InitConfig | null>(
    (skipSetup || archOnly)
      ? {
          description: initialDescription,
          model: Deno.env.get("ORVEX_INIT_MODEL") ?? "claude-opus-4-6",
          prdRounds: Number(Deno.env.get("ORVEX_INIT_ROUNDS") ?? "3"),
          archRounds: Number(Deno.env.get("ORVEX_INIT_ROUNDS") ?? "3"),
        }
      : null
  );

  if (!config) return h(InitSetup, { onStart: setConfig });

  return h(InitRunner, {
    description: config.description,
    model: config.model,
    prdRounds: config.prdRounds,
    archRounds: config.archRounds,
    appType: config.appType,
    skipPrd: archOnly,
    onDone,
  });
}
