import React from "react";
import { Box, Text, useInput } from "ink";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";

const { createElement: h, useState } = React;

type ActiveField = "description" | "model" | "prdRounds" | "archRounds";

export interface InitConfig {
  description: string;
  model: string;
  prdRounds: number;
  archRounds: number;
  archNote?: string; // optional focus/context for arch agents (archOnly mode)
}

const MODELS = [
  {
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    desc: "Höchste Qualität · empfohlen für PRD & Architektur",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    desc: "Stark & schnell · günstiger",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    desc: "Schnellstes Modell · günstigstes",
  },
] as const;

const ROUND_EXPLANATIONS = {
  prd: [
    "Product Manager, UX Researcher und Business Analyst",
    "analysieren dein Thema unabhängig, dann reagieren sie",
    "aufeinander. Die Synthese erstellt PRD.md.",
    "→ 3 Runden: bei komplexen oder widersprüchlichen Ideen",
  ],
  arch: [
    "Software-Architekt, Senior Developer und DevOps Engineer",
    "entwickeln eine Architektur auf Basis des PRD.",
    "Die Synthese erstellt architecture.md.",
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
      h(Text, { color: active ? "yellow" : undefined, bold: active }, "Modell:"),
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
      `  1 Runde ≈ 2–3 min  ·  ${value} Runde${value > 1 ? "n" : ""} ≈ ${timeMin}–${timeMax} min`),
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
  const [activeField, setActiveField] = useState<ActiveField>("description");
  const [error, setError] = useState("");

  const divider = "─".repeat(Math.min(columns, 60));

  const tryStart = () => {
    onStart({
      description: description.trim() ||
        "Lies die Projektidee aus vorhandenen Dateien im Projektverzeichnis.",
      model: MODELS[modelIdx].id,
      prdRounds,
      archRounds,
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
      if (key.tab) {
        setActiveField("description");
      } else if (key.return) {
        tryStart();
      } else if (key.leftArrow || input === "-") {
        setArchRounds((r: number) => Math.max(1, r - 1));
      } else if (key.rightArrow || input === "+") {
        setArchRounds((r: number) => Math.min(5, r + 1));
      } else if (/^[1-5]$/.test(input)) {
        setArchRounds(Number(input));
      }
    }
  });

  const hint =
    activeField === "description"
      ? "[Enter / Tab] Weiter    [Backspace] Löschen"
      : activeField === "model"
      ? "[Enter / Tab] Weiter    [← →] Modell wechseln    [1–3] direkt wählen"
      : activeField === "prdRounds"
      ? "[Enter / Tab] Weiter    [← →] Runden    [1–5] direkt eingeben"
      : "[Enter] Starten    [Tab] Erstes Feld    [← →] Runden    [1–5] direkt eingeben";

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    // Header
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Neues Projekt einrichten"),
    ),
    h(Text, { dimColor: true }, divider),
    // Description
    h(
      Box,
      { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(
        Text,
        { bold: activeField === "description", color: activeField === "description" ? "yellow" : undefined },
        "Projektbeschreibung:",
      ),
      h(Text, { dimColor: true }, "  Liegt die Idee bereits in einer .txt- oder .md-Datei im Projektordner,"),
      h(Text, { dimColor: true }, "  kann dieses Feld leer bleiben — die Agenten finden sie automatisch."),
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
      label: "PRD-Diskussionsrunden:",
      value: prdRounds,
      active: activeField === "prdRounds",
      explanation: ROUND_EXPLANATIONS.prd,
    }),
    // Arch rounds
    h(RoundsSelector, {
      label: "Architektur-Diskussionsrunden:",
      value: archRounds,
      active: activeField === "archRounds",
      explanation: ROUND_EXPLANATIONS.arch,
    }),
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

  const skipHint = onSkip ? "    [Esc] Überspringen" : "";
  const hint =
    activeField === "note"
      ? `[Enter / Tab] Weiter    [Backspace] Löschen${skipHint}`
      : activeField === "model"
      ? `[Enter / Tab] Weiter    [← →] Modell wechseln    [1–3] direkt wählen${skipHint}`
      : `[Enter] Starten    [Tab] Zum ersten Feld    [← →] Runden    [1–5] direkt eingeben${skipHint}`;

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    // Header
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Architektur generieren"),
    ),
    h(Text, { dimColor: true }, divider),
    // PRD info
    h(
      Box,
      { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(Text, {}, `PRD.md gefunden: ${prdTitle}`),
      h(Text, { dimColor: true },
        "Software-Architekt, Senior Developer und DevOps Engineer"),
      h(Text, { dimColor: true },
        "analysieren das PRD und entwerfen eine Architektur."),
    ),
    // Note / focus field
    h(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      h(
        Text,
        { bold: activeField === "note", color: activeField === "note" ? "yellow" : undefined },
        "Hinweis / Fokus:  (optional)",
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
      label: "Diskussionsrunden:",
      value: archRounds,
      active: activeField === "archRounds",
      explanation: ROUND_EXPLANATIONS.arch,
    }),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true }, hint),
  );
}
