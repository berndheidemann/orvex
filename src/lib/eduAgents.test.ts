import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DIDAKTIK_AGENTS,
  EDU_PRD_AGENTS,
  Fachsystematiker,
  LernprozessAdvokat,
  RealitaetsConstraintAgent,
  Fachlehrkraft,
  Lerndesigner,
  DidaktikAnalyst,
  makeEduPhases,
  buildDidaktikPrompt,
  buildDrehbuchPrompt,
  buildEduPrdPrompt,
} from "./eduAgents.ts";

// ── Agent array tests ───────────────────────────────────────────

Deno.test("DIDAKTIK_AGENTS has 3 agents", () => {
  assertEquals(DIDAKTIK_AGENTS.length, 3);
});

Deno.test("EDU_PRD_AGENTS has 3 agents", () => {
  assertEquals(EDU_PRD_AGENTS.length, 3);
});

Deno.test("DIDAKTIK_AGENTS agent names", () => {
  assertEquals(DIDAKTIK_AGENTS[0].name, "Fachsystematiker");
  assertEquals(DIDAKTIK_AGENTS[1].name, "Lernprozess-Advokat");
  assertEquals(DIDAKTIK_AGENTS[2].name, "Realitäts-Constraint-Agent");
});

Deno.test("EDU_PRD_AGENTS agent names", () => {
  assertEquals(EDU_PRD_AGENTS[0].name, "Fachlehrkraft");
  assertEquals(EDU_PRD_AGENTS[1].name, "Lerndesigner");
  assertEquals(EDU_PRD_AGENTS[2].name, "Didaktik-Analyst");
});

// ── Named exports ───────────────────────────────────────────────

Deno.test("Named exports: Fachsystematiker exists", () => {
  assert(Fachsystematiker !== undefined);
  assertEquals(Fachsystematiker.name, "Fachsystematiker");
});

Deno.test("Named exports: LernprozessAdvokat exists", () => {
  assert(LernprozessAdvokat !== undefined);
  assertEquals(LernprozessAdvokat.name, "Lernprozess-Advokat");
});

Deno.test("Named exports: RealitaetsConstraintAgent exists", () => {
  assert(RealitaetsConstraintAgent !== undefined);
  assertEquals(RealitaetsConstraintAgent.name, "Realitäts-Constraint-Agent");
});

Deno.test("Named exports: Fachlehrkraft exists", () => {
  assert(Fachlehrkraft !== undefined);
  assertEquals(Fachlehrkraft.name, "Fachlehrkraft");
});

Deno.test("Named exports: Lerndesigner exists", () => {
  assert(Lerndesigner !== undefined);
  assertEquals(Lerndesigner.name, "Lerndesigner");
});

Deno.test("Named exports: DidaktikAnalyst exists", () => {
  assert(DidaktikAnalyst !== undefined);
  assertEquals(DidaktikAnalyst.name, "Didaktik-Analyst");
});

// ── makeEduPhases tests ─────────────────────────────────────────

Deno.test("makeEduPhases(2,2,2) returns 3 phases", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases.length, 3);
});

Deno.test("makeEduPhases: IDs are didaktik, prd, arch", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[0].id, "didaktik");
  assertEquals(phases[1].id, "prd");
  assertEquals(phases[2].id, "arch");
});

Deno.test("makeEduPhases: first phase starts running", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[0].status, "running");
});

Deno.test("makeEduPhases: prd and arch phases start pending", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[1].status, "pending");
  assertEquals(phases[2].status, "pending");
});

Deno.test("makeEduPhases: didaktik has rounds + synthesis", () => {
  const phases = makeEduPhases(2, 2, 2);
  // 2 debate rounds + 1 synthesis = 3 total
  assertEquals(phases[0].rounds.length, 3);
});

Deno.test("makeEduPhases: prd has rounds + synthesis", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[1].rounds.length, 3);
});

Deno.test("makeEduPhases: arch has rounds + synthesis", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[2].rounds.length, 3);
});

Deno.test("makeEduPhases: didaktik outputPath is LERNSITUATION.md", () => {
  const phases = makeEduPhases(2, 2, 2);
  assertEquals(phases[0].outputPath, "LERNSITUATION.md");
});

Deno.test("makeEduPhases(1,1,1) works with different round counts", () => {
  const phases = makeEduPhases(1, 1, 1);
  assertEquals(phases.length, 3);
  assertEquals(phases[0].rounds.length, 2); // 1 round + synthesis
});

// ── buildDidaktikPrompt tests ───────────────────────────────────

