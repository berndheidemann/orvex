export type ReqStatus = "open" | "in_progress" | "done" | "blocked";
export type Priority = "P0" | "P1" | "P2";
export type Size = "S" | "M";

export interface ReqEntry {
  status: ReqStatus;
  priority: Priority;
  size: Size;
  deps: string[];
}

export type StatusData = Record<string, ReqEntry>;

export const STATUS_COLORS: Record<ReqStatus, string> = {
  open: "gray",
  in_progress: "yellow",
  done: "green",
  blocked: "red",
};
