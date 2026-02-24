import React from "react";
import { useApp, useInput } from "ink";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect, useCallback } = React;

const PAUSE_FLAG_PATH = `${AGENT_DIR}/pause.flag`;
const CONTROL_FIFO_PATH = `${AGENT_DIR}/control.fifo`;

export interface ControlState {
  paused: boolean;
  lastAction: string | null;
  editingContext: boolean;
  quitting: boolean;
  closeEditor: () => void;
}

export function useKeyboardControls(): ControlState {
  const { exit } = useApp();
  const [paused, setPaused] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [editingContext, setEditingContext] = useState<boolean>(false);
  const [quitting, setQuitting] = useState<boolean>(false);

  // On mount: sync initial paused state from filesystem
  useEffect(() => {
    Deno.stat(PAUSE_FLAG_PATH).then(() => setPaused(true)).catch(() => {});
  }, []);

  const showAction = useCallback((msg: string) => {
    setLastAction(msg);
    setTimeout(() => setLastAction(null), 3000);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingContext(false);
    showAction("editor-closed");
  }, [showAction]);

  // Main keyboard handler — inactive while editor or quitting
  useInput((input, key) => {
    switch (input) {
      case "p": {
        setPaused((prev: boolean) => {
          const next = !prev;
          if (next) {
            Deno.writeTextFile(PAUSE_FLAG_PATH, "").catch(() => {});
          } else {
            Deno.remove(PAUSE_FLAG_PATH).catch(() => {});
          }
          return next;
        });
        break;
      }

      case "s": {
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
        setEditingContext(true);
        break;
      }

      case "q": {
        setQuitting(true);
        // Send SIGTERM to the loop process so it can clean up gracefully.
        // The loop writes its PID to .agent/loop.lock and handles TERM via trap.
        // We then poll until the lock file disappears (loop stopped) before
        // calling exit(), so the background process is truly gone when the TUI closes.
        const LOCK = `${AGENT_DIR}/loop.lock`;
        const MAX_WAIT_MS = 10_000;
        const pollUntilGone = (deadline: number) => {
          if (Date.now() > deadline) { exit(); return; }
          Deno.stat(LOCK)
            .then(() => setTimeout(() => pollUntilGone(deadline), 200))
            .catch(() => exit()); // lock gone → loop stopped
        };
        Deno.readTextFile(LOCK)
          .then((pid) => {
            const trimmed = pid.trim();
            if (trimmed) {
              new Deno.Command("kill", {
                args: ["-TERM", trimmed],
                stdin: "null", stdout: "null", stderr: "null",
              }).spawn();
            }
            setTimeout(() => pollUntilGone(Date.now() + MAX_WAIT_MS), 200);
          })
          .catch(() => exit()); // no lock file → loop not running, exit immediately
        break;
      }

      default:
        break;
    }
  }, { isActive: !editingContext && !quitting });

  return { paused, lastAction, editingContext, quitting, closeEditor };
}
