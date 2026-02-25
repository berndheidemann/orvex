import React from "react";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect } = React;

const LOCK_PATH = `${AGENT_DIR}/loop.lock`;

async function isLoopAlive(): Promise<boolean> {
  try {
    const text = await Deno.readTextFile(LOCK_PATH);
    const pid = parseInt(text.trim(), 10);
    if (isNaN(pid) || pid <= 0) return false;
    // kill -0 checks process liveness without sending a real signal
    const { code } = await new Deno.Command("kill", {
      args: ["-0", String(pid)],
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
}

export function useLoopRunning(intervalMs: number = 2000): boolean | null {
  // null = unknown (initial), true = running, false = stopped
  const [running, setRunning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => setRunning(await isLoopAlive());

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, []);

  return running;
}
