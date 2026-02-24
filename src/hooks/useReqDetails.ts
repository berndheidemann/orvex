import React from "react";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect } = React;

// PRD.md lives one level above .agent/
const PRD_PATH = `${AGENT_DIR}/../PRD.md`;

// Regex to match REQ-NNN, RF-NNN, and CONT-XXX-NNN headings
const HEADING_RE_GLOBAL = /^### (REQ-\d+[a-z]?|RF-\d+[a-z]?|CONT-[A-Z]+-\d+[A-Za-z]*): /gm;

/** Parses a PRD.md text and returns a map of reqId → full block markdown */
export function parseReqBlocks(prdText: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Find all heading positions
  const matches: Array<{ id: string; index: number }> = [];
  for (const m of prdText.matchAll(HEADING_RE_GLOBAL)) {
    matches.push({ id: m[1], index: m.index! });
  }

  if (matches.length === 0) return result;

  for (let i = 0; i < matches.length; i++) {
    const { id, index } = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].index : prdText.length;
    // Extract block, trim trailing whitespace/newlines
    const block = prdText.slice(index, end).replace(/\s+$/, "");
    result[id] = block;
  }

  return result;
}

export function useReqDetails(): Record<string, string> {
  const [details, setDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let timerId: number | undefined;

    const tryLoad = (delayMs: number) => {
      timerId = setTimeout(async () => {
        if (cancelled) return;
        try {
          const text = await Deno.readTextFile(PRD_PATH);
          if (cancelled) return;
          const map = parseReqBlocks(text);
          if (Object.keys(map).length > 0) {
            setDetails(map);
          } else {
            tryLoad(Math.min(delayMs * 2, 4000));
          }
        } catch {
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

  return details;
}
