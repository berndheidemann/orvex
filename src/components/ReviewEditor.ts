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
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
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

    case "MOVE_UP": {
      if (row === 0) return state;
      const newRow = row - 1;
      const newCol = clamp(col, 0, lines[newRow]?.length ?? 0);
      return { ...state, cursor: { row: newRow, col: newCol } };
    }

    case "MOVE_DOWN": {
      if (row >= lines.length - 1) return state;
      const newRow = row + 1;
      const newCol = clamp(col, 0, lines[newRow]?.length ?? 0);
      return { ...state, cursor: { row: newRow, col: newCol } };
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

  // Viewport: rows minus header(1) + divider(1) + footer(2) + status(1) = 5
  const viewportH = Math.max(5, rows - 6);

  // Load initial content on mount
  useEffect(() => {
    const ls = initialContent.split("\n");
    dispatch({ type: "LOAD", lines: ls.length > 0 ? ls : [""] });
  }, []);

  // Adjust scroll to keep cursor visible
  useEffect(() => {
    const r = state.cursor.row;
    setScrollOffset((prev: number) => {
      if (r < prev) return r;
      if (r >= prev + viewportH) return r - viewportH + 1;
      return prev;
    });
  }, [state.cursor.row, viewportH]);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 2000);
  };

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

    // Navigation
    if (key.upArrow)    { dispatch({ type: "MOVE_UP" });    return; }
    if (key.downArrow)  { dispatch({ type: "MOVE_DOWN" });  return; }
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

  const { lines, cursor, dirty } = state;
  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportH);
  const divider = "─".repeat(columns);

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
      ...visibleLines.map((line: string, visIdx: number) => {
        const absRow = scrollOffset + visIdx;
        const isCurrentRow = absRow === cursor.row;
        const lineNum = String(absRow + 1).padStart(3, " ");

        if (!isCurrentRow) {
          return h(
            Box,
            { key: String(absRow) },
            h(Text, { dimColor: true }, `${lineNum} │ `),
            h(Text, {}, line),
          );
        }

        // Current line: split at cursor and highlight cursor char
        const before = line.slice(0, cursor.col);
        const cursorChar = line[cursor.col] ?? " ";
        const after = line.slice(cursor.col + 1);

        return h(
          Box,
          { key: String(absRow) },
          h(Text, { color: "cyan", dimColor: true }, `${lineNum} │ `),
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
      scrollOffset + viewportH < lines.length
        ? h(Text, { dimColor: true }, "↓ more")
        : null,
      statusMsg
        ? h(Text, { color: statusMsg.startsWith("⚠") ? "red" : "green" }, statusMsg)
        : null,
    ),
  );
}
