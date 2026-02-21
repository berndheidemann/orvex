import React from "react";
import { Box, Text } from "ink";
import { useStatusPoller } from "../hooks/useStatusPoller.ts";
import { useElapsedTime } from "../hooks/useElapsedTime.ts";
import { useIterationsReader } from "../hooks/useIterationsReader.ts";
import { useKeyboardControls } from "../hooks/useKeyboardControls.ts";
import { STATUS_COLORS } from "../types.ts";
import type { IterationEntry } from "../types.ts";

const { createElement: h } = React;

const MAX_BLOCKED_ENTRIES = 3;

function formatTimestamp(ts: string): string {
  // Show date + time without timezone for brevity
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

  // Filter iterations matching this REQ
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

  // Show last MAX_BLOCKED_ENTRIES entries
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

export function Dashboard(): React.ReactElement {
  const { data, error } = useStatusPoller();
  const elapsed = useElapsedTime();
  const { entries: iterEntries, available: iterAvailable } =
    useIterationsReader();
  const { paused, lastAction, editorOpen } = useKeyboardControls();

  // While editor is open, yield the terminal to avoid display corruption
  if (editorOpen) {
    return h(
      Box,
      { flexDirection: "column" },
      h(Text, { color: "green", bold: true }, "✏  Editing context.md..."),
      h(Text, { dimColor: true }, "(TUI paused — close editor to resume)"),
    );
  }

  const entries = Object.entries(data);
  const activeEntry = entries.find(([, req]) => req.status === "in_progress");
  const activeReqId = activeEntry ? activeEntry[0] : null;

  // Sum costs from iterations.jsonl
  const totalCost = iterEntries.reduce((sum: number, e: IterationEntry) => {
    const c = parseFloat(String(e["cost"] ?? "0"));
    return sum + (isNaN(c) ? 0 : c);
  }, 0);
  const costStr = `$${totalCost.toFixed(4)}`;

  return h(
    Box,
    { flexDirection: "column" },
    // Status bar: runtime + costs
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { color: "cyan" }, `Runtime: ${elapsed}`),
      h(Text, { dimColor: true }, "|"),
      h(Text, { color: "cyan" }, `Cost: ${costStr}`),
    ),
    h(Text, { dimColor: true }, "─".repeat(40)),
    // REQ list
    entries.length === 0
      ? h(Text, { dimColor: true }, "(no REQs)")
      : h(
          Box,
          { flexDirection: "column" },
          ...entries.flatMap(([id, req]) => {
            const row = h(
              Text,
              {
                key: id,
                color: STATUS_COLORS[req.status],
              },
              `${req.status === "in_progress" ? "▶ " : "  "}${id}  [${req.status}]`,
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
    h(Text, { dimColor: true }, "─".repeat(40)),
    // Active REQ info
    activeReqId
      ? h(Text, { color: "yellow" }, `Active: ${activeReqId}  Phase: in_progress`)
      : h(Text, { dimColor: true }, "No active REQ"),
    // Error indicator (only if present)
    error !== null ? h(Text, { color: "red" }, `⚠  ${error}`) : null,
    // Pause indicator
    paused ? h(Text, { color: "yellow", bold: true }, "⏸  PAUSED") : null,
    // Action feedback (skip / editor)
    lastAction === "skip-sent"
      ? h(Text, { color: "green" }, "✓ Skip sent")
      : lastAction === "editor-no-env"
      ? h(Text, { color: "red" }, "⚠  $EDITOR not set")
      : lastAction === "editor-opened"
      ? h(Text, { color: "green" }, "✓ Editor opened")
      : null,
    // Keyboard hint
    h(Text, { dimColor: true }, "[p] pause  [s] skip  [e] edit context"),
  );
}
