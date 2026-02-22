import type { InputKey } from "../types.ts";

/**
 * The state of a single-line text input with a movable cursor.
 */
export interface TypingState {
  text: string;
  cursor: number; // 0 … text.length
}

/**
 * Pure function: applies a single keystroke to a TypingState.
 *
 * key.backspace must already be corrected by the caller via useRawBackspace:
 *   backspace: key.backspace || (key.delete && rawWasBackspace.current)
 *
 * Handles: backspace (cursor-aware), left/right arrows, regular chars.
 * Escape is NOT handled here — callers deal with mode transitions themselves.
 */
export function applyTypingKey(
  state: TypingState,
  char: string,
  key: InputKey,
): TypingState {
  const { text, cursor } = state;

  if (key.backspace) {
    if (cursor === 0) return state;
    return {
      text: text.slice(0, cursor - 1) + text.slice(cursor),
      cursor: cursor - 1,
    };
  }

  if (key.leftArrow) {
    return { text, cursor: Math.max(0, cursor - 1) };
  }

  if (key.rightArrow) {
    return { text, cursor: Math.min(text.length, cursor + 1) };
  }

  if (char && !key.ctrl && !key.meta && !key.return && !key.escape) {
    return {
      text: text.slice(0, cursor) + char + text.slice(cursor),
      cursor: cursor + 1,
    };
  }

  return state;
}
