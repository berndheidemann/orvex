import React from "react";
import { Box, Text, useInput } from "ink";

const { createElement: h, useState, useEffect } = React;

// Overhead rows consumed by the detail pane header:
// header ("Detail: REQ-XXX") + divider = 2
// scroll indicator (optional) = 1
const DETAIL_OVERHEAD = 2;

/** Split a single line into segments that fit within maxWidth, breaking at spaces. */
function wordWrapLine(line: string, maxWidth: number): string[] {
  if (line.length <= maxWidth) return [line];
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > maxWidth) {
    const boundary = remaining.lastIndexOf(" ", maxWidth);
    if (boundary > 0) {
      result.push(remaining.slice(0, boundary));
      remaining = remaining.slice(boundary + 1);
    } else {
      result.push(remaining.slice(0, maxWidth));
      remaining = remaining.slice(maxWidth);
    }
  }
  if (remaining) result.push(remaining);
  return result;
}

export function ReqDetailPane(props: {
  reqId: string;
  content: string;
  rows: number;
  columns: number;
  isActive: boolean;
}): React.ReactElement {
  const { reqId, content, rows, columns, isActive } = props;
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reset scroll when selected REQ changes
  useEffect(() => {
    setScrollOffset(0);
  }, [content]);

  // Pre-wrap content so each entry renders in exactly 1 terminal row.
  // This prevents mid-word breaks and keeps the rendered height predictable.
  const textWidth = Math.max(20, Math.floor(columns * 0.6) - 4);
  const lines = content.split("\n").flatMap((line) => wordWrapLine(line, textWidth));
  const maxVisible = Math.max(3, rows - DETAIL_OVERHEAD - 6); // 6 = parent overhead (status+bars)
  const totalLines = lines.length;
  const maxOffset = Math.max(0, totalLines - maxVisible);
  const clampedOffset = Math.min(scrollOffset, maxOffset);
  const canScroll = totalLines > maxVisible;

  useInput((_input, key) => {
    if (key.upArrow) {
      setScrollOffset((prev: number) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset((prev: number) => Math.min(maxOffset, prev + 1));
    }
  }, { isActive });

  const visibleLines = lines.slice(clampedOffset, clampedOffset + maxVisible);

  return h(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    // Title header
    h(
      Text,
      { bold: true, color: "cyan" },
      `${reqId}`,
    ),
    h(Text, { dimColor: true }, "─".repeat(40)),
    // Content lines
    content
      ? h(
          Box,
          { flexDirection: "column" },
          ...visibleLines.map((line, idx) =>
            h(Text, { key: String(clampedOffset + idx) }, line || " ")
          ),
        )
      : h(Text, { dimColor: true }, "(no detail available)"),
    // Scroll indicator
    canScroll
      ? h(
          Text,
          { dimColor: true },
          `[↑↓] scroll  (line ${clampedOffset + 1}–${Math.min(clampedOffset + maxVisible, totalLines)}/${totalLines})`,
        )
      : null,
  );
}
