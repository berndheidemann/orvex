import React from "react";
import { Box, Text } from "ink";
import { useStatusPoller } from "../hooks/useStatusPoller.ts";
import { useElapsedTime } from "../hooks/useElapsedTime.ts";
import { useIterationsReader } from "../hooks/useIterationsReader.ts";
import { useKeyboardControls } from "../hooks/useKeyboardControls.ts";
import { useEventsReader } from "../hooks/useEventsReader.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { usePrdTitles } from "../hooks/usePrdTitles.ts";
import { ContextEditor } from "./ContextEditor.ts";
import { ProgressBar } from "./ProgressBar.ts";
import { STATUS_COLORS } from "../types.ts";
import type { IterationEntry } from "../types.ts";
import type { LoopPhaseEvent, ToolCall } from "../events.ts";

const { createElement: h } = React;

const MAX_BLOCKED_ENTRIES = 3;
const MAX_FEED_ENTRIES = 20;
const FEED_SUMMARY_MAX_LEN = 60;
const REQ_TITLE_MAX_LEN = 30;
const BAR_WIDTH_DIVISOR = 3;
const BAR_WIDTH_MIN = 10;

// Color map for tool categories
const CATEGORY_COLORS: Record<string, string> = {
  read: "blue",
  write: "red",
  bash: "yellow",
  task: "magenta",
  playwright: "cyan",
  mcp: "gray",
};

const PHASE_LABELS: Record<string, string> = {
  preflight:       "preflight",
  implementing:    "implementing",
  validating:      "validating",
  post_processing: "post-processing",
};

// Phases map to step 1–3 (implementing and validating are both step 2)
const PHASE_STEPS: Record<string, number> = {
  preflight:       1,
  implementing:    2,
  validating:      2,
  post_processing: 3,
};
const PHASE_TOTAL = 3;

function formatTimestamp(ts: string): string {
  return ts.replace("T", " ").replace(/\+.*$/, "").replace(/Z$/, "");
}

function BlockedDetail(props: {
  reqId: string;
  notes: string | undefined;
  allEntries: IterationEntry[];
  available: boolean;
}): React.ReactElement {
  const { reqId, notes, allEntries, available } = props;

  if (!available) {
    return h(
      Box,
      { paddingLeft: 4 },
      h(Text, { dimColor: true }, "Keine Verlaufsdaten verfügbar"),
    );
  }

  const matching = allEntries.filter((e) =>
    e.req_hint.startsWith(reqId)
  );

  if (matching.length === 0) {
    return h(
      Box,
      { paddingLeft: 4 },
      h(Text, { dimColor: true }, "Keine Verlaufsdaten verfügbar"),
    );
  }

  const shown = matching.slice(-MAX_BLOCKED_ENTRIES);

  return h(
    Box,
    { flexDirection: "column" },
    ...shown.map((entry) =>
      h(
        Box,
        { key: String(entry.iteration), paddingLeft: 4 },
        h(
          Text,
          { color: "red" },
          `iter-${entry.iteration}  ${formatTimestamp(entry.timestamp)}  ${notes ?? "—"}`,
        ),
      )
    ),
  );
}

function ActivityFeed(props: {
  toolEvents: ToolCall[];
  currentIter: number;
  currentReq: string | null;
  model: string;
}): React.ReactElement {
  const { toolEvents, currentIter, currentReq, model } = props;
  const shown = toolEvents.slice(-MAX_FEED_ENTRIES);

  return h(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    // Header row
    currentIter > 0
      ? h(
          Text,
          { bold: true, color: "cyan" },
          `▶ Iter ${currentIter}${currentReq ? ` · ${currentReq}` : ""}${model ? ` · ${model}` : ""}`,
        )
      : h(Text, { dimColor: true }, "(waiting for first iteration…)"),
    // Tool-call feed
    shown.length === 0
      ? h(Text, { dimColor: true }, "(no tool calls yet)")
      : h(
          Box,
          { flexDirection: "column" },
          ...shown.map((ev, idx) =>
            h(
              Box,
              { key: String(idx) },
              h(
                Text,
                { color: CATEGORY_COLORS[ev.category] ?? "white" },
                `[${ev.category}]  `,
              ),
              h(Text, { dimColor: true }, ev.summary.slice(0, FEED_SUMMARY_MAX_LEN)),
            )
          ),
        ),
  );
}

