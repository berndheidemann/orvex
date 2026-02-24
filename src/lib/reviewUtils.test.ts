import { assertEquals } from "jsr:@std/assert";
import {
  parseReqs,
  parseAdrs,
  replaceItemInContent,
  parseAdrConstraints,
  buildRewritePrompt,
} from "./reviewUtils.ts";

// ── parseReqs ──────────────────────────────────────────────────

const SAMPLE_PRD = `# PRD — My Project

## Overview

### REQ-001: User Login
Users can log in with email and password.

**Priority:** P0
**Size:** S

### REQ-002: Offline Mode
The app works without an internet connection.

**Priority:** P1
**Size:** M`;

Deno.test("parseReqs: parses two REQ sections", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items.length, 2);
});

Deno.test("parseReqs: first item has correct id and title", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[0].id, "REQ-001");
  assertEquals(items[0].title, "User Login");
});

Deno.test("parseReqs: second item has correct id and title", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[1].id, "REQ-002");
  assertEquals(items[1].title, "Offline Mode");
});

Deno.test("parseReqs: content includes body text", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[0].content.includes("email and password"), true);
});

Deno.test("parseReqs: empty string returns empty array", () => {
  assertEquals(parseReqs("").length, 0);
});

Deno.test("parseReqs: no REQ sections returns empty array", () => {
  assertEquals(parseReqs("# PRD\n\nNo requirement here.").length, 0);
});

Deno.test("parseReqs: header before first REQ is ignored", () => {
  const items = parseReqs(SAMPLE_PRD);
  // The '## Overview' header must not appear as a parsed item
  assertEquals(items.every((i) => i.id.startsWith("REQ-")), true);
});

Deno.test("parseReqs: parses REQ with em dash separator", () => {
  const prd = `### REQ-001 — User Login\nContent\n### REQ-002 — Offline Mode\nContent2`;
  const items = parseReqs(prd);
  assertEquals(items.length, 2);
  assertEquals(items[0].id, "REQ-001");
  assertEquals(items[0].title, "User Login");
  assertEquals(items[1].id, "REQ-002");
  assertEquals(items[1].title, "Offline Mode");
});

Deno.test("parseReqs: parses REQ with hyphen separator", () => {
  const prd = `### REQ-001 - Login\nContent`;
  const items = parseReqs(prd);
  assertEquals(items.length, 1);
  assertEquals(items[0].id, "REQ-001");
  assertEquals(items[0].title, "Login");
});

Deno.test("parseReqs: erkennt CONT-EXPL-001 korrekt", () => {
  const prd = `### CONT-EXPL-001: Erklaerungstext\nContent`;
  const items = parseReqs(prd);
  assertEquals(items.length, 1);
  assertEquals(items[0].id, "CONT-EXPL-001");
  assertEquals(items[0].title, "Erklaerungstext");
});

Deno.test("parseReqs: erkennt CONT-DIFF-001A mit Buchstaben-Suffix", () => {
  const prd = `### CONT-DIFF-001A: Differenzierung\nContent`;
  const items = parseReqs(prd);
  assertEquals(items.length, 1);
  assertEquals(items[0].id, "CONT-DIFF-001A");
  assertEquals(items[0].title, "Differenzierung");
});

Deno.test("parseReqs: erkennt alle CONT-Typen korrekt", () => {
  const prd = [
    "### CONT-EXPL-001: Erklaerung",
    "Content EXPL",
    "### CONT-TASK-001: Aufgabe",
    "Content TASK",
    "### CONT-DIAG-001: Diagramm",
    "Content DIAG",
    "### CONT-DIFF-001A: Differenzierung",
    "Content DIFF",
  ].join("\n");
  const items = parseReqs(prd);
  assertEquals(items.length, 4);
  assertEquals(items[0].id, "CONT-EXPL-001");
  assertEquals(items[1].id, "CONT-TASK-001");
  assertEquals(items[2].id, "CONT-DIAG-001");
  assertEquals(items[3].id, "CONT-DIFF-001A");
});

Deno.test("parseReqs: REQ-NNN bleibt unverändert in gemischtem PRD", () => {
  const prd = [
    "### CONT-EXPL-001: Erklaerung",
    "Content EXPL",
    "### REQ-001: User Login",
    "Users log in.",
    "### CONT-TASK-001: Aufgabe",
    "Content TASK",
    "### REQ-002: Dashboard",
    "Shows data.",
  ].join("\n");
  const items = parseReqs(prd);
  assertEquals(items.length, 4);
  assertEquals(items[0].id, "CONT-EXPL-001");
  assertEquals(items[1].id, "REQ-001");
  assertEquals(items[2].id, "CONT-TASK-001");
  assertEquals(items[3].id, "REQ-002");
});

// ── parseAdrs ──────────────────────────────────────────────────

const SAMPLE_ARCH = `# Architecture Decisions

## ADR-001: React Native for Mobile
We use React Native.

**Restricts:** REQ-001, REQ-002

## ADR-002: SQLite for Offline Storage
Local data persistence via SQLite.

**Status:** Accepted
`;

Deno.test("parseAdrs: parses two ADR sections", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items.length, 2);
});

Deno.test("parseAdrs: first item has correct id and title", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items[0].id, "ADR-001");
  assertEquals(items[0].title, "React Native for Mobile");
});

Deno.test("parseAdrs: second item has correct id and title", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items[1].id, "ADR-002");
  assertEquals(items[1].title, "SQLite for Offline Storage");
});

