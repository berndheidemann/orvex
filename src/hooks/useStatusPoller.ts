import React from "react";
import type { StatusData } from "../types.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect } = React;

const STATUS_PATH = `${AGENT_DIR}/status.json`;

export function useStatusPoller(intervalMs: number = 2000): {
  data: StatusData;
  error: string | null;
} {
  const [data, setData] = useState<StatusData>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const text = await Deno.readTextFile(STATUS_PATH);
        const parsed = JSON.parse(text) as StatusData;
        setData(parsed);
        setError(null);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          setData({});
          setError(null);
        } else if (e instanceof SyntaxError) {
          // Keep last valid data, show parse error hint
          setError("status.json: Invalid JSON");
        } else {
          setError(`status.json: ${String(e)}`);
        }
      }
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, []);

  return { data, error };
}
