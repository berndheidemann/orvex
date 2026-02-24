import React from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useStatusPoller } from "../hooks/useStatusPoller.ts";
import { useElapsedTime } from "../hooks/useElapsedTime.ts";
import { useIterationsReader } from "../hooks/useIterationsReader.ts";
import { useKeyboardControls } from "../hooks/useKeyboardControls.ts";
import { useEventsReader } from "../hooks/useEventsReader.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { useLoopRunning } from "../hooks/useLoopRunning.ts";
import { usePrdTitles } from "../hooks/usePrdTitles.ts";
import { useReqDetails } from "../hooks/useReqDetails.ts";
import { ReqDetailPane } from "./ReqDetailPane.ts";
import { ContextEditor } from "./ContextEditor.ts";
import { ProgressBar } from "./ProgressBar.ts";
import { STATUS_COLORS } from "../types.ts";
import type { IterationEntry } from "../types.ts";
import type { ToolCall, SystemEvent, LoopEvent } from "../events.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";
import { runClaude } from "../lib/runClaude.ts";

const { createElement: h, useState, useEffect, useRef } = React;

const MAX_BLOCKED_ENTRIES = 3;

// Fixed rows consumed outside the feed entry list:
// main.ts: "Orvex" + divider = 2
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

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
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
  isActive?: boolean;
}): React.ReactElement {
  const { toolEvents, currentIter, currentReq, model, rows, isActive = true } = props;
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevLenRef = useRef(toolEvents.length);
  const prevIterRef = useRef(currentIter);

  // Auto-scroll to latest when a new iteration starts
  useEffect(() => {
    if (currentIter > prevIterRef.current) {
      prevIterRef.current = currentIter;
      setScrollOffset(0);
    }
  }, [currentIter]);

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
  }, { isActive });

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

// --- Completion Overlay ---

type StopKind =
  | "all_done"
  | "max_iterations"
  | "timeout"
  | "low_activity"
  | "no_actionable_req"
  | "unknown";

const STOP_CONFIG: Record<StopKind, { color: string; headline: string }> = {
  all_done:          { color: "green",  headline: "✅  Alle Requirements erfüllt" },
  max_iterations:    { color: "yellow", headline: "⏹  Maximale Iterationen erreicht" },
  timeout:           { color: "yellow", headline: "⏱  Timeout" },
  low_activity:      { color: "yellow", headline: "💤  Loop inaktiv" },
  no_actionable_req: { color: "yellow", headline: "⚠  Kein ausführbares Requirement" },
  unknown:           { color: "red",    headline: "⛔  Loop unerwartet beendet" },
};

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const KNOWN_STOP_KINDS: readonly string[] = [
  "all_done", "max_iterations", "timeout", "low_activity", "no_actionable_req",
];

function detectStopKind(events: LoopEvent[]): StopKind {
  const systemEvts = events.filter(
    (ev): ev is SystemEvent => ev.type === "system:event",
  );
  const last = systemEvts[systemEvts.length - 1];
  if (!last) return "unknown";
  return KNOWN_STOP_KINDS.includes(last.kind) ? (last.kind as StopKind) : "unknown";
}

