// Single source of truth for the agent directory path.
// Uses Deno.cwd() so the compiled binary always resolves .agent/
// relative to where the user runs it — not the build-time source path.
export const AGENT_DIR = (
  Deno.env.get("KINEMA_AGENT_DIR") ??
  `${Deno.cwd()}/.agent`
).replace(/\/$/, "");
