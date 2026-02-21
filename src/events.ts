type Status = "open" | "in_progress" | "done" | "blocked";
type EventBase = { ts: number; iter: number };

export interface IterationStart extends EventBase {
  type: "iteration:start";
  reqId: string | null;
  mode: "implement" | "validate" | "refactor";
  model: string;
}

export interface IterationEnd extends EventBase {
  type: "iteration:end";
  durationMs: number;
  costUsd: number;
  toolCount: number;
  exitCode: number;
}

export interface ToolCall extends EventBase {
  type: "tool:call";
  toolName: string;
  category: "read" | "write" | "bash" | "task" | "playwright" | "mcp";
  summary: string;
  taskModel?: string;
}

export interface ReqStatusChange extends EventBase {
  type: "req:status";
  reqId: string;
  from: Status;
  to: Status;
  reason?: string;
}

export interface AgentOutput extends EventBase {
  type: "agent:output";
  text: string;
  isBlocker: boolean;
  statusBlock?: string;
}

export interface SystemEvent extends EventBase {
  type: "system:event";
  kind:
    | "timeout"
    | "low_activity"
    | "crash_recovery"
    | "blocker_detected"
    | "auto_blocked"
    | "all_done";
  message: string;
}

export interface LoopPhaseEvent extends EventBase {
  type: "loop:phase";
  phase: "preflight" | "implementing" | "validating" | "post_processing";
  detail?: string;
}

export type LoopEvent =
  | IterationStart
  | IterationEnd
  | ToolCall
  | AgentOutput
  | ReqStatusChange
  | SystemEvent
  | LoopPhaseEvent;
