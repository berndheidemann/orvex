import React from "react";
import { Box, Text, useInput } from "ink";
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
import type { ToolCall } from "../events.ts";

const { createElement: h, useState, useEffect, useRef } = React;

const MAX_BLOCKED_ENTRIES = 3;

// Fixed rows consumed outside the feed entry list:
// main.ts: "Kinema" + divider = 2
// Dashboard: status + REQ bar + Phase bar + 2 dividers + hint = 6
// ActivityFeed: header + divider + iter line = 3  → total = 11
const FEED_OVERHEAD = 11;
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

function shortModelName(modelId: string): string {
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  return modelId;
}

const MODEL_COLORS: Record<string, string> = {
  opus: "magenta",
  sonnet: "blue",
  haiku: "green",
};

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
  rows: number;
}): React.ReactElement {
  const { toolEvents, currentIter, currentReq, model, rows } = props;
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevLenRef = useRef(toolEvents.length);

  // Auto-scroll: when new events arrive and user is at bottom, stay there
  useEffect(() => {
    const newLen = toolEvents.length;
    if (prevLenRef.current !== newLen) {
      prevLenRef.current = newLen;
      // Only auto-scroll if already at bottom (offset 0)
      if (scrollOffset === 0) setScrollOffset(0); // no-op but triggers recalc
    }
  }, [toolEvents.length, scrollOffset]);

  const maxVisible = Math.max(3, rows - FEED_OVERHEAD);
  const total = toolEvents.length;
  const maxOffset = Math.max(0, total - maxVisible);
  const clampedOffset = Math.min(scrollOffset, maxOffset);
  const isAutoScroll = clampedOffset === 0;

  const end = total - clampedOffset;
  const start = Math.max(0, end - maxVisible);
  const shown = toolEvents.slice(start, end);

  useInput((_input, key) => {
    if (key.upArrow) {
      setScrollOffset((prev: number) => Math.min(prev + 1, maxOffset));
    } else if (key.downArrow) {
      setScrollOffset((prev: number) => Math.max(0, prev - 1));
    }
  });

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
              { key: String(start + idx) },
              h(
                Text,
                { color: CATEGORY_COLORS[ev.category] ?? "white" },
                `[${ev.category}]  `,
              ),
              h(Text, { dimColor: true }, ev.summary.replace(/\s*\n\s*/g, " ").slice(0, FEED_SUMMARY_MAX_LEN)),
            )
          ),
        ),
    // Scroll indicator (only when scrolled up)
    !isAutoScroll
      ? h(Text, { dimColor: true }, `↑↓ scroll  (${clampedOffset} from latest)`)
      : null,
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
    currentPhase: livePhase,
    totalLiveCost,
    modelCosts,
  } = useEventsReader();
  const { columns, rows } = useTerminalSize();

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

  // Extract tool:call events and current model (needed for phase gate below)
  const toolEvents = events.filter((ev): ev is ToolCall => ev.type === "tool:call");

  // Phase tracking — livePhase kommt aus useEventsReader (eigener State,
  // nicht aus dem gekürzten events-Puffer) und bleibt korrekt auch wenn
  // loop:phase Events aus dem MAX_EVENTS-Limit herausfallen.
  // Bar bleibt leer bis zum ersten Tool-Call (kein Vorspringen auf Schritt 2).
  const currentPhase = toolEvents.length > 0 ? livePhase : null;
  const phaseStep = currentPhase ? (PHASE_STEPS[currentPhase] ?? 0) : 0;

  // REQ progress counters
  const totalReqs = entries.length;
  const doneReqs = entries.filter(([, r]) => r.status === "done").length;

  // Progress bar width: ~1/3 terminal width
  const barWidth = Math.max(BAR_WIDTH_MIN, Math.floor(columns / BAR_WIDTH_DIVISOR));
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
      rows,
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
      ...Object.entries(modelCosts).map(([modelId, cost]) => {
        const name = shortModelName(modelId);
        const color = MODEL_COLORS[name] ?? "white";
        return h(Text, { key: modelId, color: color as Parameters<typeof Text>[0]["color"] }, `${name} $${cost.toFixed(4)}`);
      }),
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
    h(Text, { dimColor: true }, "[p] pause  [s] skip  [e] edit context  [q] quit  [↑↓] scroll feed"),
  );
}
