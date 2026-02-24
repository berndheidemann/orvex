import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useEduInitRunner, type EduInitConfig } from "../hooks/useEduInitRunner.ts";
import { useTerminalSize } from "../hooks/useTerminalSize.ts";
import { useRawBackspace } from "../hooks/useRawBackspace.ts";
import {
  PhaseBlockCompact,
  SynthDoneUI,
  ReviewUI,
  PHASE_COLORS,
  ROUND_SECS,
  SYNTH_SECS,
  modelShort,
} from "./InitDashboard.ts";
import { ReviewEditor } from "./ReviewEditor.ts";
import { ProgressBar } from "./ProgressBar.ts";
import { SYNTH_MODEL } from "../lib/initAgents.ts";
import type { PhaseState, RoundStatus, AgentStatus } from "../types.ts";

const { createElement: h, useState, useEffect, useRef } = React;

// ── Field definitions ──────────────────────────────────────────

interface FieldDef {
  key: keyof Omit<EduInitConfig, "model" | "didaktikRounds" | "prdRounds" | "archRounds" | "lernsituationExists" | "zeitMinuten">;
  label: string;
  placeholder: string;
  required: boolean;
}

// We handle zeitMinuten separately because it's numeric
type EduFieldKey = "fach" | "thema" | "jahrgangsstufe" | "vorwissen" | "zeitMinuten" | "heterogenitaet";
type ActiveEduField = EduFieldKey | "summary";

interface EduFieldDef {
  key: EduFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  numeric: boolean;
}

const EDU_FIELDS: EduFieldDef[] = [
  { key: "fach",           label: "Fach",                                    placeholder: "z. B. Mathematik, Deutsch, Biologie",     required: true,  numeric: false },
  { key: "thema",          label: "Thema",                                   placeholder: "z. B. Bruchrechnung, Lyrik, Fotosynthese", required: true,  numeric: false },
  { key: "jahrgangsstufe", label: "Jahrgangsstufe",                          placeholder: "z. B. 7, 10, Q1",                         required: true,  numeric: false },
  { key: "vorwissen",      label: "Vorwissen der Lernenden",                 placeholder: "z. B. Grundrechenarten beherrscht",        required: true,  numeric: false },
  { key: "zeitMinuten",    label: "Unterrichtszeit (Minuten)",               placeholder: "z. B. 45, 90",                            required: true,  numeric: true  },
  { key: "heterogenitaet", label: "Heterogenität / besondere Anforderungen", placeholder: "(optional — Enter überspringt)",           required: false, numeric: false },
];

function validateField(field: EduFieldDef, value: string): string | null {
  if (field.required && value.trim() === "") {
    return `${field.label} ist ein Pflichtfeld`;
  }
  if (field.numeric && value.trim() !== "") {
    const parsed = parseInt(value.trim(), 10);
    if (isNaN(parsed) || parsed <= 0) {
      return "Bitte eine Zahl > 0 eingeben";
    }
  }
  return null;
}

// ── EduSetup ───────────────────────────────────────────────────

