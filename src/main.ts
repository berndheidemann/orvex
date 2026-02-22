import React from "react";
import { render, Box, Text } from "ink";
import { Dashboard } from "./components/Dashboard.ts";
import { InitDashboard } from "./components/InitDashboard.ts";

const { createElement: h } = React;

const INIT_MODE = Deno.env.get("KINEMA_INIT_MODE") === "1";
const INIT_DESCRIPTION = Deno.env.get("KINEMA_INIT_DESCRIPTION") ?? "";

// Auto-detect project state from filesystem:
//   bothExist  → PRD.md + architecture.md vorhanden → direkt zum Dashboard
//   archOnly   → PRD.md vorhanden, architecture.md fehlt → Arch-only Init
//   (neither)  → PRD.md fehlt → voller Init-Flow
let archOnly = false;
let bothExist = false;
let archOnlyPrdTitle = "";
try {
  const prdText = await Deno.readTextFile("PRD.md");
  try {
    await Deno.readTextFile("architecture.md");
    bothExist = true; // Beide Dateien vorhanden — kein Init-Flow nötig
  } catch {
    archOnly = true;
    const m = prdText.match(/^#+\s+PRD\s+[—-]\s+(.+)$/m) ?? prdText.match(/^#+\s+(.+)$/m);
    archOnlyPrdTitle = m ? m[1].trim() : "PRD.md";
  }
} catch { /* PRD.md nicht vorhanden — normaler Dashboard-Start */ }

const { useState } = React;

function App(): React.ReactElement {
  const [initDone, setInitDone] = useState(false);

  // INIT_MODE wird ignoriert wenn PRD.md + architecture.md bereits existieren.
  if ((INIT_MODE && !bothExist || archOnly) && !initDone) {
    return h(InitDashboard, {
      description: INIT_DESCRIPTION || archOnlyPrdTitle,
      archOnly,
      // Skip the setup screen only when an agent explicitly provided a description.
      // In interactive archOnly mode the user should always see ArchSetup.
      skipSetup: !!INIT_DESCRIPTION,
      onDone: () => setInitDone(true),
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
Deno.exit(0);
