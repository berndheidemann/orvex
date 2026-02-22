import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useInitRunner } from "../hooks/useInitRunner.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { useRawBackspace } from "../hooks/useRawBackspace.ts";
import { InitSetup, type InitConfig } from "./InitSetup.ts";
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

const PHASE_COLORS: Record<PhaseStatus, string> = {
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

const ROUND_SECS = 120;
const SYNTH_SECS = 720;

// ── PhaseBlockCompact ──────────────────────────────────────────

function PhaseBlockCompact(props: {
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
        ? h(Text, { dimColor: true }, "(wartet)")
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

function SynthDoneUI(props: {
  type: "prd" | "arch";
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
      ? `○  PRD.md gefunden — ${state.items.length} Requirements`
      : `✓  PRD.md erstellt — ${state.items.length} Requirements gefunden`;
    const introLines = state.existing
      ? [
          "Möchtest du die Requirements einzeln reviewen,",
          "oder direkt zur Architektur-Erstellung weitergehen?",
        ]
      : [
          "Das Review gibt dir die Möglichkeit, jedes Requirement",
          "einzeln zu prüfen, anzupassen oder von Opus umschreiben",
          "zu lassen. Änderungen werden direkt in PRD.md gespeichert.",
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
    ? (state.existing ? "PRD.md — Review" : "PRD.md erstellt")
    : "architecture.md erstellt";

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Kinema"),
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
            `  ↑/↓ scrollen  (${scrollOffset + 1}–${Math.min(scrollOffset + viewportH, lines.length)} / ${lines.length})`)
        : null,
    ),
    type === "prd"
      ? (state.existing
          ? h(Text, { dimColor: true }, "  [Enter / j] Review starten    [Esc / n] Überspringen → direkt zur Architektur")
          : h(Text, { dimColor: true }, "  [Enter] Review starten"))
      : h(Text, { dimColor: true }, "  [Enter / j] Review starten    [Esc / n] Überspringen"),
  );
}

// ── ReviewUI ───────────────────────────────────────────────────
// Scrollable, self-contained. Handles ↑/↓ for scroll internally.

function ReviewUI(props: {
  review: ReviewState;
  type: "prd" | "arch";
}): React.ReactElement {
  const { review, type } = props;
  const { columns, rows } = useTerminalSize();
  const [scrollOffset, setScrollOffset] = useState(0);

  const { items, currentIdx, inputMode, typedInput } = review;
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
  const typeLabel = type === "prd" ? "PRD Review" : "Architektur Review";
  const itemLabel = type === "prd" ? "REQ" : "ADR";

  if (!item) return h(Box, {}, h(Text, {}, ""));

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    // Title bar
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Kinema"),
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
            `⚠  Scope-Einschränkung — betrifft: ${constraints.join(", ")}`),
          h(Text, { color: "yellow" },
            "   Dieses ADR verändert den Produkt-Scope. PRD-Requirement prüfen."),
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
      ? h(Text, { color: "yellow" }, `  ⟳  Opus überarbeitet ${item.id}…`)
      : inputMode === "typing"
      ? h(
          Box,
          { flexDirection: "column" },
          h(
            Box,
            { flexDirection: "row" },
            h(Text, { color: "cyan" }, "  ⟩ "),
            h(Text, {}, typedInput),
            h(Text, { inverse: true }, " "),
          ),
          h(Text, { dimColor: true }, "  [Enter] Senden  [Esc] Abbrechen"),
        )
      : h(
          Box,
          { flexDirection: "row", gap: 2 },
          h(Text, { dimColor: true }, "  [Enter] Weiter  [e] Bearbeiten  [r] Opus-Rewrite"),
          maxScroll > 0
            ? h(Text, { dimColor: true },
                `  ↑/↓ scrollen (${scrollOffset + 1}–${Math.min(scrollOffset + viewportH, allLines.length)} / ${allLines.length})`)
            : null,
        ),
  );
}

// ── InitRunner ─────────────────────────────────────────────────

