import React from "react";

const { useState, useEffect } = React;

const AGENT_DIR = (
  Deno.env.get("KINEMA_AGENT_DIR") ??
  new URL("../../.agent", import.meta.url).pathname
).replace(/\/$/, "");

// PRD.md lives one level above .agent/
const PRD_PATH = `${AGENT_DIR}/../PRD.md`;

export function usePrdTitles(): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    Deno.readTextFile(PRD_PATH)
      .then((text) => {
        const map: Record<string, string> = {};
        for (const m of text.matchAll(/^### (REQ-\d+[a-z]?): (.+)$/gm)) {
          map[m[1]] = m[2].trim();
        }
        setTitles(map);
      })
      .catch(() => {/* PRD.md not found — titles stay empty */});
  }, []);

  return titles;
}
