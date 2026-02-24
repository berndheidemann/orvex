import React from "react";
import { render, Box, Text } from "ink";
import { Dashboard } from "./components/Dashboard.ts";
import { InitDashboard } from "./components/InitDashboard.ts";
import { EduInitDashboard } from "./components/EduInitDashboard.ts";

const { createElement: h } = React;

const INIT_MODE = Deno.env.get("ORVEX_INIT_MODE") === "1";
const INIT_DESCRIPTION = Deno.env.get("ORVEX_INIT_DESCRIPTION") ?? "";
const EDU_INIT_MODE = Deno.env.get("ORVEX_EDU_INIT_MODE") === "1" || Deno.args.includes("--edu-init");

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

let lernsituationExists = false;
try { await Deno.stat("LERNSITUATION.md"); lernsituationExists = true; } catch { /* */ }

const { useState } = React;

function App(): React.ReactElement {
  const [initDone, setInitDone] = useState(false);

  // EDU_INIT_MODE: explicit edu-init invocation
  // Resume path: LERNSITUATION.md exists but PRD.md does not
  const eduResume = !EDU_INIT_MODE && lernsituationExists && !archOnly && !bothExist;
  if ((EDU_INIT_MODE || eduResume) && !initDone) {
    return h(EduInitDashboard, {
      lernsituationExists,
      onDone: () => setInitDone(true),
    });
  }
  if ((EDU_INIT_MODE || eduResume) && initDone) {
    setTimeout(() => Deno.exit(0), 80);
    return h(Box, null, h(Text, { color: "green" }, "Edu-Init abgeschlossen — starte orvex zum Loslegen"));
  }

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

  // Init mode completed → exit the TUI so the orvex script shows
  // its review instructions. The user then runs `orvex` again which
  // starts loop_dev.sh and launches the real dashboard.
  if (INIT_MODE && initDone) {
    setTimeout(() => Deno.exit(0), 80);
    return h(Box, null, h(Text, { color: "green" }, "✅  Init abgeschlossen — starte orvex zum Loslegen"));
  }

  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyan" }, "Orvex"),
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
// Show resume hint when exiting from the real dashboard (not init flows)
if (bothExist && !INIT_MODE && !EDU_INIT_MODE) {
  console.log("\n💡  Entwicklung jederzeit fortsetzen mit: orvex");
  console.log("    Nur die aktuelle Iteration wird wiederholt — der Agent sieht den aktuellen Code.\n");
}
Deno.exit(0);
