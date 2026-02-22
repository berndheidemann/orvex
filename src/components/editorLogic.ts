// Pure editor logic — no React/Ink dependencies, fully testable.

// ── Types ──────────────────────────────────────────────────────

export type CursorPos = { row: number; col: number };

export type EditorState = {
  lines: string[];
  cursor: CursorPos;
  dirty: boolean;
};

export type Action =
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

export type VisualRow = {
  logicalRow: number;
  startCol: number;
  endCol: number;
  isFirst: boolean;
  isLast: boolean;
};

// ── Helpers ────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Reducer ────────────────────────────────────────────────────

export function reducer(state: EditorState, action: Action): EditorState {
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

// ── Visual row computation ─────────────────────────────────────

export function computeVisualRows(lines: string[], textWidth: number): VisualRow[] {
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
      if (endCol < line.length) {
        const chunk = line.slice(startCol, endCol);
        const lastSpace = chunk.lastIndexOf(" ");
        if (lastSpace > 0) {
          endCol = startCol + lastSpace + 1;
        }
      }
      result.push({ logicalRow: logRow, startCol, endCol, isFirst, isLast: endCol >= line.length });
      startCol = endCol;
      isFirst = false;
    }
  }
  return result;
}

export function findVisualRowIdx(vrs: VisualRow[], row: number, col: number): number {
  let best = 0;
  for (let i = 0; i < vrs.length; i++) {
    const vr = vrs[i];
    if (vr.logicalRow > row) break;
    if (vr.logicalRow === row && vr.startCol <= col) best = i;
  }
  return best;
}

// ── Key → Action mapping (pure, testable) ─────────────────────

export type KeyInfo = {
  ctrl?: boolean;
  meta?: boolean;
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
};

/**
 * Maps a key event to an editor Action.
 * rawWasBackspace: true when the raw stdin byte was \x7f (macOS Backspace),
 * needed because Ink 5 maps \x7f to key.delete instead of key.backspace.
 * Returns null for keys handled at component level (save, cancel, navigation).
 */
export function mapKeyToAction(
  input: string,
  key: KeyInfo,
  rawWasBackspace: boolean,
): Action | null {
  if (key.return) return { type: "NEWLINE" };
  // Ink 5 maps macOS Backspace (\x7f) to key.delete; rawWasBackspace distinguishes it from real forward-delete.
  if (key.backspace || (key.delete && rawWasBackspace)) return { type: "BACKSPACE" };
  if (key.delete) return { type: "DELETE" };
  if (key.leftArrow)  return { type: "MOVE_LEFT" };
  if (key.rightArrow) return { type: "MOVE_RIGHT" };
  if ((key.ctrl && input === "a") || input === "\x1b[H") return { type: "LINE_START" };
  if ((key.ctrl && input === "e") || input === "\x1b[F") return { type: "LINE_END" };
  if (input && input.length === 1 && !key.ctrl && !key.meta) {
    return { type: "INSERT_CHAR", char: input };
  }
  return null;
}
