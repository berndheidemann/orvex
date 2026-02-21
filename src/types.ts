export type ReqStatus = "open" | "in_progress" | "done" | "blocked";
export type Priority = "P0" | "P1" | "P2";
export type Size = "S" | "M";

// ── Init-runner types ──────────────────────────────────────────

export type AgentStatus = "pending" | "running" | "done";
export type RoundStatus = "pending" | "running" | "done";
export type PhaseStatus = "pending" | "running" | "done";

export interface AgentState {
  name: string;
  status: AgentStatus;
}

export interface RoundState {
  label: string;
  status: RoundStatus;
  agents: AgentState[];
}

export interface PhaseState {
  id: "prd" | "arch";
  label: string;
  outputPath: string;
  status: PhaseStatus;
  rounds: RoundState[];
  startedAt: number | null;
}

export interface InitRunnerState {
  phases: PhaseState[];
  liveLines: string[];
  activeLabel: string;
  done: boolean;
  error: string | null;
  awaitingArchConfirm: boolean;
  startArch: () => void;
  skipArch: () => void;
}

export interface ReqEntry {
  status: ReqStatus;
  priority: Priority;
  size: Size;
  deps: string[];
  notes?: string;
}

export interface IterationEntry {
  iteration: number;
  timestamp: string;
  req_hint: string;
  [key: string]: unknown;
}

export type StatusData = Record<string, ReqEntry>;

export const STATUS_COLORS: Record<ReqStatus, string> = {
  open: "gray",
  in_progress: "yellow",
  done: "green",
  blocked: "red",
};
