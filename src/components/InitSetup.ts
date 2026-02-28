import React from "react";
import { Box, Text, useInput } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";

const { createElement: h, useState } = React;

type ActiveField = "description" | "model" | "prdRounds" | "archRounds" | "appType";

export interface InitConfig {
  description: string;
  model: string;
  prdRounds: number;
  archRounds: number;
  appType: string;
  archNote?: string; // optional focus/context for arch agents (archOnly mode)
}

const MODELS = [
  {
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    desc: "Highest quality · recommended for PRD & Architecture",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    desc: "Strong & fast · cheaper",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    desc: "Fastest model · most affordable",
  },
] as const;

const ROUND_EXPLANATIONS = {
  prd: [
    "Product Manager, UX Researcher and Business Analyst",
    "analyze your topic independently, then respond to",
    "each other. The synthesis creates PRD.md.",
    "→ 3 rounds: for complex or conflicting ideas",
  ],
  arch: [
    "Software Architect, Senior Developer and DevOps Engineer",
    "develop an architecture based on the PRD.",
    "The synthesis creates architecture.md.",
  ],
};

function ModelSelector(props: {
  modelIdx: number;
  active: boolean;
}): React.ReactElement {
  const { modelIdx, active } = props;
  const model = MODELS[modelIdx];
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 1 },
      h(Text, { color: active ? "yellow" : undefined, bold: active }, "Model:"),
      h(Text, { color: active ? "yellow" : "white", bold: true },
        `  ← ${model.label} →`),
    ),
    h(Text, { dimColor: true }, `  ${model.desc}`),
    h(Text, { dimColor: true },
      `  ${MODELS.map((m, i) => i === modelIdx ? `[${m.label}]` : m.label).join("  ·  ")}`),
  );
}

function RoundsSelector(props: {
  label: string;
  value: number;
  active: boolean;
  explanation: string[];
}): React.ReactElement {
  const { label, value, active, explanation } = props;
  const timeMin = value * 2;
  const timeMax = value * 3;

  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 1 },
      h(Text, { color: active ? "yellow" : undefined, bold: active }, label),
      h(Text, { color: active ? "yellow" : "white", bold: true },
        `  ← ${value} →`),
    ),
    ...explanation.map((line, i) =>
      h(Text, { key: String(i), dimColor: true }, `  ${line}`)
    ),
    h(Text, { dimColor: true },
      `  1 round ≈ 2–3 min  ·  ${value} round${value > 1 ? "s" : ""} ≈ ${timeMin}–${timeMax} min`),
  );
}

