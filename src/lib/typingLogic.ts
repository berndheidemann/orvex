import type { InputKey } from "../types.ts";

/**
 * Pure function: applies a single keystroke to a typed input string.
 *
 * key.backspace must already be corrected by the caller via useRawBackspace:
 *   backspace: key.backspace || (key.delete && rawWasBackspace.current)
 *
 * Returns the new typedInput string (unchanged if key is not handled here).
 * Escape is not handled here — callers deal with mode transitions themselves.
 */
export function applyTypingKey(
  typedInput: string,
  char: string,
  key: InputKey,
): string {
  if (key.backspace) return typedInput.slice(0, -1);
  if (char && !key.ctrl && !key.meta && !key.return && !key.escape) {
    return typedInput + char;
  }
  return typedInput;
}
