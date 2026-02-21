import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useInitRunner } from "../hooks/useInitRunner.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import type { PhaseState, RoundStatus, AgentStatus, PhaseStatus } from "../hooks/useInitRunner.ts";

const { createElement: h, useEffect } = React;

function ProgressBar(props: {
  filled: number;
  total: number;
  width: number;
  color: string;
}): React.ReactElement {
  const { filled, total, width, color } = props;
  const f = total > 0 ? Math.round((filled / total) * width) : 0;
  return h(Text, { color }, "█".repeat(f) + "░".repeat(Math.max(0, width - f)));
}

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

function PhaseBlock(props: {
  phase: PhaseState;
  barWidth: number;
}): React.ReactElement {
  const { phase, barWidth } = props;
  const doneRounds = phase.rounds.filter((r) => r.status === "done").length;
  const totalRounds = phase.rounds.length;

  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // Phase header
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: PHASE_COLORS[phase.status] },
        phase.status === "done" ? `✓  ${phase.label}` :
        phase.status === "running" ? `▶  ${phase.label}` :
        `○  ${phase.label}`),
      phase.status === "pending"
        ? h(Text, { dimColor: true }, "(wartet)")
        : null,
    ),
    // Progress bar
    h(
      Box,
      { flexDirection: "row", gap: 1, paddingLeft: 3 },
      h(ProgressBar, {
        filled: doneRounds,
        total: totalRounds,
        width: barWidth,
        color: PHASE_COLORS[phase.status],
      }),
      h(Text, { dimColor: true }, ` ${doneRounds}/${totalRounds} Runden`),
    ),
    // Round list
    h(
      Box,
      { flexDirection: "column", paddingLeft: 3 },
      ...phase.rounds.map((round, idx) =>
        h(
          Box,
          { key: String(idx), flexDirection: "row", gap: 1 },
          // Round status icon + label
          h(Text, { color: ROUND_COLORS[round.status] },
            ROUND_ICONS[round.status]),
          h(Text, { dimColor: round.status === "pending" },
            round.label),
          h(Text, { dimColor: true }, " ·"),
          // Per-agent status
          ...round.agents.map((agent, ai) =>
            h(
              Box,
              { key: String(ai), flexDirection: "row", gap: 0 },
              h(Text, { color: AGENT_COLORS[agent.status] },
                ` ${AGENT_ICONS[agent.status]} `),
              h(Text, { dimColor: agent.status === "pending", color: agent.status === "running" ? "yellow" : undefined },
                agent.name),
              ai < round.agents.length - 1
                ? h(Text, { dimColor: true }, "  ·")
                : null,
            )
          ),
        )
      ),
    ),
  );
}

export function InitDashboard(props: {
  description: string;
}): React.ReactElement {
  const { description } = props;
  const { exit } = useApp();
  const { columns } = useTerminalSize();
  const state = useInitRunner(description);

  const barWidth = Math.max(10, Math.floor(columns / 3));
  const divider = "─".repeat(Math.min(columns, 60));

  // Exit when done
  useEffect(() => {
    if (state.done) {
      const t = setTimeout(() => exit(), 400);
      return () => clearTimeout(t);
    }
  }, [state.done]);

  useInput((input, key) => {
    if (state.awaitingArchConfirm) {
      if (key.return || input === "j" || input === "y") {
        state.startArch();
      } else if (key.escape || input === "n") {
        state.skipArch();
      }
    }
  });

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
    );
  }

  const descPreview = description.length > columns - 20
    ? description.slice(0, columns - 23) + "…"
    : description;

  return h(
    Box,
    { flexDirection: "column" },
    // Header
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
      { paddingLeft: 1, marginBottom: 1 },
      h(Text, { dimColor: true }, `Beschreibung: `),
      h(Text, {}, descPreview),
    ),
    // Phase blocks
    ...state.phases.map((phase) =>
      h(PhaseBlock, { key: phase.id, phase, barWidth })
    ),
    h(Text, { dimColor: true }, divider),
    // Live output
    state.activeLabel
      ? h(Text, { color: "yellow", dimColor: true }, `  ${state.activeLabel}`)
      : null,
    state.liveLines.length > 0
      ? h(
          Box,
          { flexDirection: "column", paddingLeft: 2 },
          ...state.liveLines.map((line, i) =>
            h(Text, { key: String(i), dimColor: true, wrap: "truncate" }, line)
          ),
        )
      : null,
    // Arch confirmation prompt
    state.awaitingArchConfirm
      ? h(
          Box,
          { flexDirection: "column", marginTop: 1 },
          h(Text, { dimColor: true }, divider),
          h(Text, { bold: true, color: "green" }, "  ✓  PRD.md fertig"),
          h(Text, {},
            "  Auch Software-Architektur diskutieren lassen?"),
          h(Text, { dimColor: true },
            "  [Enter / j]  Ja, Architektur generieren    [Esc / n]  Überspringen"),
        )
      : null,
  );
}
