import { assertEquals } from "jsr:@std/assert";
import { applyTypingKey } from "./typingLogic.ts";

Deno.test("applyTypingKey: append regular char", () => {
  assertEquals(applyTypingKey("he", "l", {}), "hel");
});

Deno.test("applyTypingKey: append char to empty string", () => {
  assertEquals(applyTypingKey("", "a", {}), "a");
});

Deno.test("applyTypingKey: backspace deletes last char", () => {
  assertEquals(applyTypingKey("hello", "", { backspace: true }), "hell");
});

Deno.test("applyTypingKey: backspace on empty string is safe", () => {
  assertEquals(applyTypingKey("", "", { backspace: true }), "");
});

Deno.test("applyTypingKey: key.delete without backspace flag is no-op (Forward-Delete)", () => {
  // key.delete=true but key.backspace=false → caller did not set backspace (rawWasBackspace=false)
  assertEquals(applyTypingKey("abc", "", { delete: true }), "abc");
});

Deno.test("applyTypingKey: key.delete + backspace=true → delete last char (macOS fix)", () => {
  // After useRawBackspace fix: caller sets key.backspace=true when raw '\x7f' was seen
  assertEquals(applyTypingKey("abc", "", { delete: true, backspace: true }), "ab");
});

Deno.test("applyTypingKey: ctrl+key is ignored", () => {
  assertEquals(applyTypingKey("abc", "c", { ctrl: true }), "abc");
});

Deno.test("applyTypingKey: meta+key is ignored", () => {
  assertEquals(applyTypingKey("abc", "b", { meta: true }), "abc");
});

Deno.test("applyTypingKey: return key is ignored", () => {
  assertEquals(applyTypingKey("abc", "\r", { return: true }), "abc");
});

Deno.test("applyTypingKey: escape is ignored", () => {
  assertEquals(applyTypingKey("abc", "", { escape: true }), "abc");
});

Deno.test("applyTypingKey: empty char without special key is no-op", () => {
  assertEquals(applyTypingKey("abc", "", {}), "abc");
});

Deno.test("applyTypingKey: append special chars like space", () => {
  assertEquals(applyTypingKey("hello", " ", {}), "hello ");
});

Deno.test("applyTypingKey: append unicode chars", () => {
  assertEquals(applyTypingKey("caf", "é", {}), "café");
});
