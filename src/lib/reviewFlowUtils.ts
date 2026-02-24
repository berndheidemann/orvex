import type { ReviewState, ReviewItem, InputKey } from "../types.ts";
import { applyTypingKey } from "./typingLogic.ts";

/** Construct the initial ReviewState for entering review mode. */
export function makeInitialReviewState(
  items: ReviewItem[],
  fileContent: string,
): ReviewState {
  return {
    items,
    currentIdx: 0,
    inputMode: "none",
    typedInput: "",
    typingCursorPos: 0,
    editorOpen: false,
    fileContent,
  };
}

/** Advance to the next item. Returns null if at the last item. */
export function advanceReviewState(state: ReviewState): ReviewState | null {
  if (state.currentIdx + 1 >= state.items.length) return null;
  return {
    ...state,
    currentIdx: state.currentIdx + 1,
    inputMode: "none",
    typedInput: "",
    typingCursorPos: 0,
  };
}

/**
 * Apply a typing key to review state.
 * No-op if inputMode !== "typing".
 * Handles escape (reset to "none" mode) and delegates to applyTypingKey.
 */
export function applyReviewTypingKey(
  state: ReviewState,
  char: string,
  key: InputKey,
): ReviewState {
  if (state.inputMode !== "typing") return state;
  if (key.escape) return { ...state, inputMode: "none", typedInput: "", typingCursorPos: 0 };
  const ts = applyTypingKey({ text: state.typedInput, cursor: state.typingCursorPos }, char, key);
  return { ...state, typedInput: ts.text, typingCursorPos: ts.cursor };
}

/** Apply a completed rewrite to review state — updates item, resets input fields. */
export function applyRewriteResult(
  state: ReviewState,
  trimmedContent: string,
  updatedFile: string,
): ReviewState {
  const newItems = [...state.items];
  newItems[state.currentIdx] = { ...newItems[state.currentIdx], content: trimmedContent };
  return {
    ...state,
    items: newItems,
    fileContent: updatedFile,
    inputMode: "none",
    typedInput: "",
    typingCursorPos: 0,
  };
}