function InitRunner(props: {
  description: string;
  model: string;
  prdRounds: number;
  archRounds: number;
  skipPrd?: boolean;
}): React.ReactElement {
  const { description, model, prdRounds, archRounds, skipPrd = false } = props;
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const rawWasBackspace = useRawBackspace();
  const state = useInitRunner(description, prdRounds, archRounds, model, skipPrd);
  const [elapsed, setElapsed] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  const leftWidth = Math.min(32, Math.max(22, Math.floor(columns * 0.35)));
  const rightWidth = columns - leftWidth - 1;
  const liveHeight = Math.max(5, rows - 8);

  const hasAgentStreams = state.agentStreams.length > 0;
  const runningPhase = state.phases.find((p) => p.status === "running");
  const runningRound = runningPhase?.rounds.find((r) => r.status === "running");
  const streamAgents = runningRound?.agents ?? [];

  const agentSectionHeight = hasAgentStreams ? streamAgents.length + 1 : 0;
  const summaryHeight = Math.max(0, liveHeight - agentSectionHeight);
  const visibleLines = state.liveLines.slice(-summaryHeight);

  const divider = "─".repeat(Math.min(columns, 60));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setElapsed(0);
    if (!state.activeLabel) return;
    const id = setInterval(() => setElapsed((s: number) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state.activeLabel]);

  useEffect(() => {
    if (state.done) {
      const t = setTimeout(() => exit(), 400);
      return () => clearTimeout(t);
    }
  }, [state.done]);

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
      if (key.return || input === "j" || input === "y") state.startArch();
      else if (key.escape || input === "n") state.skipArch();
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

  if (state.done) {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { bold: true, color: "green" }, "✓  Setup abgeschlossen"),
      h(Text, { dimColor: true }, "Dateien werden gespeichert…"),
    );
  }

  if (state.error) {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { color: "red", bold: true }, "⚠  Fehler"),
      h(Text, {}, state.error),
      state.liveLines.length > 0
        ? h(
            Box,
            { flexDirection: "column", marginTop: 1 },
            h(Text, { dimColor: true }, "Letzte Ausgabe:"),
            ...state.liveLines.map((line, i) =>
              h(Text, { key: String(i), dimColor: true, wrap: "truncate" }, line)
            ),
          )
        : null,
    );
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

  const descPreview = description.length > columns - 20
    ? description.slice(0, columns - 23) + "…"
    : description;

  const leftBarWidth = Math.max(4, leftWidth - 8);
  const splitDivider = "─".repeat(leftWidth) + "┬" + "─".repeat(rightWidth);
  const splitFooter = "─".repeat(leftWidth) + "┴" + "─".repeat(rightWidth);

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Kinema"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Projekt-Setup"),
    ),
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { paddingLeft: 1, marginBottom: 0 },
      h(Text, { dimColor: true }, "Beschreibung: "),
      h(Text, {}, descPreview),
    ),
    h(Text, { dimColor: true }, splitDivider),
    h(
      Box,
      { flexDirection: "row" },
      h(
        Box,
        { flexDirection: "column", width: leftWidth },
        ...state.phases.map((phase) =>
          h(PhaseBlockCompact, { key: phase.id, phase, barWidth: leftBarWidth, now, model })
        ),
      ),
      h(Text, { dimColor: true }, "│"),
      h(
        Box,
        { flexDirection: "column", width: rightWidth, paddingLeft: 1 },
        state.activeLabel
          ? h(
              Box,
              { flexDirection: "row", gap: 1 },
              h(Text, { color: "yellow", bold: true }, state.activeLabel),
              h(Text, { dimColor: true }, `(${elapsed}s)`),
            )
          : null,
        state.activeLabel
          ? h(Text, { dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2)))
          : null,
        ...(() => {
          const result: React.ReactElement[] = [];

          if (visibleLines.length > 0) {
            visibleLines.forEach((line, i) =>
              result.push(h(Text, { key: `l${i}`, wrap: "truncate" }, line))
            );
          } else if (!hasAgentStreams && runningPhase && state.activeLabel) {
            const intro = runningPhase.id === "prd"
              ? [
                  "Product Manager, UX Researcher und Business Analyst",
                  "erarbeiten ihre erste Einschätzung zum Thema.",
                  "",
                  `In ${prdRounds} Diskussionsrunden verfeinern sie ihre`,
                  "Positionen und reagieren aufeinander.",
                  "Die Synthese wird als PRD.md gespeichert.",
                ]
              : [
                  "Software-Architekt, Senior Developer und DevOps Engineer",
                  "analysieren die PRD und schlagen eine Architektur vor.",
                  "",
                  `In ${archRounds} Diskussionsrunden entwickeln sie`,
                  "gemeinsam Architekturentscheidungen.",
                  "Die Synthese wird als architecture.md gespeichert.",
                ];
            intro.forEach((line, i) =>
              result.push(h(Text, { key: `i${i}`, dimColor: true, wrap: "truncate" }, line))
            );
          }

          if (hasAgentStreams && streamAgents.length > 0) {
            if (result.length > 0) {
              result.push(h(Text, { key: "sdiv", dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2))));
            }
            streamAgents.forEach((agent, i) => {
              const stream = state.agentStreams[i] ?? "";
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
    state.awaitingArchConfirm
      ? h(
          Box,
          { flexDirection: "column", marginTop: 0 },
          h(Text, { bold: true, color: "green" }, "  ✓  PRD.md fertig"),
          h(Text, {}, "  Auch Software-Architektur diskutieren lassen?"),
          h(Text, { dimColor: true },
            "  [Enter / j]  Ja, Architektur generieren    [Esc / n]  Überspringen"),
        )
      : null,
  );
}

// ── InitDashboard ──────────────────────────────────────────────

export function InitDashboard(props: { description: string; archOnly?: boolean }): React.ReactElement {
  const { description: initialDescription, archOnly = false } = props;
  const [config, setConfig] = useState<InitConfig | null>(
    initialDescription || archOnly
      ? {
          description: initialDescription,
          model: Deno.env.get("KINEMA_INIT_MODEL") ?? "claude-opus-4-6",
          prdRounds: Number(Deno.env.get("KINEMA_INIT_ROUNDS") ?? "3"),
          archRounds: Number(Deno.env.get("KINEMA_INIT_ROUNDS") ?? "3"),
        }
      : null
  );
  if (!config) return h(InitSetup, { onStart: setConfig });
  return h(InitRunner, {
    description: config.description,
    model: config.model,
    prdRounds: config.prdRounds,
    archRounds: config.archRounds,
    skipPrd: archOnly,
  });
}
