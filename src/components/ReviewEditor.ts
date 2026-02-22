import React from "react";
import { Box, Text, useInput } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";

const { useReducer, useEffect, useState } = React;
const { createElement: h } = React;

// ── State & Reducer ────────────────────────────────────────────

type CursorPos = { row: number; col: number };

type EditorState = {
  lines: string[];
  cursor: CursorPos;
  dirty: boolean;
};

type Action =
  | { type: "LOAD"; lines: string[] }
  | { type: "INSERT_CHAR"; char: string }
  | { type: "BACKSPACE" }
  | { type: "DELETE" }
  | { type: "NEWLINE" }
  | { type: "MOVE_TO"; row: number; col: number }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "LINE_START" }
  | { type: "LINE_END" };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function reducer(state: EditorState, action: Action): EditorState {
  const { lines, cursor } = state;
  const { row, col } = cursor;

  switch (action.type) {
    case "LOAD":
      return { lines: action.lines, cursor: { row: 0, col: 0 }, dirty: false };

    case "INSERT_CHAR": {
      const newLines = [...lines];
      const line = newLines[row] ?? "";
      newLines[row] = line.slice(0, col) + action.char + line.slice(col);
      return { ...state, lines: newLines, cursor: { row, col: col + 1 }, dirty: true };
    }

    case "BACKSPACE": {
      const newLines = [...lines];
      if (col > 0) {
        const line = newLines[row] ?? "";
        newLines[row] = line.slice(0, col - 1) + line.slice(col);
        return { ...state, lines: newLines, cursor: { row, col: col - 1 }, dirty: true };
      }
      if (row > 0) {
        const prevLine = newLines[row - 1] ?? "";
        const curLine = newLines[row] ?? "";
        const newCol = prevLine.length;
        newLines.splice(row - 1, 2, prevLine + curLine);
        return { ...state, lines: newLines, cursor: { row: row - 1, col: newCol }, dirty: true };
      }
      return state;
    }

    case "DELETE": {
      const newLines = [...lines];
      const line = newLines[row] ?? "";
      if (col < line.length) {
        newLines[row] = line.slice(0, col) + line.slice(col + 1);
        return { ...state, lines: newLines, dirty: true };
      }
      if (row < newLines.length - 1) {
        const nextLine = newLines[row + 1] ?? "";
        newLines.splice(row, 2, line + nextLine);
        return { ...state, lines: newLines, dirty: true };
      }
      return state;
    }

    case "NEWLINE": {
      const newLines = [...lines];
      const line = newLines[row] ?? "";
      newLines.splice(row, 1, line.slice(0, col), line.slice(col));
      return { ...state, lines: newLines, cursor: { row: row + 1, col: 0 }, dirty: true };
    }

    case "MOVE_TO": {
      const targetRow = clamp(action.row, 0, lines.length - 1);
      const targetCol = clamp(action.col, 0, lines[targetRow]?.length ?? 0);
      return { ...state, cursor: { row: targetRow, col: targetCol } };
    }

    case "MOVE_LEFT": {
      if (col > 0) return { ...state, cursor: { row, col: col - 1 } };
      if (row > 0) {
        const newRow = row - 1;
        return { ...state, cursor: { row: newRow, col: lines[newRow]?.length ?? 0 } };
      }
      return state;
    }

    case "MOVE_RIGHT": {
      const lineLen = lines[row]?.length ?? 0;
      if (col < lineLen) return { ...state, cursor: { row, col: col + 1 } };
      if (row < lines.length - 1) return { ...state, cursor: { row: row + 1, col: 0 } };
      return state;
    }

    case "LINE_START":
      return { ...state, cursor: { row, col: 0 } };

    case "LINE_END":
      return { ...state, cursor: { row, col: lines[row]?.length ?? 0 } };

    default:
      return state;
  }
}

// ── Visual row helpers ─────────────────────────────────────────

type VisualRow = {
  logicalRow: number;
  startCol: number; // inclusive start within the logical line
  endCol: number;   // exclusive end within the logical line
  isFirst: boolean;
  isLast: boolean;
};

function computeVisualRows(lines: string[], textWidth: number): VisualRow[] {
  const tw = Math.max(1, textWidth);
  const result: VisualRow[] = [];
  for (let logRow = 0; logRow < lines.length; logRow++) {
    const line = lines[logRow];
    if (line.length === 0) {
      result.push({ logicalRow: logRow, startCol: 0, endCol: 0, isFirst: true, isLast: true });
      continue;
    }
    let startCol = 0;
    let isFirst = true;
    while (startCol < line.length) {
      let endCol = Math.min(startCol + tw, line.length);
      // Wortweiser Umbruch: letzte Leeerstelle im Chunk suchen und dort umbrechen.
      // Das Leerzeichen gehört zur aktuellen Row (endCol schließt es ein),
      // die nächste Row startet direkt beim folgenden Wort — ohne führendes
      // unsichtbares Leerzeichen in `before`.
      if (endCol < line.length) {
        const chunk = line.slice(startCol, endCol);
        const lastSpace = chunk.lastIndexOf(" ");
        if (lastSpace > 0) {
          endCol = startCol + lastSpace + 1; // Leerzeichen gehört zur aktuellen Row
        }
        // kein Leerzeichen: harter Umbruch bei textWidth (sehr langes Wort)
      }
      result.push({
        logicalRow: logRow,
        startCol,
        endCol,
        isFirst,
        isLast: endCol >= line.length,
      });
      startCol = endCol;
      isFirst = false;
    }
  }
  return result;
}