function CompletionOverlay(props: {
  kind: StopKind;
  elapsed: string;
  costStr: string;
  currentIter: number;
  doneReqs: number;
  totalReqs: number;
}): React.ReactElement {
  const { kind, elapsed, costStr, currentIter, doneReqs, totalReqs } = props;
  const { exit } = useApp();
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(kind !== "all_done");
  const calledRef = useRef(false);

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  useEffect(() => {
    if (kind === "all_done" || calledRef.current) return;
    calledRef.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        let lastLines = "";
        try {
          const content = await Deno.readTextFile(`${AGENT_DIR}/events.jsonl`);
          const lines = content.split("\n").filter((l: string) => l.trim().length > 0);
          lastLines = lines.slice(-40).join("\n");
        } catch { /* file not found — use empty */ }

        const prompt = [
          "You are a loop diagnostics assistant. Given the last events from an agentic development loop,",
          "explain in 2–3 German sentences why the loop stopped. Be concise and specific.",
          `Stop reason reported: ${kind}`,
          "Last events (JSONL):",
          lastLines,
        ].join("\n");

        const text = await runClaude(prompt, () => {}, controller.signal, HAIKU_MODEL, 1);
        setDiagnosis(text.trim());
      } catch { /* silent fallback */ } finally {
        setDiagLoading(false);
      }
    })();

    return () => controller.abort();
  }, [kind]);

  const cfg = STOP_CONFIG[kind];
  const summaryLine = `Laufzeit: ${elapsed}  ·  Kosten: ${costStr}  ·  Iterationen: ${currentIter}  ·  REQs: ${doneReqs}/${totalReqs} done`;

  return h(
    Box,
    { flexDirection: "column", padding: 2 },
    h(
      Text,
      { bold: true, color: cfg.color as Parameters<typeof Text>[0]["color"] },
      cfg.headline,
    ),
    h(
      Box,
      { marginTop: 1 },
      h(Text, { dimColor: true }, summaryLine),
    ),
    kind !== "all_done"
      ? h(
          Box,
          { marginTop: 1, flexDirection: "column" },
          diagLoading
            ? h(Text, { color: "yellow" }, "⏳  Analysiere…")
            : diagnosis !== null
            ? h(Text, {}, diagnosis)
            : null,
        )
      : null,
    h(
      Box,
      { marginTop: 2 },
      h(Text, { dimColor: true }, "[q] beenden"),
    ),
  );
}

