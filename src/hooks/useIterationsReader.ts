import React from "react";
import type { IterationEntry } from "../types.ts";

const { useState, useEffect } = React;

const ITERATIONS_PATH = new URL(
  "../../.agent/iterations.jsonl",
  import.meta.url,
).pathname;

function parseJsonl(text: string): IterationEntry[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as IterationEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is IterationEntry => e !== null);
}

export function useIterationsReader(intervalMs: number = 2000): {
  entries: IterationEntry[];
  available: boolean;
} {
  const [entries, setEntries] = useState<IterationEntry[]>([]);
  const [available, setAvailable] = useState<boolean>(true);

  useEffect(() => {
    const load = async () => {
      try {
        const text = await Deno.readTextFile(ITERATIONS_PATH);
        setEntries(parseJsonl(text));
        setAvailable(true);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          setEntries([]);
          setAvailable(false);
        }
        // On other errors, keep last state
      }
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, []);

  return { entries, available };
}