// Find which visual row index the cursor is on.
function findVisualRowIdx(vrs: VisualRow[], row: number, col: number): number {
  let best = 0;
  for (let i = 0; i < vrs.length; i++) {
    const vr = vrs[i];
    if (vr.logicalRow > row) break;
    if (vr.logicalRow === row && vr.startCol <= col) best = i;
  }
  return best;
}

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
  });

  const [scrollOffset, setScrollOffset] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // Viewport height in visual rows; header(1)+divider(1)+footer(2)+status-row(1)=5 → rows-5, min 5
  const viewportH = Math.max(5, rows - 5);

  // Load initial content on mount
  useEffect(() => {
    const ls = initialContent.split("\n");
    dispatch({ type: "LOAD", lines: ls.length > 0 ? ls : [""] });
  }, []);

  // ── Visual layout (needed both in useInput and in render) ────
  const { lines, cursor, dirty } = state;
  const maxLineNumWidth = String(lines.length).length;
  const prefixWidth = maxLineNumWidth + 3; // "  N │ "
  const textWidth = Math.max(10, columns - prefixWidth - 1);
  const visualRows = computeVisualRows(lines, textWidth);
  const curVisualIdx = findVisualRowIdx(visualRows, cursor.row, cursor.col);

  // Adjust scroll to keep cursor visible (scroll unit = visual rows)
  useEffect(() => {
    setScrollOffset((prev: number) => {
      if (curVisualIdx < prev) return curVisualIdx;
      if (curVisualIdx >= prev + viewportH) return curVisualIdx - viewportH + 1;
      return prev;
    });
  }, [curVisualIdx, viewportH]);

  useInput((input, key) => {
    // Save & close
    if (key.ctrl && input === "s") {
      onSave(state.lines.join("\n"));
      return;
    }

    // Cancel
    if (key.escape) {
      onCancel();
      return;
    }

    // Navigation — visual-row-aware up/down
    if (key.upArrow) {
      if (curVisualIdx > 0) {
        const curVR  = visualRows[curVisualIdx];
        const prevVR = visualRows[curVisualIdx - 1];
        const visualCol = cursor.col - curVR.startCol;
        const newCol = clamp(prevVR.startCol + visualCol, 0, prevVR.endCol);
        dispatch({ type: "MOVE_TO", row: prevVR.logicalRow, col: newCol });
      }
      return;
    }
    if (key.downArrow) {
      if (curVisualIdx < visualRows.length - 1) {
        const curVR  = visualRows[curVisualIdx];
        const nextVR = visualRows[curVisualIdx + 1];
        const visualCol = cursor.col - curVR.startCol;
        const newCol = clamp(nextVR.startCol + visualCol, 0, nextVR.endCol);
        dispatch({ type: "MOVE_TO", row: nextVR.logicalRow, col: newCol });
      }
      return;
    }
    if (key.leftArrow)  { dispatch({ type: "MOVE_LEFT" });  return; }
    if (key.rightArrow) { dispatch({ type: "MOVE_RIGHT" }); return; }

    // Line start/end (Ctrl+A / Ctrl+E)
    if ((key.ctrl && input === "a") || input === "\x1b[H") {
      dispatch({ type: "LINE_START" });
      return;
    }
    if ((key.ctrl && input === "e") || input === "\x1b[F") {
      dispatch({ type: "LINE_END" });
      return;
    }

    // Editing
    if (key.return)    { dispatch({ type: "NEWLINE" });   return; }
    if (key.backspace) { dispatch({ type: "BACKSPACE" }); return; }
    if (key.delete)    { dispatch({ type: "DELETE" });    return; }

    // Printable characters
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      dispatch({ type: "INSERT_CHAR", char: input });
    }
  }, { isActive: true });

  // ── Render ─────────────────────────────────────────────────

  const divider = "─".repeat(columns);
  const visibleVRs = visualRows.slice(scrollOffset, scrollOffset + viewportH);

  return h(
    Box,
    { flexDirection: "column" },
    // Header
    h(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      h(Text, { bold: true, color: "green" },
        `✏  ${title}${dirty ? "  [modified]" : ""}`),
      h(Text, { dimColor: true }, "[Ctrl+S] speichern  [Esc] abbrechen"),
    ),
    h(Text, { dimColor: true }, divider),
    // Editor body
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
          const prefix = vr.isFirst ? `${lineNumStr} │ ` : `${lineNumStr} ↳ `;
          return h(
            Box,
            { key: `${vr.logicalRow}-${vr.startCol}`, flexDirection: "row" },
            h(Text, { dimColor: true }, prefix),
            h(Text, {}, lineText || " "),
          );
        }

        // Current visual row: render with cursor highlight
        const localCol = cursor.col - vr.startCol;
        const before     = lineText.slice(0, localCol);
        const cursorChar = lineText[localCol] ?? " ";
        const after      = lineText.slice(localCol + 1);
        const prefix = vr.isFirst
          ? h(Text, { color: "cyan", dimColor: true }, `${lineNumStr} │ `)
          : h(Text, { color: "cyan", dimColor: true }, `${lineNumStr} ↳ `);

        return h(
          Box,
          { key: `${vr.logicalRow}-${vr.startCol}`, flexDirection: "row" },
          prefix,
          h(Text, {}, before),
          h(Text, { inverse: true }, cursorChar),
          h(Text, {}, after),
        );
      }),
    ),
    // Footer
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { dimColor: true },
        `Ln ${cursor.row + 1}/${lines.length}  Col ${cursor.col + 1}`),
      scrollOffset > 0
        ? h(Text, { dimColor: true }, "↑ more")
        : null,
      scrollOffset + viewportH < visualRows.length
        ? h(Text, { dimColor: true }, "↓ more")
        : null,
      statusMsg
        ? h(Text, { color: statusMsg.startsWith("⚠") ? "red" : "green" }, statusMsg)
        : null,
    ),
  );
}
