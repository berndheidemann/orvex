import React from "react";

const { useState, useEffect } = React;

export interface TerminalSize {
  columns: number;
  rows: number;
}

function getSize(): TerminalSize {
  try {
    return Deno.consoleSize();
  } catch {
    return { columns: 80, rows: 24 };
  }
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(getSize);

  useEffect(() => {
    const handler = () => setSize(getSize());
    try {
      Deno.addSignalListener("SIGWINCH", handler);
      return () => Deno.removeSignalListener("SIGWINCH", handler);
    } catch {
      // SIGWINCH not available (e.g. Windows) — static size
    }
  }, []);

  return size;
}
