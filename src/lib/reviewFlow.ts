import React from "react";
import type {
  ReviewState,
  SynthDoneState,
  ReviewItem,
  InputKey,
} from "../types.ts";
import { runClaude } from "./runClaude.ts";
import { buildRewritePrompt, replaceItemInContent } from "./reviewUtils.ts";
import {
  makeInitialReviewState,
  advanceReviewState,
  applyReviewTypingKey,
  applyRewriteResult,
} from "./reviewFlowUtils.ts";

// Re-export pure functions so callers only need one import
export {
  makeInitialReviewState,
  advanceReviewState,
  applyReviewTypingKey,
  applyRewriteResult,
} from "./reviewFlowUtils.ts";

const { useState, useRef, useCallback } = React;

type RS = ReviewState | null;

// ── ReviewFlowHandle ────────────────────────────────────────────

export interface ReviewTargetConfig {
  outputPath: string;
  rewriteType: "req" | "adr" | "section";
  rewriteModel: string;
  ctrlRef: React.MutableRefObject<AbortController | null>;
  setError: (err: string) => void;
}

export interface ReviewFlowHandle {
  // State for rendering
  synthDone: SynthDoneState | null;
  setSynthDone: React.Dispatch<React.SetStateAction<SynthDoneState | null>>;
  review: ReviewState | null;
  // Refs for async flow control in main effect
  reviewRef: React.MutableRefObject<ReviewState | null>;
  synthDoneConfirmRef: React.MutableRefObject<((v: boolean) => void) | null>;
  reviewDoneRef: React.MutableRefObject<(() => void) | null>;
  // Ref-synced setter (for async flow and shared edit callbacks)
  setReviewSynced: (update: (prev: ReviewState | null) => ReviewState | null) => void;
  // Output path (for saveReviewEdit)
  outputPath: string;
  // User-facing callbacks
  confirmSynthDone: () => void;
  skipReview: () => void;
  advance: () => void;
  openEditor: () => void;
  startTyping: () => void;
  onType: (char: string, key: InputKey) => void;
  submitRewrite: (prompt: string) => Promise<void>;
}

// ── useReviewTarget ─────────────────────────────────────────────

export function useReviewTarget(config: ReviewTargetConfig): ReviewFlowHandle {
  const { outputPath, rewriteType, rewriteModel, ctrlRef, setError } = config;

  const [synthDone, setSynthDone] = useState<SynthDoneState | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);

  const reviewRef = useRef<ReviewState | null>(null);
  const synthDoneConfirmRef = useRef<((v: boolean) => void) | null>(null);
  const reviewDoneRef = useRef<(() => void) | null>(null);

  type RS = ReviewState | null;

  const setReviewSynced = useCallback((update: (prev: RS) => RS) => {
    setReview((prev: RS) => {
      const next = update(prev);
      reviewRef.current = next;
      return next;
    });
  }, []);

  const confirmSynthDone = useCallback(() => {
    if (synthDoneConfirmRef.current) {
      synthDoneConfirmRef.current(true);
      synthDoneConfirmRef.current = null;
    }
  }, []);

  const skipReview = useCallback(() => {
    if (synthDoneConfirmRef.current) {
      synthDoneConfirmRef.current(false);
      synthDoneConfirmRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setReviewSynced((prev: RS) => {
      if (!prev) return null;
      const next = advanceReviewState(prev);
      if (next === null) {
        reviewDoneRef.current?.();
        return null;
      }
      return next;
    });
  }, [setReviewSynced]);

  const openEditor = useCallback(() => {
    setReviewSynced((prev: RS) => prev ? { ...prev, editorOpen: true } : null);
  }, [setReviewSynced]);

  const startTyping = useCallback(() => {
    setReviewSynced((prev: RS) =>
      prev ? { ...prev, inputMode: "typing", typedInput: "", typingCursorPos: 0 } : null
    );
  }, [setReviewSynced]);

  const onType = useCallback((char: string, key: InputKey) => {
    setReviewSynced((prev: RS) => {
      if (!prev) return null;
      return applyReviewTypingKey(prev, char, key);
    });
  }, [setReviewSynced]);

  const submitRewrite = useCallback(async (userPrompt: string) => {
    const currentReview = reviewRef.current;
    if (!currentReview) return;
    const item = currentReview.items[currentReview.currentIdx];
    if (!item) return;
    const prompt = userPrompt.trim();

    // Empty rewrite prompt: exit typing mode without triggering an AI rewrite.
    if (prompt.length === 0) {
      setReviewSynced((prev: RS) =>
        prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null
      );
      return;
    }

    setReviewSynced((prev: RS) =>
      prev ? { ...prev, inputMode: "rewriting", typedInput: "", typingCursorPos: 0 } : null
    );

    try {
      const newContent = await runClaude(
        buildRewritePrompt(item, prompt, rewriteType),
        () => {},
        ctrlRef.current!.signal,
        rewriteModel,
        10,
      );
      const trimmed = newContent.trim();
      const latestReview = reviewRef.current;
      if (!latestReview) return;
      const updatedFile = replaceItemInContent(latestReview.fileContent, item.content, trimmed);
      await Deno.writeTextFile(outputPath, updatedFile);
      setReviewSynced((prev: RS) => {
        if (!prev) return null;
        return applyRewriteResult(prev, trimmed, updatedFile);
      });
    } catch (e) {
      setReviewSynced((prev: RS) =>
        prev ? { ...prev, inputMode: "none", typedInput: "", typingCursorPos: 0 } : null
      );
      if (!ctrlRef.current?.signal.aborted) setError(String(e));
    }
  }, [setReviewSynced, outputPath, rewriteType, rewriteModel, ctrlRef, setError]);

  return {
    synthDone,
    setSynthDone,
    review,
    reviewRef,
    synthDoneConfirmRef,
    reviewDoneRef,
    setReviewSynced,
    outputPath,
    confirmSynthDone,
    skipReview,
    advance,
    openEditor,
    startTyping,
    onType,
    submitRewrite,
  };
}

