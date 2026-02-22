import React from "react";
import { render, Box, Text } from "ink";
import { Dashboard } from "./components/Dashboard.ts";
import { InitDashboard } from "./components/InitDashboard.ts";

const { createElement: h } = React;

const INIT_MODE = Deno.env.get("KINEMA_INIT_MODE") === "1";
const INIT_DESCRIPTION = Deno.env.get("KINEMA_INIT_DESCRIPTION") ?? "";

// Auto-detect: PRD.md exists but architecture.md missing → arch-only init
let archOnly = false;
let archOnlyPrdTitle = "";
try {
  const prdText = await Deno.readTextFile("PRD.md");
  try {
    await Deno.readTextFile("architecture.md");
  } catch {
    archOnly = true;
    const m = prdText.match(/^#+\s+PRD\s+[—-]\s+(.+)$/m) ?? prdText.match(/^#+\s+(.+)$/m);
    archOnlyPrdTitle = m ? m[1].trim() : "PRD.md";
  }
} catch { /* PRD.md nicht vorhanden — normaler Dashboard-Start */ }

function App(): React.ReactElement {
  if (INIT_MODE || archOnly) {
    return h(InitDashboard, {
      description: INIT_DESCRIPTION || archOnlyPrdTitle,
      archOnly,
      // Skip the setup screen only when an agent explicitly provided a description.
      // In interactive archOnly mode the user should always see ArchSetup.
      skipSetup: !!INIT_DESCRIPTION,
    });
  }
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyan" }, "Kinema"),
    h(Text, { dimColor: true }, "─".repeat(40)),
    h(Dashboard, null),
  );
}

// Alternate screen buffer
const enc = new TextEncoder();
Deno.stdout.writeSync(enc.encode("\x1b[?1049h\x1b[2J\x1b[H"));

const cleanup = () => {
  try { Deno.stdout.writeSync(enc.encode("\x1b[?1049l")); } catch { /* ignore */ }
};

try { Deno.addSignalListener("SIGINT", () => { cleanup(); Deno.exit(0); }); } catch { /* ignore */ }
try { Deno.addSignalListener("SIGTERM", () => { cleanup(); Deno.exit(0); }); } catch { /* ignore */ }

const instance = render(h(App, null));
await instance.waitUntilExit();
cleanup();
