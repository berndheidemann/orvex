import { assertEquals } from "jsr:@std/assert";
import {
  advanceReviewState,
  applyReviewTypingKey,
  makeInitialReviewState,
  applyRewriteResult,
} from "./reviewFlowUtils.ts";
import type { ReviewItem, ReviewState } from "../types.ts";

const ITEMS: ReviewItem[] = [
  { id: "REQ-001", title: "Login", content: "### REQ-001: Login\nContent A." },
  { id: "REQ-002", title: "Dashboard", content: "### REQ-002: Dashboard\nContent B." },
];

function makeState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    items: ITEMS,
    currentIdx: 0,
    inputMode: "none",
    typedInput: "",
    typingCursorPos: 0,
    editorOpen: false,
    fileContent: "full file content",
    ...overrides,
  };
}

// ── makeInitialReviewState ──────────────────────────────────────

Deno.test("makeInitialReviewState: returns correct default shape", () => {
  const state = makeInitialReviewState(ITEMS, "file content");
  assertEquals(state.items, ITEMS);
  assertEquals(state.currentIdx, 0);
  assertEquals(state.inputMode, "none");
  assertEquals(state.typedInput, "");
  assertEquals(state.typingCursorPos, 0);
  assertEquals(state.editorOpen, false);
  assertEquals(state.fileContent, "file content");
});

// ── advanceReviewState ─────────────────────────────────────────

Deno.test("advanceReviewState: returns next index when not at end", () => {
  const state = makeState({ currentIdx: 0 });
  const next = advanceReviewState(state);
  assertEquals(next?.currentIdx, 1);
});

Deno.test("advanceReviewState: returns null when at last item", () => {
  const state = makeState({ currentIdx: 1 }); // ITEMS has length 2
  const next = advanceReviewState(state);
  assertEquals(next, null);
});

Deno.test("advanceReviewState: resets inputMode, typedInput, typingCursorPos", () => {
  const state = makeState({ currentIdx: 0, inputMode: "typing", typedInput: "hello", typingCursorPos: 3 });
  const next = advanceReviewState(state);
  assertEquals(next?.inputMode, "none");
  assertEquals(next?.typedInput, "");
  assertEquals(next?.typingCursorPos, 0);
});

// ── applyReviewTypingKey ────────────────────────────────────────

Deno.test("applyReviewTypingKey: no-op when inputMode !== 'typing'", () => {
  const state = makeState({ inputMode: "none" });
  const result = applyReviewTypingKey(state, "a", {});
  assertEquals(result, state);
});

Deno.test("applyReviewTypingKey: escape resets to 'none' mode", () => {
  const state = makeState({ inputMode: "typing", typedInput: "abc", typingCursorPos: 3 });
  const result = applyReviewTypingKey(state, "", { escape: true });
  assertEquals(result.inputMode, "none");
  assertEquals(result.typedInput, "");
  assertEquals(result.typingCursorPos, 0);
});

Deno.test("applyReviewTypingKey: regular character inserted at cursor", () => {
  const state = makeState({ inputMode: "typing", typedInput: "", typingCursorPos: 0 });
  const result = applyReviewTypingKey(state, "x", {});
  assertEquals(result.typedInput, "x");
  assertEquals(result.typingCursorPos, 1);
});

// ── applyRewriteResult ─────────────────────────────────────────

Deno.test("applyRewriteResult: updates item content at currentIdx", () => {
  const state = makeState({ currentIdx: 0 });
  const result = applyRewriteResult(state, "new content", "updated file");
  assertEquals(result.items[0].content, "new content");
  assertEquals(result.items[1].content, ITEMS[1].content); // other item unchanged
});

Deno.test("applyRewriteResult: updates fileContent", () => {
  const state = makeState({ currentIdx: 0 });
  const result = applyRewriteResult(state, "new content", "updated file");
  assertEquals(result.fileContent, "updated file");
});

Deno.test("applyRewriteResult: resets inputMode, typedInput, typingCursorPos", () => {
  const state = makeState({ inputMode: "rewriting", typedInput: "anything", typingCursorPos: 5 });
  const result = applyRewriteResult(state, "new", "file");
  assertEquals(result.inputMode, "none");
  assertEquals(result.typedInput, "");
  assertEquals(result.typingCursorPos, 0);
});