Deno.test("parseAdrs: empty string returns empty array", () => {
  assertEquals(parseAdrs("").length, 0);
});

// ── replaceItemInContent ───────────────────────────────────────

Deno.test("replaceItemInContent: replaces old content with new", () => {
  const file = "header\n### REQ-001: Foo\nold content\n### REQ-002: Bar\n";
  const result = replaceItemInContent(file, "old content", "new content");
  assertEquals(result.includes("new content"), true);
  assertEquals(result.includes("old content"), false);
});

Deno.test("replaceItemInContent: leaves unrelated content unchanged", () => {
  const file = "header\nsome text\nold section\nfooter";
  const result = replaceItemInContent(file, "old section", "new section");
  assertEquals(result.includes("header"), true);
  assertEquals(result.includes("footer"), true);
});

// ── parseAdrConstraints ────────────────────────────────────────

Deno.test("parseAdrConstraints: extracts REQ references", () => {
  const adr = "## ADR-001: Something\n\n**Restricts:** REQ-001, REQ-002\n\nText.";
  assertEquals(parseAdrConstraints(adr), ["REQ-001", "REQ-002"]);
});

Deno.test("parseAdrConstraints: returns empty array if no constraints", () => {
  const adr = "## ADR-002: Something\n\nNo restrictions.";
  assertEquals(parseAdrConstraints(adr), []);
});

Deno.test("parseAdrConstraints: ignores non-REQ entries in constraint line", () => {
  const adr = "## ADR-003: X\n\n**Restricts:** REQ-005, ADR-001\n";
  const result = parseAdrConstraints(adr);
  // Only REQ-* entries should be returned
  assertEquals(result, ["REQ-005"]);
});

Deno.test("parseAdrConstraints: trims whitespace around entries", () => {
  const adr = "## ADR-004: Y\n\n**Restricts:**  REQ-003 ,  REQ-004 \n";
  assertEquals(parseAdrConstraints(adr), ["REQ-003", "REQ-004"]);
});

// ── buildRewritePrompt ─────────────────────────────────────────

Deno.test("buildRewritePrompt: req type includes 'Requirement' label", () => {
  const item = { id: "REQ-001", title: "Login", content: "### REQ-001: Login\nUsers log in." };
  const prompt = buildRewritePrompt(item, "Make it shorter", "req");
  assertEquals(prompt.includes("Requirement"), true);
});

Deno.test("buildRewritePrompt: adr type includes 'Architecture Decision' label", () => {
  const item = { id: "ADR-001", title: "React Native", content: "## ADR-001: React Native\nDetails." };
  const prompt = buildRewritePrompt(item, "Add context", "adr");
  assertEquals(prompt.includes("Architecture Decision"), true);
});

Deno.test("buildRewritePrompt: contains user instruction", () => {
  const item = { id: "REQ-001", title: "Login", content: "content" };
  const prompt = buildRewritePrompt(item, "Make it shorter", "req");
  assertEquals(prompt.includes("Make it shorter"), true);
});

Deno.test("buildRewritePrompt: contains item content", () => {
  const item = { id: "REQ-001", title: "Login", content: "### REQ-001: Login\nUsers log in." };
  const prompt = buildRewritePrompt(item, "Edit", "req");
  assertEquals(prompt.includes("### REQ-001: Login"), true);
});

Deno.test("buildRewritePrompt: section type includes 'Section' label", () => {
  const item = { id: "SEC-01", title: "Lernziele", content: "## Lernziele\n..." };
  const prompt = buildRewritePrompt(item, "Improve", "section");
  assertEquals(prompt.includes("Section"), true);
  assertEquals(prompt.includes("Requirement"), false);
  assertEquals(prompt.includes("Architecture Decision"), false);
});

// ── parseSections ───────────────────────────────────────────────

import { parseSections } from "./reviewUtils.ts";

Deno.test("parseSections: empty content returns empty array", () => {
  assertEquals(parseSections("").length, 0);
});

Deno.test("parseSections: content without ## headings returns empty array", () => {
  const content = "# Title\n\nSome text without h2 headings.";
  assertEquals(parseSections(content).length, 0);
});

Deno.test("parseSections: single ## section", () => {
  const content = "## Lernziele\n\nSome content here.";
  const items = parseSections(content);
  assertEquals(items.length, 1);
  assertEquals(items[0].id, "SEC-01");
  assertEquals(items[0].title, "Lernziele");
  assertEquals(items[0].content.includes("Some content here"), true);
});

Deno.test("parseSections: multiple ## sections", () => {
  const content = [
    "# Document Title",
    "",
    "## Section One",
    "Content of section one.",
    "",
    "## Section Two",
    "Content of section two.",
    "",
    "## Section Three",
    "Content of section three.",
  ].join("\n");
  const items = parseSections(content);
  assertEquals(items.length, 3);
  assertEquals(items[0].id, "SEC-01");
  assertEquals(items[1].id, "SEC-02");
  assertEquals(items[2].id, "SEC-03");
  assertEquals(items[0].title, "Section One");
  assertEquals(items[1].title, "Section Two");
  assertEquals(items[2].title, "Section Three");
});

Deno.test("parseSections: section IDs are zero-padded SEC-NNN", () => {
  const lines = Array.from({ length: 9 }, (_, i) => `## Section ${i + 1}\nContent.`);
  const content = lines.join("\n\n");
  const items = parseSections(content);
  assertEquals(items[0].id, "SEC-01");
  assertEquals(items[8].id, "SEC-09");
});
