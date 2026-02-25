import React from "react";
import type { LoopEvent } from "../events.ts";
import { AGENT_DIR } from "../lib/agentDir.ts";

const { useState, useEffect, useRef } = React;

const EVENTS_PATH = `${AGENT_DIR}/events.jsonl`;

const MAX_EVENTS = 200;

export interface ReqStat {
  totalCostUsd: number;
  totalDurationMs: number;
}

export interface EventsState {
  events: LoopEvent[];
  currentIter: number;
  currentReq: string | null;
  currentPhase: string | null;
  totalLiveCost: number;
  modelCosts: Record<string, number>;
  reqStats: Record<string, ReqStat>;
}

export function useEventsReader(intervalMs: number = 500): EventsState {
  const [events, setEvents] = useState<LoopEvent[]>([]);
  const [currentIter, setCurrentIter] = useState<number>(0);
  const [currentReq, setCurrentReq] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [totalLiveCost, setTotalLiveCost] = useState<number>(0);
  const [modelCosts, setModelCosts] = useState<Record<string, number>>({});
  const [reqStats, setReqStats] = useState<Record<string, ReqStat>>({});
  const byteOffsetRef = useRef<number>(0);
  // Persists across polls: maps iter number → reqId that started that iteration
  const iterToReqRef = useRef<Record<number, string>>({});

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
              if (ev.reqId) {
                iterToReqRef.current[ev.iter] = ev.reqId;
              }
            } else if (ev.type === "req:status" && ev.to === "in_progress") {
              // REQ wurde vom Agenten als aktiv markiert — zuverlässiger als iteration:start.reqId
              setCurrentReq(ev.reqId);
              iterToReqRef.current[ev.iter] = ev.reqId;
            } else if (ev.type === "loop:phase") {
              setCurrentIter((prev: number) => Math.max(prev, ev.iter));
              setCurrentPhase(ev.phase);
            } else if (ev.type === "iteration:end") {
              setCurrentReq(null);
              setCurrentPhase(null);
              setTotalLiveCost((prev: number) => prev + ev.costUsd);
              if (ev.modelCosts) {
                const costs = ev.modelCosts;
                setModelCosts((prev: Record<string, number>) => {
                  const next = { ...prev };
                  for (const [model, mc] of Object.entries(costs)) {
                    next[model] = (next[model] ?? 0) + mc.costUsd;
                  }
                  return next;
                });
              }
              // Accumulate cost + duration per REQ
              const reqId = iterToReqRef.current[ev.iter];
              if (reqId) {
                const { costUsd, durationMs } = ev;
                setReqStats((prev: Record<string, ReqStat>) => {
                  const existing = prev[reqId] ?? { totalCostUsd: 0, totalDurationMs: 0 };
                  return {
                    ...prev,
                    [reqId]: {
                      totalCostUsd: existing.totalCostUsd + costUsd,
                      totalDurationMs: existing.totalDurationMs + durationMs,
                    },
                  };
                });
              }
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

  return { events, currentIter, currentReq, currentPhase, totalLiveCost, modelCosts, reqStats };
}
