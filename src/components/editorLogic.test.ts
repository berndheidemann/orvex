import { assertEquals } from "jsr:@std/assert";
import {
  reducer,
  computeVisualRows,
  findVisualRowIdx,
  mapKeyToAction,
  type EditorState,
} from "./editorLogic.ts";

// ── Helpers ────────────────────────────────────────────────────

function state(lines: string[], row: number, col: number): EditorState {
  return { lines, cursor: { row, col }, dirty: false };
}

// ── reducer: INSERT_CHAR ───────────────────────────────────────

Deno.test("INSERT_CHAR inserts at cursor position", () => {
  const s = state(["hello"], 0, 2);
  const r = reducer(s, { type: "INSERT_CHAR", char: "X" });
  assertEquals(r.lines[0], "heXllo");
  assertEquals(r.cursor.col, 3);
  assertEquals(r.dirty, true);
});

Deno.test("INSERT_CHAR at end of line appends", () => {
  const s = state(["hi"], 0, 2);
  const r = reducer(s, { type: "INSERT_CHAR", char: "!" });
  assertEquals(r.lines[0], "hi!");
  assertEquals(r.cursor.col, 3);
});

// ── reducer: BACKSPACE ────────────────────────────────────────

Deno.test("BACKSPACE removes character before cursor", () => {
  const s = state(["hello"], 0, 3);
  const r = reducer(s, { type: "BACKSPACE" });
  assertEquals(r.lines[0], "helo");
  assertEquals(r.cursor.col, 2);
  assertEquals(r.dirty, true);
});

Deno.test("BACKSPACE at col=0 merges with previous line", () => {
  const s = state(["foo", "bar"], 1, 0);
  const r = reducer(s, { type: "BACKSPACE" });
  assertEquals(r.lines, ["foobar"]);
  assertEquals(r.cursor, { row: 0, col: 3 });
});

Deno.test("BACKSPACE at start of first line is a no-op", () => {
  const s = state(["hi"], 0, 0);
  const r = reducer(s, { type: "BACKSPACE" });
  assertEquals(r.lines, ["hi"]);
  assertEquals(r.cursor.col, 0);
});

// ── reducer: DELETE ───────────────────────────────────────────

Deno.test("DELETE removes character at cursor", () => {
  const s = state(["hello"], 0, 2);
  const r = reducer(s, { type: "DELETE" });
  assertEquals(r.lines[0], "helo");
  assertEquals(r.cursor.col, 2); // cursor stays
});

Deno.test("DELETE at end of line merges with next line", () => {
  const s = state(["foo", "bar"], 0, 3);
  const r = reducer(s, { type: "DELETE" });
  assertEquals(r.lines, ["foobar"]);
  assertEquals(r.cursor, { row: 0, col: 3 });
});

// ── reducer: NEWLINE ──────────────────────────────────────────

Deno.test("NEWLINE splits line at cursor", () => {
  const s = state(["hello"], 0, 3);
  const r = reducer(s, { type: "NEWLINE" });
  assertEquals(r.lines, ["hel", "lo"]);
  assertEquals(r.cursor, { row: 1, col: 0 });
});

// ── reducer: navigation ───────────────────────────────────────

Deno.test("MOVE_LEFT moves cursor left", () => {
  const s = state(["abc"], 0, 2);
  assertEquals(reducer(s, { type: "MOVE_LEFT" }).cursor.col, 1);
});

Deno.test("MOVE_LEFT at col=0 wraps to end of previous line", () => {
  const s = state(["foo", "bar"], 1, 0);
  const r = reducer(s, { type: "MOVE_LEFT" });
  assertEquals(r.cursor, { row: 0, col: 3 });
});

Deno.test("MOVE_RIGHT moves cursor right", () => {
  const s = state(["abc"], 0, 1);
  assertEquals(reducer(s, { type: "MOVE_RIGHT" }).cursor.col, 2);
});

Deno.test("MOVE_RIGHT at end of line wraps to next line", () => {
  const s = state(["foo", "bar"], 0, 3);
  const r = reducer(s, { type: "MOVE_RIGHT" });
  assertEquals(r.cursor, { row: 1, col: 0 });
});

Deno.test("LINE_START moves to col 0", () => {
  const s = state(["hello"], 0, 4);
  assertEquals(reducer(s, { type: "LINE_START" }).cursor.col, 0);
});

Deno.test("LINE_END moves to end of line", () => {
  const s = state(["hello"], 0, 0);
  assertEquals(reducer(s, { type: "LINE_END" }).cursor.col, 5);
});

Deno.test("MOVE_TO clamps row and col to valid range", () => {
  const s = state(["hi", "there"], 0, 0);
  const r = reducer(s, { type: "MOVE_TO", row: 99, col: 99 });
  assertEquals(r.cursor, { row: 1, col: 5 });
});

// ── computeVisualRows ─────────────────────────────────────────

