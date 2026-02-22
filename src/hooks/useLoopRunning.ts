import React from "react";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect } = React;

const LOCK_PATH = `${AGENT_DIR}/loop.lock`;

export function useLoopRunning(intervalMs: number = 2000): boolean | null {
  // null = unknown (initial), true = running, false = stopped
  const [running, setRunning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        await Deno.stat(LOCK_PATH);
        setRunning(true);
      } catch {
        setRunning(false);
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, []);

  return running;
}