Deno.test("buildDidaktikPrompt(0, 0, ...) returns non-empty string", () => {
  const result = buildDidaktikPrompt(0, 0, "Fach: Chemie, Jahrgangsstufe: 9", [], 2);
  assert(result.length > 0);
});

Deno.test("buildDidaktikPrompt round 0 contains lernkontext", () => {
  const result = buildDidaktikPrompt(0, 0, "Fach: Chemie, Jahrgangsstufe: 9", [], 2);
  assert(result.includes("Fach: Chemie"));
});

Deno.test("buildDidaktikPrompt round 0 contains German output directive", () => {
  const result = buildDidaktikPrompt(0, 0, "Fach: Chemie", [], 2);
  assert(result.includes("Output language: German"));
});

Deno.test("buildDidaktikPrompt synthesis contains 'Bloom'", () => {
  const result = buildDidaktikPrompt(2, 0, "Fach: Chemie", [["out1", "out2", "out3"], ["out1", "out2", "out3"]], 2);
  assert(result.includes("Bloom"), "synthesis prompt must contain 'Bloom'");
});

Deno.test("buildDidaktikPrompt synthesis contains 'Backward Design'", () => {
  const result = buildDidaktikPrompt(2, 0, "Fach: Chemie", [["out1", "out2", "out3"], ["out1", "out2", "out3"]], 2);
  assert(result.includes("Backward Design"), "synthesis prompt must contain 'Backward Design'");
});

Deno.test("buildDidaktikPrompt synthesis contains 'Differenzierung'", () => {
  const result = buildDidaktikPrompt(2, 0, "Fach: Chemie", [["out1", "out2", "out3"], ["out1", "out2", "out3"]], 2);
  assert(result.includes("Differenzierung"), "synthesis prompt must contain 'Differenzierung'");
});

Deno.test("buildDidaktikPrompt synthesis contains German output directive", () => {
  const result = buildDidaktikPrompt(2, 0, "Fach: Chemie", [[], []], 2);
  assert(result.includes("Output language: German"));
});

Deno.test("buildDidaktikPrompt follow-up round includes previous outputs", () => {
  const allOutputs = [["Agent A said X", "Agent B said Y", "Agent C said Z"]];
  const result = buildDidaktikPrompt(1, 0, "Fach: Chemie", allOutputs, 2);
  assert(result.includes("Agent B said Y"));
});

// ── buildDrehbuchPrompt tests ───────────────────────────────────

Deno.test("buildDrehbuchPrompt returns non-empty string", () => {
  const result = buildDrehbuchPrompt("# Lernsituation\n\n## Lernziele\n- Verstehen");
  assert(result.length > 0);
});

Deno.test("buildDrehbuchPrompt contains lernsituation content", () => {
  const result = buildDrehbuchPrompt("# Lernsituation\n\nLernziele: Verstehen");
  assert(result.includes("Lernziele: Verstehen"));
});

Deno.test("buildDrehbuchPrompt contains German output directive", () => {
  const result = buildDrehbuchPrompt("# Lernsituation...");
  assert(result.includes("Output language: German"));
});

Deno.test("buildDrehbuchPrompt mentions lernpfad.md output structure", () => {
  const result = buildDrehbuchPrompt("# Lernsituation...");
  assert(result.includes("lernpfad.md") || result.includes("Lernpfad"));
});

// ── buildEduPrdPrompt tests ─────────────────────────────────────

Deno.test("buildEduPrdPrompt(0, 0, ...) returns non-empty string", () => {
  const result = buildEduPrdPrompt(0, 0, "context...", [], 2);
  assert(result.length > 0);
});

Deno.test("buildEduPrdPrompt round 0 contains German output directive", () => {
  const result = buildEduPrdPrompt(0, 0, "context...", [], 2);
  assert(result.includes("Output language: German"));
});

Deno.test("buildEduPrdPrompt synthesis contains German output directive", () => {
  const result = buildEduPrdPrompt(2, 0, "context...", [[], []], 2);
  assert(result.includes("Output language: German"));
});

Deno.test("buildEduPrdPrompt synthesis mentions CONT-* types", () => {
  const result = buildEduPrdPrompt(2, 0, "context...", [[], []], 2);
  assert(result.includes("CONT-EXPL") || result.includes("CONT-TASK"));
});

Deno.test("buildEduPrdPrompt round 0 contains combinedContext", () => {
  const result = buildEduPrdPrompt(0, 0, "Lernziele: Verstehen von Säure-Base", [], 2);
  assert(result.includes("Lernziele: Verstehen von Säure-Base"));
});