export function Dashboard(): React.ReactElement {
  const { data, error } = useStatusPoller();
  const loopRunning = useLoopRunning();
  const elapsed = useElapsedTime(loopRunning);
  const { entries: iterEntries, available: iterAvailable } =
    useIterationsReader();
  const prdTitles = usePrdTitles();
  const reqDetails = useReqDetails();
  const { paused, lastAction, editingContext, quitting, closeEditor } = useKeyboardControls();

  // RF-009: Focus mode state
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [focusCursor, setFocusCursor] = useState<number>(0);
  const [focusTarget, setFocusTarget] = useState<"list" | "detail">("list");
  const {
    events,
    currentIter,
    currentReq,
    currentPhase: livePhase,
    totalLiveCost,
    modelCosts,
    reqStats,
  } = useEventsReader();
  const { columns, rows } = useTerminalSize();

  const entries = Object.entries(data);
  // RF-008: group entries — active (open/in_progress/blocked) on top, done on bottom
  const activeEntries = entries.filter(([, req]) => req.status !== "done");
  const doneEntries = entries.filter(([, req]) => req.status === "done");
  const groupedEntries = [...activeEntries, ...doneEntries];
  const hasSeparator = activeEntries.length > 0 && doneEntries.length > 0;
  // RF-006: authoritative iter counter = max of live currentIter and last completed iter from iterations.jsonl
  const lastCompletedIter = iterEntries.length > 0 ? iterEntries[iterEntries.length - 1].iteration : 0;
  const displayIter = Math.max(currentIter, lastCompletedIter);
  // Sum costs from iterations.jsonl (historical) + live events cost
  const historicalCost = iterEntries.reduce((sum: number, e: IterationEntry) => {
    const c = parseFloat(String(e["cost"] ?? "0"));
    return sum + (isNaN(c) ? 0 : c);
  }, 0);
  // Use whichever is larger (live cost accumulates per event, historical per completed iteration)
  const totalCost = Math.max(historicalCost, totalLiveCost);
  const costStr = `$${totalCost.toFixed(4)}`;
  // REQ progress counters
  const totalReqs = entries.length;
  const doneReqs = entries.filter(([, r]) => r.status === "done").length;

  // Pre-compute viewport inputs early (needed for stable-viewport hook below)
  const activeEntryIdxEarly = groupedEntries.findIndex(([, req]) => req.status === "in_progress");
  const maxReqVisibleEarly = Math.max(3, Math.floor((rows - FEED_OVERHEAD) / 2));

  // Stable viewport: only scroll when active REQ actually goes out of view.
  // Using state (not inline calc) prevents the list from jumping on every REQ status change.
  const [stableReqViewStart, setStableReqViewStart] = useState(0);
  useEffect(() => {
    if (focusMode) return;
    const total = groupedEntries.length;
    if (total <= maxReqVisibleEarly) { setStableReqViewStart(0); return; }
    if (activeEntryIdxEarly >= 0) {
      setStableReqViewStart((prev: number) => {
        if (activeEntryIdxEarly < prev || activeEntryIdxEarly >= prev + maxReqVisibleEarly) {
          const ns = Math.max(0, activeEntryIdxEarly - Math.floor(maxReqVisibleEarly / 2));
          return Math.min(ns, total - maxReqVisibleEarly);
        }
        return prev;
      });
    } else {
      setStableReqViewStart(Math.max(0, total - maxReqVisibleEarly));
    }
  }, [activeEntryIdxEarly, focusMode, groupedEntries.length, maxReqVisibleEarly]);

  // RF-009: Focus mode keyboard handler — r, Tab, ↑/↓ in focus mode
  useInput((input, key) => {
    if (input === "r") {
      setFocusMode((prev: boolean) => {
        if (!prev) {
          // Entering focus mode: position cursor on in_progress or first open
          const ipIdx = groupedEntries.findIndex(([, r]) => r.status === "in_progress");
          const openIdx = groupedEntries.findIndex(([, r]) => r.status === "open");
          setFocusCursor(ipIdx >= 0 ? ipIdx : openIdx >= 0 ? openIdx : 0);
          setFocusTarget("list");
        }
        return !prev;
      });
      return;
    }
    if (!focusMode) return;

    if (key.tab) {
      setFocusTarget((prev: "list" | "detail") => prev === "list" ? "detail" : "list");
      return;
    }
    if (focusTarget === "list") {
      if (key.upArrow) {
        setFocusCursor((prev: number) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setFocusCursor((prev: number) => Math.min(groupedEntries.length - 1, prev + 1));
      }
    }
  }, { isActive: !editingContext && !quitting });

  if (quitting) {
    return h(
      Box,
      { flexDirection: "column" },
      h(Text, { color: "yellow", bold: true }, "⏳  Quitting — stopping loop…"),
      h(Text, { dimColor: true }, "(waiting for background process to finish)"),
    );
  }

  if (loopRunning === false && currentIter > 0) {
    return h(CompletionOverlay, {
      kind: detectStopKind(events),
      elapsed,
      costStr,
      currentIter,
      doneReqs,
      totalReqs,
    });
  }

  if (editingContext) {
    return h(ContextEditor, { onClose: closeEditor });
  }

  const activeEntry = entries.find(([, req]) => req.status === "in_progress");
  const activeReqId = activeEntry ? activeEntry[0] : null;

  // Extract tool:call events and current model (needed for phase gate below)
  const toolEvents = events.filter((ev): ev is ToolCall => ev.type === "tool:call");

  // Phase tracking — livePhase kommt aus useEventsReader (eigener State,
  // nicht aus dem gekürzten events-Puffer) und bleibt korrekt auch wenn
  // loop:phase Events aus dem MAX_EVENTS-Limit herausfallen.
  // Bar bleibt leer bis zum ersten Tool-Call (kein Vorspringen auf Schritt 2).
  const currentPhase = toolEvents.length > 0 ? livePhase : null;
  const phaseStep = currentPhase ? (PHASE_STEPS[currentPhase] ?? 0) : 0;

  // Progress bar width: ~1/3 terminal width
  const barWidth = Math.max(BAR_WIDTH_MIN, Math.floor(columns / BAR_WIDTH_DIVISOR));
  const lastIterStart = [...events].reverse().find((ev) => ev.type === "iteration:start");
  const currentModel = lastIterStart?.type === "iteration:start" ? lastIterStart.model : "";

  // RF-007: viewport for req-list
  const maxReqVisible = maxReqVisibleEarly; // pre-computed above
  const activeEntryIdx = activeEntryIdxEarly; // pre-computed above
  // In focus mode: center around cursor (immediate response to keyboard nav).
  // In normal mode: use stable state — only scrolls when active REQ goes off-screen.
  let reqViewStart = stableReqViewStart;
  if (focusMode && groupedEntries.length > maxReqVisible) {
    reqViewStart = Math.max(0, focusCursor - Math.floor(maxReqVisible / 2));
    reqViewStart = Math.min(reqViewStart, groupedEntries.length - maxReqVisible);
  }
  const reqViewEnd = Math.min(reqViewStart + maxReqVisible, groupedEntries.length);
  const visibleEntries = groupedEntries.slice(reqViewStart, reqViewEnd);
  const aboveCount = reqViewStart;
  const belowCount = groupedEntries.length - reqViewEnd;

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
          aboveCount > 0
            ? h(Text, { dimColor: true }, `↑ ${aboveCount} more`)
            : null,
          ...visibleEntries.flatMap(([id, req], localIdx) => {
            const globalIdx = reqViewStart + localIdx;
            const isCursor = focusMode && globalIdx === focusCursor;
            const prefix = focusMode
              ? (isCursor ? "▶ " : "  ")
              : (req.status === "in_progress" ? "▶ " : "  ");
            const title = prdTitles[id];
            const stats = req.status === "done" ? reqStats[id] : undefined;
            const statsStr = stats
              ? `$${stats.totalCostUsd.toFixed(2)} · ${formatDuration(stats.totalDurationMs)}`
              : null;
            const row = h(
              Box,
              { key: id, flexDirection: "column" },
              h(
                Text,
                { color: STATUS_COLORS[req.status], inverse: isCursor && focusTarget === "list" },
                `${prefix}${id}  [${req.status}]`,
              ),
              title
                ? h(Text, { dimColor: true }, `    ${title.slice(0, REQ_TITLE_MAX_LEN)}`)
                : null,
              statsStr
                ? h(Text, { dimColor: true }, `    ${statsStr}`)
                : null,
            );

            // RF-008: separator between active and done groups
            const sep =
              hasSeparator && req.status === "done" && globalIdx === activeEntries.length
                ? h(Text, { key: "__sep__", dimColor: true }, "─── done ───")
                : null;

            if (req.status !== "blocked") {
              return sep ? [sep, row] : [row];
            }

            return [
              ...(sep ? [sep] : []),
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
          belowCount > 0
            ? h(Text, { dimColor: true }, `↓ ${belowCount} more`)
            : null,
        ),
  );

  // Activity feed pane (right, 60%) — always mounted, hidden in focus mode to preserve scroll state
  // RF-009: Detail pane data (needed for both panes block below)
  const selectedReqId = groupedEntries[focusCursor]?.[0] ?? "";
  const detailContent = reqDetails[selectedReqId] ?? "";

  // Conditionally render feed vs detail — using null instead of display:"none" so that
  // unmounted components don't contribute to Ink's layout-height calculation.
  // This prevents ghost frames ("Orvex" repeating) when ActivityFeed height fluctuates
  // while the pane is hidden.
  const feedPane = !focusMode
    ? h(
        Box,
        { flexDirection: "column", width: "60%", paddingLeft: 2 },
        h(Text, { bold: true, color: "white" }, "Activity Feed"),
        h(Text, { dimColor: true }, "─".repeat(30)),
        h(ActivityFeed, {
          toolEvents,
          currentIter: displayIter,
          currentReq: currentReq ?? activeReqId,
          model: currentModel,
          rows,
        }),
      )
    : null;

  const detailPane = focusMode
    ? h(
        Box,
        { flexDirection: "column", width: "60%", paddingLeft: 2 },
        h(ReqDetailPane, {
          reqId: selectedReqId,
          content: detailContent,
          rows,
          columns,
          isActive: focusTarget === "detail",
        }),
      )
    : null;

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
      h(Text, { dimColor: true }, `Iter ${displayIter}`),
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
      detailPane,
    ),
    h(Text, { dimColor: true }, "─".repeat(columns)),
    // Single always-rendered status line — keeps total render height stable to
    // prevent Ink ghost frames when conditional lines appear/disappear.
    h(
      Text,
      {
        bold: paused,
        color: (paused ? "yellow"
          : error !== null ? "red"
          : (lastAction === "skip-sent" || lastAction === "editor-closed") ? "green"
          : (activeReqId && !currentReq) ? "yellow"
          : undefined) as Parameters<typeof Text>[0]["color"],
      },
      paused ? "⏸  PAUSED"
        : error !== null ? `⚠  ${error}`
        : lastAction === "skip-sent" ? "✓ Skip sent"
        : lastAction === "editor-closed" ? "✓ context.md saved"
        : (activeReqId && !currentReq) ? `Active: ${activeReqId}`
        : " ",
    ),
    focusMode
      ? h(Text, { dimColor: true }, "[r] normal  [↑↓] select req  [Tab] scroll detail  [p] pause  [s] skip  [e] edit  [q] quit")
      : h(Text, { dimColor: true }, "[p] pause  [s] skip  [e] edit context  [r] req focus  [q] quit  [↑↓] scroll feed"),
  );
}
