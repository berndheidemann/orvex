import React from "react";
import { useInput } from "ink";
import { useEduInitRunner, type EduInitConfig } from "../hooks/useEduInitRunner.ts";
import { useRawBackspace } from "../hooks/useRawBackspace.ts";
import {
  RunnerDashboard,
  SynthDoneUI,
  ReviewUI,
} from "./InitDashboard.ts";
import { ReviewEditor } from "./ReviewEditor.ts";
import { EduSetup } from "./EduSetup.ts";
import { useProjectContext } from "../hooks/useProjectContext.ts";

const { createElement: h, useState } = React;

// ── EduRunner ──────────────────────────────────────────────────

function EduRunner(props: {
  config: EduInitConfig;
  onDone?: () => void;
}): React.ReactElement {
  const { config, onDone } = props;
  const rawWasBackspace = useRawBackspace();
  const state = useEduInitRunner(config);

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

  const descText = `${config.fach}: ${config.thema} — Jg. ${config.jahrgangsstufe}`;

  return h(RunnerDashboard, {
    phases: state.phases,
    liveLines: state.liveLines,
    agentStreams: state.agentStreams,
    activeLabel: state.activeLabel,
    agentWarnLevel: state.agentWarnLevel,
    done: state.done,
    error: state.error,
    subtitle: "Edu-Projekt Setup",
    descLabel: "Thema: ",
    descText,
    model: config.model ?? "claude-opus-4-6",
    doneMessage: "✓  Edu-Init complete",
    onDone,
  });
}

// ── EduInitDashboard ───────────────────────────────────────────

export function EduInitDashboard(props: {
  lernsituationExists: boolean;
  onDone?: () => void;
}): React.ReactElement {
  const { lernsituationExists, onDone } = props;
  const [config, setConfig] = useState<EduInitConfig | null>(null);
  const projectContext = useProjectContext();

  if (!config) {
    return h(EduSetup, { onStart: setConfig, projectContext });
  }

  return h(EduRunner, {
    config: { ...config, lernsituationExists },
    onDone,
  });
}
