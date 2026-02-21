import React from "react";
import { useInput } from "ink";

const { useState, useEffect, useCallback } = React;

// Paths resolved relative to this file: src/hooks/ → ../../.agent/
const PAUSE_FLAG_PATH = new URL(
  "../../.agent/pause.flag",
  import.meta.url,
).pathname;

const CONTROL_FIFO_PATH = new URL(
  "../../.agent/control.fifo",
  import.meta.url,
).pathname;

const CONTEXT_PATH = new URL(
  "../../.agent/context.md",
  import.meta.url,
).pathname;

export interface ControlState {
  paused: boolean;
  lastAction: string | null;
  editorOpen: boolean;
}

export function useKeyboardControls(): ControlState {
  const [paused, setPaused] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [pendingEditor, setPendingEditor] = useState<boolean>(false);

  // On mount: sync initial paused state from filesystem
  useEffect(() => {
    Deno.stat(PAUSE_FLAG_PATH).then(() => {
      setPaused(true);
    }).catch(() => {
      // File doesn't exist → not paused, that's fine
    });
  }, []);

  const showAction = useCallback((msg: string) => {
    setLastAction(msg);
    setTimeout(() => setLastAction(null), 3000);
  }, []);

  // Launch editor blockingly via effect (allows async/await, sets editorOpen flag)
  useEffect(() => {
    if (!pendingEditor) return;
    const editor = Deno.env.get("EDITOR");
    if (!editor) {
      showAction("editor-no-env");
      setPendingEditor(false);
      return;
    }
    setEditorOpen(true);
    void (async () => {
      try {
        const proc = new Deno.Command(editor, {
          args: [CONTEXT_PATH],
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        }).spawn();
        await proc.status;
      } finally {
        setEditorOpen(false);
        showAction("editor-opened");
        setPendingEditor(false);
      }
    })();
  }, [pendingEditor, showAction]);

  useInput((input, _key) => {
    switch (input) {
      case "p": {
        setPaused((prev: boolean) => {
          const next = !prev;
          if (next) {
            // Create pause flag
            Deno.writeTextFile(PAUSE_FLAG_PATH, "").catch(() => {});
          } else {
            // Remove pause flag
            Deno.remove(PAUSE_FLAG_PATH).catch(() => {});
          }
          return next;
        });
        break;
      }

      case "s": {
        // Write "skip" to control FIFO via shell to avoid blocking on open()
        new Deno.Command("bash", {
          args: ["-c", `echo skip > "${CONTROL_FIFO_PATH}" 2>/dev/null || true`],
          stdin: "null",
          stdout: "null",
          stderr: "null",
        }).spawn();
        showAction("skip-sent");
        break;
      }

      case "e": {
        // Guard: don't open a second editor if one is already running
        if (!pendingEditor && !editorOpen) {
          setPendingEditor(true);
        }
        break;
      }

      default:
        // Unknown keys: no effect
        break;
    }
  });

  return { paused, lastAction, editorOpen };
}
