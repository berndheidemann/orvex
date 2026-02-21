import React from "react";
import { render, Box, Text } from "ink";
import { createInterface } from "node:readline";

const { createElement: h, useState, useEffect } = React;

function App(): React.ReactElement {
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const rl = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

    rl.on("line", (line: string) => {
      setLines((prev: string[]) => [...prev, line]);
    });

    rl.on("close", () => {
      setDone(true);
    });

    return () => {
      rl.close();
    };
  }, []);

  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true, color: "cyan" }, "Kinema"),
    h(Text, { dimColor: true }, "─".repeat(40)),
    ...lines.map((line: string, i: number) => h(Text, { key: String(i) }, line)),
    done ? h(Text, { dimColor: true }, "[EOF]") : null,
  );
}

const instance = render(h(App, null));

if (!process.stdin.isTTY) {
  process.stdin.on("end", () => {
    setTimeout(() => {
      instance.unmount();
      process.exit(0);
    }, 100);
  });
}
