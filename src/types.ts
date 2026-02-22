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

// ── Review types ───────────────────────────────────────────────

export interface ReviewItem {
  id: string;      // "REQ-003"
  title: string;   // "Offline-Modus"
  content: string; // vollständiger Markdown-Abschnitt
}

export interface ReviewState {
  items: ReviewItem[];
  currentIdx: number;
  inputMode: "none" | "typing" | "rewriting";
  typedInput: string;
  editorOpen: boolean;
  fileContent: string;
}

// Shown between synthesis completion and review start
export interface SynthDoneState {
  items: ReviewItem[];
  fileContent: string;
  existing?: boolean; // true = PRD/Arch already existed, skipped generation
}

// Minimal key type for review callbacks (compatible with ink's Key)
export interface InputKey {
  return?: boolean;
  escape?: boolean;
  backspace?: boolean;
  delete?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
}

export interface InitRunnerState {
  phases: PhaseState[];
  liveLines: string[];
  agentStreams: string[];
  activeLabel: string;
  done: boolean;
  error: string | null;
  // Arch generation confirm
  awaitingArchConfirm: boolean;
  startArch: () => void;
  skipArch: () => void;
  // PRD synthesis done transition screen
  prdSynthDone: SynthDoneState | null;
  confirmPrdSynthDone: () => void;
  skipPrdReview: () => void;
  // PRD Review
  prdReview: ReviewState | null;
  advancePrdReview: () => void;
  openPrdReviewEditor: () => void;
  startPrdReviewTyping: () => void;
  submitPrdReviewRewrite: (prompt: string) => void;
  onPrdReviewType: (char: string, key: InputKey) => void;
  // Arch synthesis done transition screen (replaces awaitingArchReviewConfirm)
  archSynthDone: SynthDoneState | null;
  confirmArchSynthDone: () => void;
  skipArchSynthDone: () => void;
  // Arch Review
  archReview: ReviewState | null;
  advanceArchReview: () => void;
  openArchReviewEditor: () => void;
  startArchReviewTyping: () => void;
  submitArchReviewRewrite: (prompt: string) => void;
  onArchReviewType: (char: string, key: InputKey) => void;
  // Shared editor callbacks
  saveReviewEdit: (content: string) => void;
  cancelReviewEdit: () => void;
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