function EduSetup(props: {
  onStart: (config: EduInitConfig) => void;
}): React.ReactElement {
  const { onStart } = props;
  const { columns } = useTerminalSize();

  const [values, setValues] = useState<Record<EduFieldKey, string>>({
    fach: "",
    thema: "",
    jahrgangsstufe: "",
    vorwissen: "",
    zeitMinuten: "",
    heterogenitaet: "",
  });
  const [activeField, setActiveField] = useState<ActiveEduField>("fach");
  const [error, setError] = useState("");

  const divider = "─".repeat(Math.min(columns, 60));
  const currentFieldIdx = EDU_FIELDS.findIndex((f) => f.key === activeField);
  const currentFieldDef = currentFieldIdx >= 0 ? EDU_FIELDS[currentFieldIdx] : null;

  const advanceField = () => {
    const nextIdx = currentFieldIdx + 1;
    if (nextIdx >= EDU_FIELDS.length) {
      setActiveField("summary");
    } else {
      setActiveField(EDU_FIELDS[nextIdx].key);
    }
    setError("");
  };

  useInput((input, key) => {
    if (activeField === "summary") {
      if (key.return || input === "y" || input === "j") {
        const zeitVal = parseInt(values.zeitMinuten.trim(), 10);
        onStart({
          fach: values.fach.trim(),
          thema: values.thema.trim(),
          jahrgangsstufe: values.jahrgangsstufe.trim(),
          vorwissen: values.vorwissen.trim(),
          zeitMinuten: isNaN(zeitVal) ? 45 : zeitVal,
          heterogenitaet: values.heterogenitaet.trim(),
        });
      } else if (key.escape || input === "n") {
        setValues({ fach: "", thema: "", jahrgangsstufe: "", vorwissen: "", zeitMinuten: "", heterogenitaet: "" });
        setActiveField("fach");
        setError("");
      }
      return;
    }

    if (!currentFieldDef) return;

    if (key.return) {
      const err = validateField(currentFieldDef, values[currentFieldDef.key]);
      if (err) {
        setError(err);
      } else {
        advanceField();
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValues((prev: Record<EduFieldKey, string>) => ({
        ...prev,
        [currentFieldDef.key]: prev[currentFieldDef.key].slice(0, -1),
      }));
      setError("");
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      // Numeric fields: only accept digits
      if (currentFieldDef.numeric && !/^[0-9]$/.test(input)) return;
      setValues((prev: Record<EduFieldKey, string>) => ({
        ...prev,
        [currentFieldDef.key]: prev[currentFieldDef.key] + input,
      }));
      setError("");
    }
  });

  if (activeField === "summary") {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(
        Box,
        { flexDirection: "row", gap: 2 },
        h(Text, { bold: true, color: "cyan" }, "Orvex"),
        h(Text, { dimColor: true }, "—"),
        h(Text, { dimColor: true }, "Edu-Init — Zusammenfassung"),
      ),
      h(Text, { dimColor: true }, divider),
      h(Box, { flexDirection: "column", marginTop: 1 },
        ...EDU_FIELDS.map((f) =>
          h(
            Box,
            { key: f.key, flexDirection: "row", gap: 1, marginBottom: 0 },
            h(Text, { dimColor: true }, `${f.label}:`),
            h(Text, {}, ` ${values[f.key] || "(leer)"}`),
          )
        ),
      ),
      h(Text, { dimColor: true }, ""),
      h(Text, { dimColor: true }, divider),
      h(Text, { dimColor: true }, "  [Enter / y] Start    [Esc / n] Neustart"),
    );
  }

  const fieldIdx = EDU_FIELDS.findIndex((f) => f.key === activeField);

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, `Edu-Init — Feld ${fieldIdx + 1} / ${EDU_FIELDS.length}`),
    ),
    h(Text, { dimColor: true }, divider),
    h(Box, { flexDirection: "column", marginTop: 1, marginBottom: 1 },
      h(
        Text,
        { bold: true, color: "yellow" },
        currentFieldDef?.label ?? "",
      ),
      currentFieldDef
        ? h(Text, { dimColor: true }, `  ${currentFieldDef.placeholder}`)
        : null,
      h(
        Box,
        { flexDirection: "row", marginTop: 0 },
        h(Text, { color: "yellow" }, "▶ "),
        h(Text, {}, (values[activeField as EduFieldKey] ?? "") + "█"),
      ),
      error
        ? h(Text, { color: "red" }, `  ⚠  ${error}`)
        : null,
    ),
    // Completed fields above
    fieldIdx > 0
      ? h(Box, { flexDirection: "column", marginTop: 1 },
          h(Text, { dimColor: true }, "Bisherige Eingaben:"),
          ...EDU_FIELDS.slice(0, fieldIdx).map((f) =>
            h(
              Box,
              { key: f.key, flexDirection: "row", gap: 1 },
              h(Text, { dimColor: true }, `  ${f.label}:`),
              h(Text, {}, ` ${values[f.key] || "(leer)"}`),
            )
          ),
        )
      : null,
    h(Text, { dimColor: true }, ""),
    h(Text, { dimColor: true }, divider),
    h(Text, { dimColor: true },
      currentFieldDef?.required
        ? "[Enter] Weiter    [Backspace] Löschen"
        : "[Enter] Weiter (oder überspringen)    [Backspace] Löschen",
    ),
  );
}