// ── runReviewSequence ───────────────────────────────────────────

/**
 * Encapsulates the synth-done → optional review flow used in main effects.
 * Shows the synth-done transition screen, awaits user confirmation, then
 * optionally enters review mode and awaits completion.
 */
export async function runReviewSequence(
  handle: ReviewFlowHandle,
  items: ReviewItem[],
  fileContent: string,
  options?: { existing?: boolean; alwaysReview?: boolean; signal?: AbortSignal },
): Promise<void> {
  // If already aborted, skip the entire review sequence
  if (options?.signal?.aborted) return;

  handle.setSynthDone({
    items,
    fileContent,
    ...(options?.existing ? { existing: true } : {}),
  });
  const doReview = await new Promise<boolean>((resolve) => {
    handle.synthDoneConfirmRef.current = resolve;
    // Resolve with false (skip) if the parent flow is aborted
    if (options?.signal) {
      const onAbort = () => { resolve(false); };
      if (options.signal.aborted) { resolve(false); return; }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
  handle.setSynthDone(null);

  if (options?.signal?.aborted) return;

  if ((options?.alwaysReview || doReview) && items.length > 0) {
    handle.setReviewSynced((_prev) => makeInitialReviewState(items, fileContent));
    await new Promise<void>((resolve) => {
      handle.reviewDoneRef.current = resolve;
      // Resolve immediately if the parent flow is aborted
      if (options?.signal) {
        const onAbort = () => { resolve(); };
        if (options.signal.aborted) { resolve(); return; }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    handle.setReviewSynced((_prev) => null);
  }
}

// ── useSharedEditCallbacks ──────────────────────────────────────

/**
 * Composes saveReviewEdit and cancelReviewEdit from an array of review handles.
 * Checks each handle's reviewRef for editorOpen to determine which target to save to.
 */
export function useSharedEditCallbacks(handles: ReviewFlowHandle[]): {
  saveReviewEdit: (content: string) => Promise<void>;
  cancelReviewEdit: () => void;
} {
  // Keep a ref to the latest handles array to avoid stale closure issues
  const handlesRef = useRef(handles);
  handlesRef.current = handles;

  const saveReviewEdit = useCallback(async (newContent: string) => {
    for (const handle of handlesRef.current) {
      const rev = handle.reviewRef.current;
      if (rev?.editorOpen) {
        const item = rev.items[rev.currentIdx];
        if (!item) return;
        const updatedFile = replaceItemInContent(rev.fileContent, item.content, newContent);
        await Deno.writeTextFile(handle.outputPath, updatedFile);
        handle.setReviewSynced((prev: RS) => {
          if (!prev) return null;
          const newItems = [...prev.items];
          newItems[prev.currentIdx] = { ...newItems[prev.currentIdx], content: newContent };
          return { ...prev, items: newItems, fileContent: updatedFile, editorOpen: false };
        });
        return;
      }
    }
  }, []);

  const cancelReviewEdit = useCallback(() => {
    for (const handle of handlesRef.current) {
      handle.setReviewSynced((prev: RS) => prev ? { ...prev, editorOpen: false } : null);
    }
  }, []);

  return { saveReviewEdit, cancelReviewEdit };
}
