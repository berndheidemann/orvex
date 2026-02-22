import { assertEquals } from "jsr:@std/assert";
import { applyTypingKey, type TypingState } from "./typingLogic.ts";

// Helper
function ts(text: string, cursor: number): TypingState {
  return { text, cursor };
}

// ── Insert ─────────────────────────────────────────────────────

Deno.test("insert: append char at end", () => {
  const result = applyTypingKey(ts("he", 2), "l", {});
  assertEquals(result, ts("hel", 3));
});

Deno.test("insert: insert char in middle", () => {
  const result = applyTypingKey(ts("hllo", 1), "e", {});
  assertEquals(result, ts("hello", 2));
});

Deno.test("insert: insert at start", () => {
  const result = applyTypingKey(ts("ello", 0), "h", {});
  assertEquals(result, ts("hello", 1));
});

Deno.test("insert: append to empty string", () => {
  const result = applyTypingKey(ts("", 0), "a", {});
  assertEquals(result, ts("a", 1));
});

Deno.test("insert: space char", () => {
  const result = applyTypingKey(ts("hello", 5), " ", {});
  assertEquals(result, ts("hello ", 6));
});

Deno.test("insert: unicode char", () => {
  const result = applyTypingKey(ts("caf", 3), "é", {});
  assertEquals(result, ts("café", 4));
});

// ── Backspace ──────────────────────────────────────────────────

Deno.test("backspace: deletes char before cursor", () => {
  const result = applyTypingKey(ts("hello", 5), "", { backspace: true });
  assertEquals(result, ts("hell", 4));
});

Deno.test("backspace: deletes char in middle", () => {
  // cursor after 'e': "helo" → cursor at 2
  const result = applyTypingKey(ts("hello", 2), "", { backspace: true });
  assertEquals(result, ts("hllo", 1));
});

Deno.test("backspace: at cursor=0 is no-op", () => {
  const state = ts("abc", 0);
  assertEquals(applyTypingKey(state, "", { backspace: true }), state);
});

Deno.test("backspace: on empty string is no-op", () => {
  const state = ts("", 0);
  assertEquals(applyTypingKey(state, "", { backspace: true }), state);
});

Deno.test("backspace: key.delete + backspace=true → deletes char before cursor (macOS fix)", () => {
  // InitDashboard sets backspace=true when rawWasBackspace detected
  const result = applyTypingKey(ts("abc", 3), "", { delete: true, backspace: true });
  assertEquals(result, ts("ab", 2));
});

Deno.test("backspace: key.delete without backspace=true is no-op (Forward-Delete not handled)", () => {
  // forward-delete key — caller doesn't set backspace=true, and we don't handle delete here
  const state = ts("abc", 2);
  assertEquals(applyTypingKey(state, "", { delete: true }), state);
});

// ── Arrow keys ─────────────────────────────────────────────────

Deno.test("leftArrow: moves cursor one step left", () => {
  const result = applyTypingKey(ts("hello", 3), "", { leftArrow: true });
  assertEquals(result, ts("hello", 2));
});

Deno.test("leftArrow: at cursor=0 is no-op", () => {
  const state = ts("hello", 0);
  assertEquals(applyTypingKey(state, "", { leftArrow: true }), state);
});

Deno.test("rightArrow: moves cursor one step right", () => {
  const result = applyTypingKey(ts("hello", 2), "", { rightArrow: true });
  assertEquals(result, ts("hello", 3));
});

Deno.test("rightArrow: at end of text is no-op", () => {
  const state = ts("hello", 5);
  assertEquals(applyTypingKey(state, "", { rightArrow: true }), state);
});

Deno.test("rightArrow: on empty string is no-op", () => {
  const state = ts("", 0);
  assertEquals(applyTypingKey(state, "", { rightArrow: true }), state);
});

// ── Ignored keys ───────────────────────────────────────────────

Deno.test("ctrl+key is no-op", () => {
  const state = ts("abc", 2);
  assertEquals(applyTypingKey(state, "c", { ctrl: true }), state);
});

Deno.test("meta+key is no-op", () => {
  const state = ts("abc", 2);
  assertEquals(applyTypingKey(state, "b", { meta: true }), state);
});

Deno.test("return key is no-op", () => {
  const state = ts("abc", 3);
  assertEquals(applyTypingKey(state, "\r", { return: true }), state);
});

Deno.test("escape is no-op", () => {
  const state = ts("abc", 1);
  assertEquals(applyTypingKey(state, "", { escape: true }), state);
});

Deno.test("empty char without special key is no-op", () => {
  const state = ts("abc", 3);
  assertEquals(applyTypingKey(state, "", {}), state);
});
