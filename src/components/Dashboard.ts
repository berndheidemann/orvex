import React from "react";
import { Box, Text } from "ink";
import { useStatusPoller } from "../hooks/useStatusPoller.ts";
import { useElapsedTime } from "../hooks/useElapsedTime.ts";
import { STATUS_COLORS } from "../types.ts";

const { createElement: h } = React;

export function Dashboard(): React.ReactElement {
  const { data, error } = useStatusPoller();
  const elapsed = useElapsedTime();

  const entries = Object.entries(data);
  const activeEntry = entries.find(([, req]) => req.status === "in_progress");
  const activeReqId = activeEntry ? activeEntry[0] : null;

  return h(
    Box,
    { flexDirection: "column" },
    // Status bar: runtime + costs
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { color: "cyan" }, `Runtime: ${elapsed}`),
      h(Text, { dimColor: true }, "|"),
      h(Text, { color: "cyan" }, "Cost: $0.00"),
    ),
    h(Text, { dimColor: true }, "─".repeat(40)),
    // REQ list
    entries.length === 0
      ? h(Text, { dimColor: true }, "(no REQs)")
      : h(
          Box,
          { flexDirection: "column" },
          ...entries.map(([id, req]) =>
            h(
              Text,
              {
                key: id,
                color: STATUS_COLORS[req.status],
              },
              `${req.status === "in_progress" ? "▶ " : "  "}${id}  [${req.status}]`,
            )
          ),
        ),
    h(Text, { dimColor: true }, "─".repeat(40)),
    // Active REQ info
    activeReqId
      ? h(Text, { color: "yellow" }, `Active: ${activeReqId}  Phase: in_progress`)
      : h(Text, { dimColor: true }, "No active REQ"),
    // Error indicator (only if present)
    error !== null ? h(Text, { color: "red" }, `⚠  ${error}`) : null,
  );
}