export function InitSetup(props: {
  onStart: (config: InitConfig) => void;
}): React.ReactElement {
  const { onStart } = props;
  const { columns } = useTerminalSize();
  const [description, setDescription] = useState("");
  const [modelIdx, setModelIdx] = useState(0);
  const [prdRounds, setPrdRounds] = useState(2);
  const [archRounds, setArchRounds] = useState(3);
  const [appType, setAppType] = useState("web");
  const [activeField, setActiveField] = useState<ActiveField>("description");
  const [error, setError] = useState("");

  const divider = "─".repeat(Math.min(columns, 60));

  const tryStart = () => {
    onStart({
      description: description.trim() ||
        "Read the project idea from existing files in the project directory.",
      model: MODELS[modelIdx].id,
      prdRounds,
      archRounds,
      appType: appType.trim() || "web",
    });
  };

  useInput((input, key) => {
    if (activeField === "description") {
      if (key.tab) {
        setActiveField("model");
      } else if (key.return) {
        setActiveField("model");
      } else if (key.backspace || key.delete) {
        setDescription((d: string) => d.slice(0, -1));
        setError("");
      } else if (input && !key.ctrl && !key.meta) {
        setDescription((d: string) => d + input);
        setError("");
      }
    } else if (activeField === "model") {
      if (key.tab || key.return) {
        setActiveField("prdRounds");
      } else if (key.leftArrow || input === "-") {
        setModelIdx((i: number) => (i - 1 + MODELS.length) % MODELS.length);
      } else if (key.rightArrow || input === "+") {
        setModelIdx((i: number) => (i + 1) % MODELS.length);
      } else if (input === "1") setModelIdx(0);
      else if (input === "2") setModelIdx(1);
      else if (input === "3") setModelIdx(2);
    } else if (activeField === "prdRounds") {
      if (key.tab || key.return) {
        setActiveField("archRounds");
      } else if (key.leftArrow || input === "-") {
        setPrdRounds((r: number) => Math.max(1, r - 1));
      } else if (key.rightArrow || input === "+") {
        setPrdRounds((r: number) => Math.min(5, r + 1));
      } else if (/^[1-5]$/.test(input)) {
        setPrdRounds(Number(input));
      }
    } else if (activeField === "archRounds") {
      if (key.tab || key.return) {
        setActiveField("appType");
      } else if (key.leftArrow || input === "-") {
        setArchRounds((r: number) => Math.max(1, r - 1));
      } else if (key.rightArrow || input === "+") {
        setArchRounds((r: number) => Math.min(5, r + 1));
      } else if (/^[1-5]$/.test(input)) {
        setArchRounds(Number(input));
      }
    } else if (activeField === "appType") {
      if (key.tab) {
        setActiveField("description");
      } else if (key.return) {
        tryStart();
      } else if (key.backspace || key.delete) {
        setAppType((t: string) => t.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setAppType((t: string) => t + input);
      }
    }
  });

  const hint =
    activeField === "description"
      ? "[Enter / Tab] Next    [Backspace] Delete"
      : activeField === "model"
      ? "[Enter / Tab] Next    [← →] Switch model    [1–3] select directly"
      : activeField === "prdRounds"
      ? "[Enter / Tab] Next    [← →] Rounds    [1–5] enter directly"
      : activeField === "archRounds"
      ? "[Enter / Tab] Next    [← →] Rounds    [1–5] enter directly"
      : "[Enter] Start    [Tab] First field    [Backspace] Delete";

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    // Header
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Set up new project"),
    ),
    h(Text, { dimColor: true }, divider),
    // Description
    h(
      Box,
      { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(
        Text,
        { bold: activeField === "description", color: activeField === "description" ? "yellow" : undefined },
        "Project description:",
      ),
      h(Text, { dimColor: true }, "  If the idea already exists as a .txt or .md file in the project folder,"),
      h(Text, { dimColor: true }, "  this field can stay empty — agents will find it automatically."),
      h(
        Box,
        { flexDirection: "row" },
        h(Text, { color: "yellow" }, activeField === "description" ? "▶ " : "  "),
        h(Text, {}, description + (activeField === "description" ? "█" : "")),
      ),
      error ? h(Text, { color: "red" }, `  ⚠  ${error}`) : null,
    ),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true }, ""),
    // Model selector
    h(ModelSelector, {
      modelIdx,
      active: activeField === "model",
    }),
    // PRD rounds
    h(RoundsSelector, {
      label: "PRD discussion rounds:",
      value: prdRounds,
      active: activeField === "prdRounds",
      explanation: ROUND_EXPLANATIONS.prd,
    }),
    // Arch rounds
    h(RoundsSelector, {
      label: "Architecture discussion rounds:",
      value: archRounds,
      active: activeField === "archRounds",
      explanation: ROUND_EXPLANATIONS.arch,
    }),
    // App type
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(
        Text,
        { bold: activeField === "appType", color: activeField === "appType" ? "yellow" : undefined },
        "App type:",
      ),
      h(Text, { dimColor: true }, "  web · android · ios · react-native · flutter · desktop · backend · api"),
      h(
        Box,
        { flexDirection: "row" },
        h(Text, { color: "yellow" }, activeField === "appType" ? "▶ " : "  "),
        h(Text, {}, (appType || "web") + (activeField === "appType" ? "█" : "")),
      ),
    ),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true }, hint),
  );
}