export function Dashboard(): React.ReactElement {
  const { data, error } = useStatusPoller();
  const elapsed = useElapsedTime();
  const { entries: iterEntries, available: iterAvailable } =
    useIterationsReader();
  const prdTitles = usePrdTitles();
  const { paused, lastAction, editingContext, quitting, closeEditor } = useKeyboardControls();
  const {
    events,
    currentIter,
    currentReq,
    totalLiveCost,
  } = useEventsReader();
  const { columns } = useTerminalSize();

  if (quitting) {
    return h(
      Box,
      { flexDirection: "column" },
      h(Text, { color: "yellow", bold: true }, "⏳  Quitting — stopping loop…"),
      h(Text, { dimColor: true }, "(waiting for background process to finish)"),
    );
  }

  if (editingContext) {
    return h(ContextEditor, { onClose: closeEditor });
  }

  const entries = Object.entries(data);
  const activeEntry = entries.find(([, req]) => req.status === "in_progress");
  const activeReqId = activeEntry ? activeEntry[0] : null;

  // Sum costs from iterations.jsonl (historical) + live events cost
  const historicalCost = iterEntries.reduce((sum: number, e: IterationEntry) => {
    const c = parseFloat(String(e["cost"] ?? "0"));
    return sum + (isNaN(c) ? 0 : c);
  }, 0);
  // Use whichever is larger (live cost accumulates per event, historical per completed iteration)
  const totalCost = Math.max(historicalCost, totalLiveCost);
  const costStr = `$${totalCost.toFixed(4)}`;

  // Phase tracking
  const lastPhaseEvent = [...events].reverse()
    .find((ev): ev is LoopPhaseEvent => ev.type === "loop:phase");
  const currentPhase = lastPhaseEvent?.phase ?? null;
  const phaseStep = currentPhase ? (PHASE_STEPS[currentPhase] ?? 0) : 0;

  // REQ progress counters
  const totalReqs = entries.length;
  const doneReqs = entries.filter(([, r]) => r.status === "done").length;

  // Progress bar width: ~1/3 terminal width
  const barWidth = Math.max(BAR_WIDTH_MIN, Math.floor(columns / BAR_WIDTH_DIVISOR));

  // Extract tool:call events and current model
  const toolEvents = events.filter((ev): ev is ToolCall => ev.type === "tool:call");
  const lastIterStart = [...events].reverse().find((ev) => ev.type === "iteration:start");
  const currentModel = lastIterStart?.type === "iteration:start" ? lastIterStart.model : "";

  // REQ-list pane (left, 40%)
  const reqPane = h(
    Box,
    { flexDirection: "column", width: "40%" },
    h(Text, { bold: true, color: "white" }, "Requirements"),
    h(Text, { dimColor: true }, "─".repeat(20)),
    entries.length === 0
      ? h(Text, { dimColor: true }, "(no REQs)")
      : h(
          Box,
          { flexDirection: "column" },
          ...entries.flatMap(([id, req]) => {
            const prefix = req.status === "in_progress" ? "▶ " : "  ";
            const title = prdTitles[id];
            const row = h(
              Box,
              { key: id, flexDirection: "column" },
              h(
                Text,
                { color: STATUS_COLORS[req.status] },
                `${prefix}${id}  [${req.status}]`,
              ),
              title
                ? h(Text, { dimColor: true }, `    ${title.slice(0, REQ_TITLE_MAX_LEN)}`)
                : null,
            );

            if (req.status !== "blocked") {
              return [row];
            }

            return [
              row,
              h(BlockedDetail, {
                key: `${id}-detail`,
                reqId: id,
                notes: req.notes,
                allEntries: iterEntries,
                available: iterAvailable,
              }),
            ];
          }),
        ),
  );

  // Activity feed pane (right, 60%)
  const feedPane = h(
    Box,
    { flexDirection: "column", width: "60%", paddingLeft: 2 },
    h(Text, { bold: true, color: "white" }, "Activity Feed"),
    h(Text, { dimColor: true }, "─".repeat(30)),
    h(ActivityFeed, {
      toolEvents,
      currentIter,
      currentReq: currentReq ?? activeReqId,
      model: currentModel,
    }),
  );

  return h(
    Box,
    { flexDirection: "column" },
    // Status bar
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { color: "cyan" }, `Runtime: ${elapsed}`),
      h(Text, { dimColor: true }, "|"),
      h(Text, { color: "cyan" }, `Cost: ${costStr}`),
      h(Text, { dimColor: true }, "|"),
      h(Text, { dimColor: true }, `Iter ${currentIter}`),
    ),
    // REQ progress bar
    h(
      Box,
      { flexDirection: "row", gap: 1 },
      h(Text, { dimColor: true }, "REQs  "),
      h(ProgressBar, { filled: doneReqs, total: totalReqs, width: barWidth, color: "green" }),
      h(Text, { dimColor: true }, `  ${doneReqs}/${totalReqs} done`),
    ),
    // Phase progress bar
    h(
      Box,
      { flexDirection: "row", gap: 1 },
      h(Text, { dimColor: true }, "Phase "),
      h(ProgressBar, { filled: phaseStep, total: PHASE_TOTAL, width: barWidth, color: "yellow" }),
      currentPhase
        ? h(Text, { color: "yellow" }, `  ${PHASE_LABELS[currentPhase]}  (${phaseStep}/${PHASE_TOTAL})`)
        : h(Text, { dimColor: true }, "  —"),
    ),
    h(Text, { dimColor: true }, "─".repeat(columns)),
    // Split layout
    h(
      Box,
      { flexDirection: "row" },
      reqPane,
      feedPane,
    ),
    h(Text, { dimColor: true }, "─".repeat(columns)),
    // Status line
    activeReqId && !currentReq
      ? h(Text, { color: "yellow" }, `Active: ${activeReqId}`)
      : null,
    error !== null ? h(Text, { color: "red" }, `⚠  ${error}`) : null,
    paused ? h(Text, { color: "yellow", bold: true }, "⏸  PAUSED") : null,
    lastAction === "skip-sent"
      ? h(Text, { color: "green" }, "✓ Skip sent")
      : lastAction === "editor-closed"
      ? h(Text, { color: "green" }, "✓ context.md saved")
      : null,
    h(Text, { dimColor: true }, "[p] pause  [s] skip  [e] edit context  [q] quit"),
  );
}
