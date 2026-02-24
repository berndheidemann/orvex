import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseReqBlocks } from "./useReqDetails.ts";

Deno.test("parseReqBlocks: empty string returns empty map", () => {
  assertEquals(parseReqBlocks(""), {});
});

Deno.test("parseReqBlocks: no REQ headings returns empty map", () => {
  assertEquals(parseReqBlocks("# Title\nSome text\n## Subtitle\nMore text"), {});
});

Deno.test("parseReqBlocks: single REQ block", () => {
  const text = "### REQ-001: My Title\n\n- **Priority:** P0\n\nDescription text";
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result), ["REQ-001"]);
  assertEquals(result["REQ-001"].startsWith("### REQ-001: My Title"), true);
  assertEquals(result["REQ-001"].includes("Description text"), true);
});

Deno.test("parseReqBlocks: multiple REQ blocks", () => {
  const text = [
    "### REQ-001: First",
    "Priority P0",
    "",
    "### REQ-002: Second",
    "Priority P1",
  ].join("\n");
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result).sort(), ["REQ-001", "REQ-002"]);
  assertEquals(result["REQ-001"].includes("First"), true);
  assertEquals(result["REQ-002"].includes("Second"), true);
  // REQ-001 block should not contain REQ-002 heading
  assertEquals(result["REQ-001"].includes("REQ-002"), false);
});

Deno.test("parseReqBlocks: blocks separated by --- horizontal rule", () => {
  const text = [
    "---",
    "",
    "### REQ-001: Alpha",
    "Content A",
    "",
    "---",
    "",
    "### REQ-002: Beta",
    "Content B",
  ].join("\n");
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result).sort(), ["REQ-001", "REQ-002"]);
  assertEquals(result["REQ-001"].includes("Content A"), true);
  assertEquals(result["REQ-002"].includes("Content B"), true);
});

Deno.test("parseReqBlocks: RF- prefix", () => {
  const text = "### RF-009: Focus Mode\n\nDescription";
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result), ["RF-009"]);
  assertEquals(result["RF-009"].startsWith("### RF-009: Focus Mode"), true);
});

Deno.test("parseReqBlocks: CONT- prefix", () => {
  const text = "### CONT-EXPL-001: Content Exploration\n\nContent here";
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result), ["CONT-EXPL-001"]);
  assertEquals(result["CONT-EXPL-001"].includes("Content Exploration"), true);
});

Deno.test("parseReqBlocks: mixed REQ, RF and CONT prefixes", () => {
  const text = [
    "### REQ-001: A REQ",
    "Priority P0",
    "",
    "### RF-001: A Refactor",
    "Priority P1",
    "",
    "### CONT-EXPL-001: Content",
    "Priority P2",
  ].join("\n");
  const result = parseReqBlocks(text);
  assertEquals(Object.keys(result).sort(), ["CONT-EXPL-001", "REQ-001", "RF-001"]);
});

Deno.test("parseReqBlocks: block includes metadata and acceptance criteria", () => {
  const text = [
    "### REQ-017: Dashboard Overlay",
    "",
    "- **Priority:** P1",
    "- **Size:** M",
    "- **Status:** done",
    "",
    "#### Problem",
    "Some problem description.",
    "",
    "#### Acceptance Criteria",
    "- [x] Criterion one",
    "- [ ] Criterion two",
  ].join("\n");
  const result = parseReqBlocks(text);
  const block = result["REQ-017"];
  assertEquals(block.includes("Priority"), true);
  assertEquals(block.includes("Acceptance Criteria"), true);
  assertEquals(block.includes("[x] Criterion one"), true);
  assertEquals(block.includes("[ ] Criterion two"), true);
});

Deno.test("parseReqBlocks: heading text preserved at start of value", () => {
  const text = "### REQ-042: Some Title\nContent";
  const result = parseReqBlocks(text);
  assertEquals(result["REQ-042"].startsWith("### REQ-042: Some Title"), true);
});

Deno.test("parseReqBlocks: trailing whitespace trimmed", () => {
  const text = "### REQ-001: Title\nContent\n\n\n";
  const result = parseReqBlocks(text);
  assertEquals(result["REQ-001"].endsWith("\n"), false);
  assertEquals(result["REQ-001"].endsWith(" "), false);
});