// ── ArchSetup ──────────────────────────────────────────────────
// Shown when an existing PRD.md is found but architecture.md is missing.
// Lets the user configure model, rounds, and optional focus note.

type ArchActiveField = "note" | "model" | "archRounds";

export function ArchSetup(props: {
  prdTitle: string;
  onStart: (config: InitConfig) => void;
  onSkip?: () => void;
}): React.ReactElement {
  const { prdTitle, onStart, onSkip } = props;
  const { columns } = useTerminalSize();
  const [note, setNote] = useState("");
  const [modelIdx, setModelIdx] = useState(0);
  const [archRounds, setArchRounds] = useState(3);
  const [activeField, setActiveField] = useState<ArchActiveField>("note");

  const divider = "─".repeat(Math.min(columns, 60));

  useInput((input, key) => {
    if (key.escape && onSkip) { onSkip(); return; }

    if (activeField === "note") {
      if (key.tab || key.return) {
        setActiveField("model");
      } else if (key.backspace || key.delete) {
        setNote((n: string) => n.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setNote((n: string) => n + input);
      }
    } else if (activeField === "model") {
      if (key.tab || key.return) {
        setActiveField("archRounds");
      } else if (key.leftArrow || input === "-") {
        setModelIdx((i: number) => (i - 1 + MODELS.length) % MODELS.length);
      } else if (key.rightArrow || input === "+") {
        setModelIdx((i: number) => (i + 1) % MODELS.length);
      } else if (input === "1") setModelIdx(0);
      else if (input === "2") setModelIdx(1);
      else if (input === "3") setModelIdx(2);
    } else if (activeField === "archRounds") {
      if (key.tab) {
        setActiveField("note");
      } else if (key.return) {
        onStart({
          description: prdTitle,
          model: MODELS[modelIdx].id,
          prdRounds: 0,
          archRounds,
          appType: "web",
          archNote: note.trim() || undefined,
        });
      } else if (key.leftArrow || input === "-") {
        setArchRounds((r: number) => Math.max(1, r - 1));
      } else if (key.rightArrow || input === "+") {
        setArchRounds((r: number) => Math.min(5, r + 1));
      } else if (/^[1-5]$/.test(input)) {
        setArchRounds(Number(input));
      }
    }
  });

  const skipHint = onSkip ? "    [Esc] Skip" : "";
  const hint =
    activeField === "note"
      ? `[Enter / Tab] Next    [Backspace] Delete${skipHint}`
      : activeField === "model"
      ? `[Enter / Tab] Next    [← →] Switch model    [1–3] select directly${skipHint}`
      : `[Enter] Start    [Tab] First field    [← →] Rounds    [1–5] enter directly${skipHint}`;

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    // Header
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Generate architecture"),
    ),
    h(Text, { dimColor: true }, divider),
    // PRD info
    h(
      Box,
      { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(Text, {}, `PRD.md found: ${prdTitle}`),
      h(Text, { dimColor: true },
        "Software Architect, Senior Developer and DevOps Engineer"),
      h(Text, { dimColor: true },
        "analyze the PRD and design an architecture."),
    ),
    // Note / focus field
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(
        Text,
        { bold: activeField === "note", color: activeField === "note" ? "yellow" : undefined },
        "Note / Focus:  (optional)",
      ),
      h(
        Box,
        { flexDirection: "row" },
        h(Text, { color: "yellow" }, activeField === "note" ? "▶ " : "  "),
        h(Text, {}, note + (activeField === "note" ? "█" : "")),
      ),
    ),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true }, ""),
    // Model selector
    h(ModelSelector, { modelIdx, active: activeField === "model" }),
    // Arch rounds
    h(RoundsSelector, {
      label: "Discussion rounds:",
      value: archRounds,
      active: activeField === "archRounds",
      explanation: ROUND_EXPLANATIONS.arch,
    }),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true }, hint),
  );
}
