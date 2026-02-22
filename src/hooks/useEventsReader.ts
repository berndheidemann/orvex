import React from "react";
import type { LoopEvent } from "../events.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect, useRef } = React;

const EVENTS_PATH = `${AGENT_DIR}/events.jsonl`;

const MAX_EVENTS = 200;

export interface EventsState {
  events: LoopEvent[];
  currentIter: number;
  currentReq: string | null;
  totalLiveCost: number;
}

export function useEventsReader(intervalMs: number = 500): EventsState {
  const [events, setEvents] = useState<LoopEvent[]>([]);
  const [currentIter, setCurrentIter] = useState<number>(0);
  const [currentReq, setCurrentReq] = useState<string | null>(null);
  const [totalLiveCost, setTotalLiveCost] = useState<number>(0);
  const byteOffsetRef = useRef<number>(0);

  useEffect(() => {
    const load = async () => {
      try {
        const file = await Deno.open(EVENTS_PATH, { read: true });
        try {
          const stat = await file.stat();
          const fileSize = stat.size;

          if (fileSize <= byteOffsetRef.current) {
            return; // No new data
          }

          await file.seek(byteOffsetRef.current, Deno.SeekMode.Start);
          const buf = new Uint8Array(fileSize - byteOffsetRef.current);
          const bytesRead = await file.read(buf);
          if (bytesRead === null || bytesRead === 0) return;

          byteOffsetRef.current += bytesRead;

          const chunk = new TextDecoder().decode(buf.subarray(0, bytesRead));
          const newEvents = chunk
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line) => {
              try {
                return JSON.parse(line) as LoopEvent;
              } catch {
                return null;
              }
            })
            .filter((e): e is LoopEvent => e !== null);

          if (newEvents.length === 0) return;

          setEvents((prev: LoopEvent[]) => {
            const combined = [...prev, ...newEvents];
            return combined.slice(-MAX_EVENTS);
          });

          // Derive currentIter, currentReq, totalLiveCost from new events.
          // currentIter is updated from both iteration:start AND loop:phase because
          // loop:phase for iter N can arrive before iteration:start for iter N,
          // causing a stale iter counter in the header during that polling window.
          for (const ev of newEvents) {
            if (ev.type === "iteration:start") {
              setCurrentIter((prev: number) => Math.max(prev, ev.iter));
              setCurrentReq(ev.reqId);
            } else if (ev.type === "loop:phase") {
              setCurrentIter((prev: number) => Math.max(prev, ev.iter));
            } else if (ev.type === "iteration:end") {
              setTotalLiveCost((prev: number) => prev + ev.costUsd);
            }
          }
        } finally {
          file.close();
        }
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          // File doesn't exist yet — no-op, keep empty state
        }
        // On other errors, keep last state
      }
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, []);

  return { events, currentIter, currentReq, totalLiveCost };
}
