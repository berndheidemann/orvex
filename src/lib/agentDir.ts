// Single source of truth for the agent directory path.
// All hooks and components import from here instead of duplicating this logic.
export const AGENT_DIR = (
  Deno.env.get("KINEMA_AGENT_DIR") ??
  new URL("../../.agent", import.meta.url).pathname
).replace(/\/$/, "");