Deno.test("empty line produces single visual row", () => {
  const vrs = computeVisualRows([""], 20);
  assertEquals(vrs.length, 1);
  assertEquals(vrs[0], { logicalRow: 0, startCol: 0, endCol: 0, isFirst: true, isLast: true });
});

Deno.test("short line fits in one visual row", () => {
  const vrs = computeVisualRows(["hello"], 20);
  assertEquals(vrs.length, 1);
  assertEquals(vrs[0].startCol, 0);
  assertEquals(vrs[0].endCol, 5);
  assertEquals(vrs[0].isLast, true);
});

Deno.test("long line wraps at word boundary (space included in first row)", () => {
  // "hello world" with textWidth=8 → "hello " (6) + "world" (5)
  const vrs = computeVisualRows(["hello world"], 8);
  assertEquals(vrs.length, 2);
  assertEquals(vrs[0].endCol, 6); // includes the space
  assertEquals(vrs[1].startCol, 6);
  assertEquals(vrs[1].endCol, 11);
  assertEquals(vrs[1].isFirst, false);
  assertEquals(vrs[1].isLast, true);
});

Deno.test("word with no spaces: hard break at textWidth", () => {
  const vrs = computeVisualRows(["abcdefghij"], 4);
  assertEquals(vrs.length, 3);
  assertEquals(vrs[0].endCol, 4);
  assertEquals(vrs[1].startCol, 4);
  assertEquals(vrs[1].endCol, 8);
  assertEquals(vrs[2].startCol, 8);
  assertEquals(vrs[2].endCol, 10);
});

Deno.test("multiple lines each get their own visual rows", () => {
  const vrs = computeVisualRows(["ab", "", "cd"], 10);
  assertEquals(vrs.length, 3);
  assertEquals(vrs[0].logicalRow, 0);
  assertEquals(vrs[1].logicalRow, 1);
  assertEquals(vrs[2].logicalRow, 2);
});

// ── findVisualRowIdx ──────────────────────────────────────────

Deno.test("cursor at start of line → first visual row", () => {
  const vrs = computeVisualRows(["hello world foo"], 8);
  assertEquals(findVisualRowIdx(vrs, 0, 0), 0);
});

Deno.test("cursor past first VR boundary → second visual row", () => {
  // "hello " is VR0 (endCol=6), "world " is VR1, "foo" is VR2
  const vrs = computeVisualRows(["hello world foo"], 8);
  assertEquals(findVisualRowIdx(vrs, 0, 6), 1);
});

Deno.test("cursor on second logical line → correct visual row index", () => {
  const vrs = computeVisualRows(["ab", "cd"], 10);
  assertEquals(findVisualRowIdx(vrs, 1, 0), 1);
});

// ── mapKeyToAction: Backspace vs Delete (the core bug) ────────

Deno.test("key.backspace=true → BACKSPACE action", () => {
  const action = mapKeyToAction("", { backspace: true }, false);
  assertEquals(action?.type, "BACKSPACE");
});

Deno.test("key.delete + rawWasBackspace=true → BACKSPACE (macOS fix)", () => {
  // Ink 5 maps \x7f to key.delete; rawWasBackspace=true identifies it as Backspace
  const action = mapKeyToAction("", { delete: true }, true);
  assertEquals(action?.type, "BACKSPACE");
});

Deno.test("key.delete + rawWasBackspace=false → DELETE (real forward-delete)", () => {
  const action = mapKeyToAction("", { delete: true }, false);
  assertEquals(action?.type, "DELETE");
});

Deno.test("key.return → NEWLINE action", () => {
  const action = mapKeyToAction("", { return: true }, false);
  assertEquals(action?.type, "NEWLINE");
});

Deno.test("printable char → INSERT_CHAR action", () => {
  const action = mapKeyToAction("a", {}, false);
  assertEquals(action?.type, "INSERT_CHAR");
  assertEquals((action as any)?.char, "a");
});

Deno.test("ctrl+s → null (handled at component level)", () => {
  const action = mapKeyToAction("s", { ctrl: true }, false);
  assertEquals(action, null);
});

Deno.test("escape → null (handled at component level)", () => {
  const action = mapKeyToAction("", { escape: true }, false);
  assertEquals(action, null);
});

Deno.test("key.leftArrow → MOVE_LEFT", () => {
  assertEquals(mapKeyToAction("", { leftArrow: true }, false)?.type, "MOVE_LEFT");
});

Deno.test("key.rightArrow → MOVE_RIGHT", () => {
  assertEquals(mapKeyToAction("", { rightArrow: true }, false)?.type, "MOVE_RIGHT");
});

Deno.test("ctrl+A → LINE_START", () => {
  assertEquals(mapKeyToAction("a", { ctrl: true }, false)?.type, "LINE_START");
});

Deno.test("ctrl+E → LINE_END", () => {
  assertEquals(mapKeyToAction("e", { ctrl: true }, false)?.type, "LINE_END");
});
