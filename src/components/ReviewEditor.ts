import React from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import {
  reducer,
  computeVisualRows,
  findVisualRowIdx,
  mapKeyToAction,
  clamp,
  type EditorState,
  type VisualRow,
} from "./editorLogic.ts";

const { useReducer, useEffect, useState, useRef } = React;
const { createElement: h } = React;

// ── Component ──────────────────────────────────────────────────

export function ReviewEditor(props: {
  title: string;
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const { title, initialContent, onSave, onCancel } = props;
  const { columns, rows } = useTerminalSize();

  const [state, dispatch] = useReducer(reducer, {
    lines: [""],
    cursor: { row: 0, col: 0 },
    dirty: false,
  } as EditorState);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Viewport height in visual rows
  const viewportH = Math.max(5, rows - 5);

  // Load initial content on mount
  useEffect(() => {
    const ls = initialContent.split("\n");
    dispatch({ type: "LOAD", lines: ls.length > 0 ? ls : [""] });
  }, []);

  // ── Backspace fix ──────────────────────────────────────────
  // Ink 5 maps \x7f (macOS Backspace) to key.name='delete' with input=''.
  // Real forward-delete (\x1b[3~) also produces key.delete=true, input=''.
  // They are indistinguishable at the useInput level.
  //
  // Fix: listen on internal_eventEmitter (Ink's own raw-input bus) with
  // prependListener so we fire BEFORE useInput parses the keypress.
  // At that point the raw chunk is still '\x7f' and we can detect it.
  const rawWasBackspace = useRef(false);
  const { internal_eventEmitter } = useStdin() as {
    internal_eventEmitter: {
      prependListener: (e: string, h: (d: string) => void) => void;
      removeListener:  (e: string, h: (d: string) => void) => void;
    };
  };
  useEffect(() => {
    const handler = (chunk: string) => {
      rawWasBackspace.current = chunk === "\x7f";
    };
    internal_eventEmitter.prependListener("input", handler);
    return () => { internal_eventEmitter.removeListener("input", handler); };
  }, [internal_eventEmitter]);

  // ── Visual layout ──────────────────────────────────────────
  const { lines, cursor, dirty } = state;
  const maxLineNumWidth = String(lines.length).length;
  const prefixWidth = maxLineNumWidth + 3;
  const textWidth = Math.max(10, columns - prefixWidth - 1);
  const visualRows = computeVisualRows(lines, textWidth);
  const curVisualIdx = findVisualRowIdx(visualRows, cursor.row, cursor.col);

  // Adjust scroll to keep cursor visible
  useEffect(() => {
    setScrollOffset((prev: number) => {
      if (curVisualIdx < prev) return curVisualIdx;
      if (curVisualIdx >= prev + viewportH) return curVisualIdx - viewportH + 1;
      return prev;
    });
  }, [curVisualIdx, viewportH]);

  useInput((input, key) => {
    // Save & close
    if (key.ctrl && input === "s") { onSave(state.lines.join("\n")); return; }
    // Cancel
    if (key.escape) { onCancel(); return; }

    // Visual-row-aware up/down navigation
    if (key.upArrow) {
      if (curVisualIdx > 0) {
        const curVR  = visualRows[curVisualIdx];
        const prevVR = visualRows[curVisualIdx - 1];
        const visualCol = cursor.col - curVR.startCol;
        dispatch({ type: "MOVE_TO", row: prevVR.logicalRow, col: clamp(prevVR.startCol + visualCol, 0, prevVR.endCol) });
      }
      return;
    }
    if (key.downArrow) {
      if (curVisualIdx < visualRows.length - 1) {
        const curVR  = visualRows[curVisualIdx];
        const nextVR = visualRows[curVisualIdx + 1];
        const visualCol = cursor.col - curVR.startCol;
        dispatch({ type: "MOVE_TO", row: nextVR.logicalRow, col: clamp(nextVR.startCol + visualCol, 0, nextVR.endCol) });
      }
      return;
    }

    // All other keys handled by pure mapKeyToAction
    const action = mapKeyToAction(input, key, rawWasBackspace.current);
    if (action) dispatch(action);
  }, { isActive: true });

  // ── Render ─────────────────────────────────────────────────

  const divider = "─".repeat(columns);
  const visibleVRs = visualRows.slice(scrollOffset, scrollOffset + viewportH);

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      h(Text, { bold: true, color: "green" }, `✏  ${title}${dirty ? "  [modified]" : ""}`),
      h(Text, { dimColor: true }, "[Ctrl+S] speichern  [Esc] abbrechen"),
    ),
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { flexDirection: "column" },
      ...visibleVRs.map((vr: VisualRow, visIdx: number) => {
        const absVisualIdx = scrollOffset + visIdx;
        const isCurrentRow = absVisualIdx === curVisualIdx;
        const lineNumStr = vr.isFirst
          ? String(vr.logicalRow + 1).padStart(maxLineNumWidth, " ")
          : " ".repeat(maxLineNumWidth);
        const lineText = lines[vr.logicalRow]?.slice(vr.startCol, vr.endCol) ?? "";

        if (!isCurrentRow) {
          return h(
            Box,
            { key: `${vr.logicalRow}-${vr.startCol}`, flexDirection: "row" },
            h(Text, { dimColor: true }, vr.isFirst ? `${lineNumStr} │ ` : `${lineNumStr} ↳ `),
            h(Text, {}, lineText || " "),
          );
        }

        const localCol    = cursor.col - vr.startCol;
        const before      = lineText.slice(0, localCol);
        const cursorChar  = lineText[localCol] ?? " ";
        const after       = lineText.slice(localCol + 1);

        return h(
          Box,
          { key: `${vr.logicalRow}-${vr.startCol}`, flexDirection: "row" },
          h(Text, { color: "cyan", dimColor: true }, vr.isFirst ? `${lineNumStr} │ ` : `${lineNumStr} ↳ `),
          h(Text, {}, before),
          h(Text, { inverse: true }, cursorChar),
          h(Text, {}, after),
        );
      }),
    ),
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { dimColor: true }, `Ln ${cursor.row + 1}/${lines.length}  Col ${cursor.col + 1}`),
      scrollOffset > 0 ? h(Text, { dimColor: true }, "↑ more") : null,
      scrollOffset + viewportH < visualRows.length ? h(Text, { dimColor: true }, "↓ more") : null,
      statusMsg ? h(Text, { color: statusMsg.startsWith("⚠") ? "red" : "green" }, statusMsg) : null,
    ),
  );
}
