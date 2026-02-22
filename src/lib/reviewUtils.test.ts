import { assertEquals } from "jsr:@std/assert";
import {
  parseReqs,
  parseAdrs,
  replaceItemInContent,
  parseAdrConstraints,
  buildRewritePrompt,
} from "./reviewUtils.ts";

// ── parseReqs ──────────────────────────────────────────────────

const SAMPLE_PRD = `# PRD — Mein Projekt

## Überblick

### REQ-001: Benutzer-Login
Nutzer können sich mit E-Mail und Passwort einloggen.

**Priorität:** P0
**Größe:** S

### REQ-002: Offline-Modus
Die App funktioniert auch ohne Internetverbindung.

**Priorität:** P1
**Größe:** M`;

Deno.test("parseReqs: parses two REQ sections", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items.length, 2);
});

Deno.test("parseReqs: first item has correct id and title", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[0].id, "REQ-001");
  assertEquals(items[0].title, "Benutzer-Login");
});

Deno.test("parseReqs: second item has correct id and title", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[1].id, "REQ-002");
  assertEquals(items[1].title, "Offline-Modus");
});

Deno.test("parseReqs: content includes body text", () => {
  const items = parseReqs(SAMPLE_PRD);
  assertEquals(items[0].content.includes("E-Mail und Passwort"), true);
});

Deno.test("parseReqs: empty string returns empty array", () => {
  assertEquals(parseReqs("").length, 0);
});

Deno.test("parseReqs: no REQ sections returns empty array", () => {
  assertEquals(parseReqs("# PRD\n\nKein Requirement hier.").length, 0);
});

Deno.test("parseReqs: header before first REQ is ignored", () => {
  const items = parseReqs(SAMPLE_PRD);
  // The '## Überblick' header must not appear as a parsed item
  assertEquals(items.every((i) => i.id.startsWith("REQ-")), true);
});

// ── parseAdrs ──────────────────────────────────────────────────

const SAMPLE_ARCH = `# Architektur-Entscheidungen

## ADR-001: React Native für Mobile
Wir nutzen React Native.

**Einschränkt:** REQ-001, REQ-002

## ADR-002: SQLite für Offline-Speicherung
Lokale Datenhaltung via SQLite.

**Status:** Akzeptiert
`;

Deno.test("parseAdrs: parses two ADR sections", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items.length, 2);
});

Deno.test("parseAdrs: first item has correct id and title", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items[0].id, "ADR-001");
  assertEquals(items[0].title, "React Native für Mobile");
});

Deno.test("parseAdrs: second item has correct id and title", () => {
  const items = parseAdrs(SAMPLE_ARCH);
  assertEquals(items[1].id, "ADR-002");
  assertEquals(items[1].title, "SQLite für Offline-Speicherung");
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
  const adr = "## ADR-001: Something\n\n**Einschränkt:** REQ-001, REQ-002\n\nText.";
  assertEquals(parseAdrConstraints(adr), ["REQ-001", "REQ-002"]);
});

Deno.test("parseAdrConstraints: returns empty array if no constraints", () => {
  const adr = "## ADR-002: Something\n\nKeine Einschränkung.";
  assertEquals(parseAdrConstraints(adr), []);
});

Deno.test("parseAdrConstraints: ignores non-REQ entries in constraint line", () => {
  const adr = "## ADR-003: X\n\n**Einschränkt:** REQ-005, ADR-001\n";
  const result = parseAdrConstraints(adr);
  // Only REQ-* entries should be returned
  assertEquals(result, ["REQ-005"]);
});

Deno.test("parseAdrConstraints: trims whitespace around entries", () => {
  const adr = "## ADR-004: Y\n\n**Einschränkt:**  REQ-003 ,  REQ-004 \n";
  assertEquals(parseAdrConstraints(adr), ["REQ-003", "REQ-004"]);
});

// ── buildRewritePrompt ─────────────────────────────────────────

Deno.test("buildRewritePrompt: req type includes 'Requirement' label", () => {
  const item = { id: "REQ-001", title: "Login", content: "### REQ-001: Login\nNutzer loggen sich ein." };
  const prompt = buildRewritePrompt(item, "Mach es kürzer", "req");
  assertEquals(prompt.includes("Requirement"), true);
});

Deno.test("buildRewritePrompt: adr type includes 'Architekturentscheidung' label", () => {
  const item = { id: "ADR-001", title: "React Native", content: "## ADR-001: React Native\nDetails." };
  const prompt = buildRewritePrompt(item, "Ergänze Kontext", "adr");
  assertEquals(prompt.includes("Architekturentscheidung"), true);
});

Deno.test("buildRewritePrompt: contains user instruction", () => {
  const item = { id: "REQ-001", title: "Login", content: "content" };
  const prompt = buildRewritePrompt(item, "Mach es kürzer", "req");
  assertEquals(prompt.includes("Mach es kürzer"), true);
});

Deno.test("buildRewritePrompt: contains item content", () => {
  const item = { id: "REQ-001", title: "Login", content: "### REQ-001: Login\nNutzer loggen sich ein." };
  const prompt = buildRewritePrompt(item, "Bearbeite", "req");
  assertEquals(prompt.includes("### REQ-001: Login"), true);
});
