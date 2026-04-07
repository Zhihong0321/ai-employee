export type DebugMode = "debug_off" | "debug_basic" | "debug_verbose" | "debug_trace";

export type DebugConfig = {
  mode: DebugMode;
  promptTrace: boolean;
  apiPayloadTrace: boolean;
  enabledTaskIds: number[];
  enabledToolNames: string[];
};

export type DebugSeverity = "info" | "warn" | "error";

export type DebugStage =
  | "intake"
  | "classification"
  | "context_load"
  | "planning"
  | "policy_validation"
  | "action_execution"
  | "tool_call"
  | "state_write"
  | "outbound_send"
  | "retry"
  | "handoff"
  | "scheduler";
