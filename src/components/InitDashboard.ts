import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useInitRunner } from "../hooks/useInitRunner.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { InitSetup, type InitConfig } from "./InitSetup.ts";
import type { PhaseState, RoundStatus, AgentStatus, PhaseStatus } from "../types.ts";
import { SYNTH_MODEL } from "../lib/initAgents.ts";

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

const ROUND_SECS = 120;    // 2 min pro Diskussionsrunde
const SYNTH_SECS = 720;    // 12 min für Synthese (vollständiges Dokument)

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
  const discussionRounds = totalRounds - 1; // ohne Synthese
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
    // Springt auf tatsächlichen Fortschritt, wenn schneller als Schätzung
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
    // Phase header
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
    // Time-based progress bar
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
    // Round list: compact icon-only agent status
    h(
      Box,
      { flexDirection: "column", paddingLeft: 3 },
      ...phase.rounds.map((round, idx) => {
        const isSynthesis = idx === phase.rounds.length - 1;
        const label = isSynthesis ? SYNTH_LABEL : roundModelLabel;
        return h(
          Box,
          { key: String(idx), flexDirection: "row", gap: 1 },
          h(Text, { color: ROUND_COLORS[round.status] },
            ROUND_ICONS[round.status]),
          h(Text, { dimColor: round.status === "pending" },
            round.label),
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
  const state = useInitRunner(description, prdRounds, archRounds, model, skipPrd);
  const [elapsed, setElapsed] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  const leftWidth = Math.min(32, Math.max(22, Math.floor(columns * 0.35)));
  const rightWidth = columns - leftWidth - 1;
  const liveHeight = Math.max(5, rows - 8);
  const visibleLines = state.liveLines.slice(-liveHeight);

  const divider = "─".repeat(Math.min(columns, 60));

  // Now-Ticker für zeitbasierte Fortschrittsbalken
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Elapsed-Timer: reset bei jedem Label-Wechsel
  useEffect(() => {
    setElapsed(0);
    if (!state.activeLabel) return;
    const id = setInterval(() => setElapsed((s: number) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state.activeLabel]);

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

  const descPreview = description.length > columns - 20
    ? description.slice(0, columns - 23) + "…"
    : description;

  const leftBarWidth = Math.max(4, leftWidth - 8);
  const splitDivider = "─".repeat(leftWidth) + "┬" + "─".repeat(rightWidth);
  const splitFooter = "─".repeat(leftWidth) + "┴" + "─".repeat(rightWidth);

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
      { paddingLeft: 1, marginBottom: 0 },
      h(Text, { dimColor: true }, "Beschreibung: "),
      h(Text, {}, descPreview),
    ),
    h(Text, { dimColor: true }, splitDivider),
    // Split layout
    h(
      Box,
      { flexDirection: "row" },
      // Left: phase list
      h(
        Box,
        { flexDirection: "column", width: leftWidth },
        ...state.phases.map((phase) =>
          h(PhaseBlockCompact, { key: phase.id, phase, barWidth: leftBarWidth, now, model })
        ),
      ),
      // Divider
      h(Text, { dimColor: true }, "│"),
      // Right: live output
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
          if (visibleLines.length > 0) {
            return visibleLines.map((line, i) =>
              h(Text, { key: String(i), wrap: "truncate" }, line)
            );
          }
          const runningPhase = state.phases.find((p) => p.status === "running");
          if (!runningPhase || !state.activeLabel) return [];
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
          return intro.map((line, i) =>
            h(Text, { key: String(i), dimColor: true, wrap: "truncate" }, line)
          );
        })(),
      ),
    ),
    h(Text, { dimColor: true }, splitFooter),
    // Arch confirmation prompt
    state.awaitingArchConfirm
      ? h(
          Box,
          { flexDirection: "column", marginTop: 0 },
          h(Text, { bold: true, color: "green" }, "  ✓  PRD.md fertig"),
          h(Text, {},
            "  Auch Software-Architektur diskutieren lassen?"),
          h(Text, { dimColor: true },
            "  [Enter / j]  Ja, Architektur generieren    [Esc / n]  Überspringen"),
        )
      : null,
  );
}

export function InitDashboard(props: { description: string; archOnly?: boolean }): React.ReactElement {
  const { description: initialDescription, archOnly = false } = props;
  const [config, setConfig] = useState<InitConfig | null>(
    initialDescription || archOnly
      ? { description: initialDescription, model: "claude-opus-4-6", prdRounds: 3, archRounds: 3 }
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
