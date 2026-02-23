import { assertEquals, assertMatch } from "jsr:@std/assert";
import {
  makePhases,
  extractKernthese,
  formatRoundSummary,
  formatSynthesisSummary,
  PRD_AGENTS,
  ARCH_AGENTS,
} from "./initAgents.ts";

// ── makePhases ─────────────────────────────────────────────────

Deno.test("makePhases: returns two phases (prd + arch)", () => {
  const phases = makePhases(3, 3);
  assertEquals(phases.length, 2);
  assertEquals(phases[0].id, "prd");
  assertEquals(phases[1].id, "arch");
});

Deno.test("makePhases: prd has correct number of rounds + synthesis", () => {
  const phases = makePhases(2, 3);
  // 2 discussion rounds + 1 synthesis = 3 rounds total
  assertEquals(phases[0].rounds.length, 3);
});

Deno.test("makePhases: arch has correct number of rounds + synthesis", () => {
  const phases = makePhases(2, 4);
  // 4 discussion rounds + 1 synthesis = 5 rounds total
  assertEquals(phases[1].rounds.length, 5);
});

Deno.test("makePhases: synthesis round has single 'Writer' agent", () => {
  const phases = makePhases(1, 1);
  const synthRound = phases[0].rounds[phases[0].rounds.length - 1];
  assertEquals(synthRound.label, "Synthesis");
  assertEquals(synthRound.agents.length, 1);
  assertEquals(synthRound.agents[0].name, "Writer");
});

Deno.test("makePhases: prd phase starts with status 'running'", () => {
  const phases = makePhases(3, 3);
  assertEquals(phases[0].status, "running");
});

Deno.test("makePhases: arch phase starts with status 'pending'", () => {
  const phases = makePhases(3, 3);
  assertEquals(phases[1].status, "pending");
});

Deno.test("makePhases: all agents start as 'pending'", () => {
  const phases = makePhases(2, 2);
  for (const phase of phases) {
    for (const round of phase.rounds) {
      for (const agent of round.agents) {
        assertEquals(agent.status, "pending");
      }
    }
  }
});

// ── extractKernthese ───────────────────────────────────────────

Deno.test("extractKernthese: extracts <k>…</k> tag content", () => {
  const output = "Preamble\n<k>\n• Point A\n• Point B\n</k>\nRest";
  const result = extractKernthese(output);
  assertEquals(result.includes("Point A"), true);
  assertEquals(result.includes("Point B"), true);
});

Deno.test("extractKernthese: prefers <k> tag over bullet points", () => {
  const output = "<k>Tag content</k>\n• Bullet outside";
  assertEquals(extractKernthese(output), "Tag content");
});

Deno.test("extractKernthese: falls back to bullet points when no <k> tag", () => {
  const output = "Introduction\n• Point 1\n• Point 2\n\nRunning text";
  const result = extractKernthese(output);
  assertEquals(result.includes("Point 1"), true);
});

Deno.test("extractKernthese: falls back to numbered list", () => {
  const output = "Introduction\n1. First point\n2. Second point\n\nRunning text";
  const result = extractKernthese(output);
  assertEquals(result.includes("First point"), true);
});

Deno.test("extractKernthese: falls back to first non-empty non-heading lines", () => {
  const output = "# Title\n\nThis is a long sentence with more than twenty characters here.\n\nAnother sentence.";
  const result = extractKernthese(output);
  assertEquals(result.includes("long sentence"), true);
});

Deno.test("extractKernthese: returns '—' for empty output", () => {
  assertEquals(extractKernthese(""), "—");
});

// ── formatRoundSummary ─────────────────────────────────────────

Deno.test("formatRoundSummary: returns array of strings", () => {
  const lines = formatRoundSummary(1, PRD_AGENTS, ["out1", "out2", "out3"]);
  assertEquals(Array.isArray(lines), true);
  assertEquals(lines.length > 0, true);
});

Deno.test("formatRoundSummary: includes round number in header", () => {
  const lines = formatRoundSummary(2, PRD_AGENTS, ["x", "y", "z"]);
  assertMatch(lines[0], /Round 2/);
});

Deno.test("formatRoundSummary: includes agent names", () => {
  const lines = formatRoundSummary(1, PRD_AGENTS, ["o1", "o2", "o3"]);
  const allText = lines.join("\n");
  assertEquals(allText.includes("Product Manager"), true);
  assertEquals(allText.includes("UX Researcher"), true);
  assertEquals(allText.includes("Business Analyst"), true);
});

Deno.test("formatRoundSummary: extracts kernthese from agent output with <k> tag", () => {
  const outputs = [
    "<k>Key insight of the Product Manager</k>",
    "• Bullet point of the Researcher",
    "• Bullet point of the Analyst",
  ];
  const lines = formatRoundSummary(1, PRD_AGENTS, outputs);
  const allText = lines.join("\n");
  assertEquals(allText.includes("Key insight"), true);
});

// ── formatSynthesisSummary ─────────────────────────────────────

Deno.test("formatSynthesisSummary: prd — returns array of strings", () => {
  const synthOut = "### REQ-001: Login\nDetails\n### REQ-002: Logout\nDetails";
  const lines = formatSynthesisSummary(synthOut, "prd");
  assertEquals(Array.isArray(lines), true);
});

Deno.test("formatSynthesisSummary: prd — includes REQ entries", () => {
  const synthOut = "### REQ-001: User Login\nDetails\n### REQ-002: Offline Mode\nDetails";
  const lines = formatSynthesisSummary(synthOut, "prd");
  const allText = lines.join("\n");
  assertEquals(allText.includes("REQ-001"), true);
  assertEquals(allText.includes("REQ-002"), true);
});

Deno.test("formatSynthesisSummary: prd — no REQ sections returns fallback", () => {
  const lines = formatSynthesisSummary("No requirement here.", "prd");
  const allText = lines.join("\n");
  assertEquals(allText.includes("no REQ sections found"), true);
});

Deno.test("formatSynthesisSummary: arch — returns array of strings", () => {
  const synthOut = "## ADR-001: React Native\nDetails\n## ADR-002: SQLite\nDetails";
  const lines = formatSynthesisSummary(synthOut, "arch");
  assertEquals(Array.isArray(lines), true);
});

Deno.test("formatSynthesisSummary: arch — includes ADR entries", () => {
  const synthOut = "## ADR-001: React Native\nDetails\n## ADR-002: SQLite\nDetails";
  const lines = formatSynthesisSummary(synthOut, "arch");
  const allText = lines.join("\n");
  assertEquals(allText.includes("ADR-001"), true);
  assertEquals(allText.includes("ADR-002"), true);
});

Deno.test("ARCH_AGENTS: has 3 agents", () => {
  assertEquals(ARCH_AGENTS.length, 3);
});

Deno.test("PRD_AGENTS: has 3 agents", () => {
  assertEquals(PRD_AGENTS.length, 3);
});