// ── EduRunner ──────────────────────────────────────────────────

function EduRunner(props: {
  config: EduInitConfig;
  onDone?: () => void;
}): React.ReactElement {
  const { config, onDone } = props;
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const rawWasBackspace = useRawBackspace();
  const state = useEduInitRunner(config);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const leftWidth = Math.min(32, Math.max(22, Math.floor(columns * 0.35)));
  const rightWidth = columns - leftWidth - 1;
  const liveHeight = Math.max(5, rows - 8);

  const hasAgentStreams = state.agentStreams.length > 0;
  const runningPhase = state.phases.find((p) => p.status === "running");
  const runningRound = runningPhase?.rounds.find((r) => r.status === "running");
  const streamAgents = runningRound?.agents ?? [];

  const agentSectionHeight = hasAgentStreams ? streamAgents.length + 1 : 0;
  const summaryHeight = Math.max(0, liveHeight - agentSectionHeight);
  const visibleLines = state.liveLines.slice(-summaryHeight);

  const divider = "─".repeat(Math.min(columns, 60));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setElapsed(0);
    if (!state.activeLabel) return;
    const id = setInterval(() => setElapsed((s: number) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state.activeLabel]);

  useEffect(() => {
    if (state.done) {
      const t = setTimeout(() => onDone ? onDone() : exit(), 400);
      return () => clearTimeout(t);
    }
  }, [state.done]);

  useInput((input, key) => {
    const fixedKey = { ...key, backspace: key.backspace || (key.delete && rawWasBackspace.current) };

    // LernSituation review editor handles its own input
    if (state.lernSituationReview?.editorOpen) return;

    // LernSituation synth-done
    if (state.lernSituationSynthDone) {
      if (key.return || input === "y" || input === "j") state.confirmLernSituationSynthDone();
      else if (state.lernSituationSynthDone.existing && (key.escape || input === "n")) state.skipLernSituationReview();
      return;
    }

    // LernSituation review
    if (state.lernSituationReview) {
      if (state.lernSituationReview.inputMode === "none") {
        if (key.return) { state.advanceLernSituationReview(); return; }
        if (input === "e") { state.openLernSituationReviewEditor(); return; }
        if (input === "r") { state.startLernSituationReviewTyping(); return; }
      } else if (state.lernSituationReview.inputMode === "typing") {
        if (key.return) { state.submitLernSituationReviewRewrite(state.lernSituationReview.typedInput); return; }
        state.onLernSituationReviewType(input, fixedKey);
      }
      return;
    }

    // PRD review editor handles its own input
    if (state.prdReview?.editorOpen) return;

    // PRD synth-done
    if (state.prdSynthDone) {
      if (key.return || input === "y" || input === "j") state.confirmPrdSynthDone();
      else if (state.prdSynthDone.existing && (key.escape || input === "n")) state.skipPrdReview();
      return;
    }

    // PRD review
    if (state.prdReview) {
      if (state.prdReview.inputMode === "none") {
        if (key.return) { state.advancePrdReview(); return; }
        if (input === "e") { state.openPrdReviewEditor(); return; }
        if (input === "r") { state.startPrdReviewTyping(); return; }
      } else if (state.prdReview.inputMode === "typing") {
        if (key.return) { state.submitPrdReviewRewrite(state.prdReview.typedInput); return; }
        state.onPrdReviewType(input, fixedKey);
      }
      return;
    }

    // Arch review editor handles its own input
    if (state.archReview?.editorOpen) return;

    // Arch synth-done
    if (state.archSynthDone) {
      if (key.return || input === "y" || input === "j") state.confirmArchSynthDone();
      else if (key.escape || input === "n") state.skipArchReview();
      return;
    }

    // Arch review
    if (state.archReview) {
      if (state.archReview.inputMode === "none") {
        if (key.return) { state.advanceArchReview(); return; }
        if (input === "e") { state.openArchReviewEditor(); return; }
        if (input === "r") { state.startArchReviewTyping(); return; }
      } else if (state.archReview.inputMode === "typing") {
        if (key.return) { state.submitArchReviewRewrite(state.archReview.typedInput); return; }
        state.onArchReviewType(input, fixedKey);
      }
      return;
    }
  });

  // ── Early-return screens ───────────────────────────────────

  if (state.done) {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { bold: true, color: "green" }, "✓  Edu-Init complete"),
      h(Text, { dimColor: true }, "Saving files…"),
    );
  }

  if (state.error) {
    return h(
      Box,
      { flexDirection: "column", padding: 1 },
      h(Text, { color: "red", bold: true }, "⚠  Error"),
      h(Text, {}, state.error),
      state.liveLines.length > 0
        ? h(
            Box,
            { flexDirection: "column", marginTop: 1 },
            h(Text, { dimColor: true }, "Last output:"),
            ...state.liveLines.map((line, i) =>
              h(Text, { key: String(i), dimColor: true, wrap: "truncate" }, line)
            ),
          )
        : null,
    );
  }

  // LernSituation synth-done
  if (state.lernSituationSynthDone) {
    return h(SynthDoneUI, { type: "lernsituation", state: state.lernSituationSynthDone });
  }

  // LernSituation review editor
  if (state.lernSituationReview?.editorOpen) {
    const item = state.lernSituationReview.items[state.lernSituationReview.currentIdx];
    if (item) {
      return h(ReviewEditor, {
        title: item.id,
        initialContent: item.content,
        onSave: state.saveReviewEdit,
        onCancel: state.cancelReviewEdit,
      });
    }
  }

  // LernSituation review
  if (state.lernSituationReview) {
    return h(ReviewUI, { review: state.lernSituationReview, type: "lernsituation" });
  }

  // PRD synth-done
  if (state.prdSynthDone) {
    return h(SynthDoneUI, { type: "prd", state: state.prdSynthDone });
  }

  // PRD review editor
  if (state.prdReview?.editorOpen) {
    const item = state.prdReview.items[state.prdReview.currentIdx];
    if (item) {
      return h(ReviewEditor, {
        title: item.id,
        initialContent: item.content,
        onSave: state.saveReviewEdit,
        onCancel: state.cancelReviewEdit,
      });
    }
  }

  // PRD review
  if (state.prdReview) {
    return h(ReviewUI, { review: state.prdReview, type: "prd" });
  }

  // Arch synth-done
  if (state.archSynthDone) {
    return h(SynthDoneUI, { type: "arch", state: state.archSynthDone });
  }

  // Arch review editor
  if (state.archReview?.editorOpen) {
    const item = state.archReview.items[state.archReview.currentIdx];
    if (item) {
      return h(ReviewEditor, {
        title: item.id,
        initialContent: item.content,
        onSave: state.saveReviewEdit,
        onCancel: state.cancelReviewEdit,
      });
    }
  }

  // Arch review
  if (state.archReview) {
    return h(ReviewUI, { review: state.archReview, type: "arch" });
  }

  // ── Normal dashboard ───────────────────────────────────────

  const descLabel = `${config.fach}: ${config.thema} — Jg. ${config.jahrgangsstufe}`;
  const descPreview = descLabel.length > columns - 20
    ? descLabel.slice(0, columns - 23) + "…"
    : descLabel;

  const leftBarWidth = Math.max(4, leftWidth - 8);
  const splitDivider = "─".repeat(leftWidth) + "┬" + "─".repeat(rightWidth);
  const splitFooter = "─".repeat(leftWidth) + "┴" + "─".repeat(rightWidth);
  const model = config.model ?? "claude-opus-4-6";

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { flexDirection: "row", gap: 2 },
      h(Text, { bold: true, color: "cyan" }, "Orvex"),
      h(Text, { dimColor: true }, "—"),
      h(Text, { dimColor: true }, "Edu-Projekt Setup"),
    ),
    h(Text, { dimColor: true }, divider),
    h(
      Box,
      { paddingLeft: 1, marginBottom: 0 },
      h(Text, { dimColor: true }, "Thema: "),
      h(Text, {}, descPreview),
    ),
    h(Text, { dimColor: true }, splitDivider),
    h(
      Box,
      { flexDirection: "row" },
      h(
        Box,
        { flexDirection: "column", width: leftWidth },
        ...state.phases.map((phase) =>
          h(PhaseBlockCompact, { key: phase.id, phase, barWidth: leftBarWidth, now, model })
        ),
      ),
      h(Text, { dimColor: true }, "│"),
      h(
        Box,
        { flexDirection: "column", width: rightWidth, paddingLeft: 1 },
        state.activeLabel
          ? h(
              Box,
              { flexDirection: "row", gap: 1 },
              h(Text, { color: "yellow", bold: true }, state.activeLabel),
              h(Text, { dimColor: true }, `(${elapsed}s)`),
            )
          : null,
        state.activeLabel
          ? h(Text, { dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2)))
          : null,
        state.agentWarnLevel === "yellow"
          ? h(Text, { color: "yellow" }, "⚠  Taking longer than usual — Claude is still thinking…")
          : state.agentWarnLevel === "red"
          ? h(Text, { color: "red", bold: true }, "⚠  Very long wait — Claude may have an issue, but a result can still arrive. [Ctrl+C] to cancel.")
          : null,
        ...(() => {
          const result: React.ReactElement[] = [];

          if (visibleLines.length > 0) {
            visibleLines.forEach((line, i) =>
              result.push(h(Text, { key: `l${i}`, wrap: "truncate" }, line))
            );
          }

          if (hasAgentStreams && streamAgents.length > 0) {
            if (result.length > 0) {
              result.push(h(Text, { key: "sdiv", dimColor: true }, "─".repeat(Math.max(0, rightWidth - 2))));
            }
            streamAgents.forEach((agent, i) => {
              const stream = state.agentStreams[i] ?? "";
              const maxTextWidth = rightWidth - agent.name.length - 6;
              result.push(
                h(Box, { key: `ag${i}`, flexDirection: "row", gap: 1 },
                  h(Text, { color: agent.status === "done" ? "green" : "yellow" },
                    agent.status === "done" ? "✓" : "▶"),
                  h(Text, { bold: agent.status === "running" }, agent.name),
                  h(Text, { dimColor: true, wrap: "truncate" },
                    stream ? `  ${stream.slice(0, maxTextWidth)}` : "  …"),
                )
              );
            });
          }

          return result;
        })(),
      ),
    ),
    h(Text, { dimColor: true }, splitFooter),
  );
}

// ── EduInitDashboard ───────────────────────────────────────────

export function EduInitDashboard(props: {
  lernsituationExists: boolean;
  onDone?: () => void;
}): React.ReactElement {
  const { lernsituationExists, onDone } = props;
  const [config, setConfig] = useState<EduInitConfig | null>(null);

  if (!config) {
    return h(EduSetup, { onStart: setConfig });
  }

  return h(EduRunner, {
    config: { ...config, lernsituationExists },
    onDone,
  });
}
