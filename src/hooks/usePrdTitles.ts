import React from "react";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect } = React;

// PRD.md lives one level above .agent/
const PRD_PATH = `${AGENT_DIR}/../PRD.md`;

export function usePrdTitles(): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let timerId: number | undefined;

    const tryLoad = (delayMs: number) => {
      timerId = setTimeout(async () => {
        if (cancelled) return;
        try {
          const text = await Deno.readTextFile(PRD_PATH);
          if (cancelled) return;
          const map: Record<string, string> = {};
          for (const m of text.matchAll(/^### (REQ-\d+[a-z]?): (.+)$/gm)) {
            map[m[1]] = m[2].trim();
          }
          if (Object.keys(map).length > 0) {
            setTitles(map);
          } else {
            // File exists but no REQs yet — retry
            tryLoad(Math.min(delayMs * 2, 4000));
          }
        } catch {
          // PRD.md not ready yet — retry with backoff (max 4 s)
          tryLoad(Math.min(delayMs * 2, 4000));
        }
      }, delayMs);
    };

    tryLoad(0);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, []);

  return titles;
}
