export const TASK_STATUS_VALUES = [
  "TODO",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED"
] as const;

export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

const TASK_STATUS_ALIAS_MAP: Record<string, TaskStatus> = {
  todo: "TODO",
  open: "TODO",
  in_progress: "IN_PROGRESS",
  "in-progress": "IN_PROGRESS",
  inprogress: "IN_PROGRESS",
  waiting: "WAITING",
  blocked: "BLOCKED",
  completed: "COMPLETED",
  complete: "COMPLETED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED"
};

export function normalizeTaskStatus(input: string | null | undefined): TaskStatus | null {
  const normalized = String(input ?? "").trim();
  if (!normalized) {
    return null;
  }

  const exactMatch = TASK_STATUS_VALUES.find((value) => value === normalized.toUpperCase());
  if (exactMatch) {
    return exactMatch;
  }

  return TASK_STATUS_ALIAS_MAP[normalized.toLowerCase()] ?? null;
}

export function isTaskStatus(value: string | null | undefined): value is TaskStatus {
  return normalizeTaskStatus(value) !== null;
}

export type TaskCharter = {
  originalIntent: string;
  requesterNumber?: string | null;
  targetNumber?: string | null;
  scope?: string | null;
  constraints?: Record<string, unknown>;
  sourceMessageExternalId?: string | null;
  timeContext?: {
    timezone: string;
    timezoneSource: string;
    interpretedAtUtc: string;
  } | null;
};

export type TaskSnapshot = {
  status: TaskStatus;
  currentSummary: string;
  nextStep?: string | null;
  blocker?: string | null;
  waitingFor?: string | null;
  latestKnownContext?: Record<string, unknown>;
};

export function buildTaskCharter(input: {
  originalIntent: string;
  requesterNumber?: string | null;
  targetNumber?: string | null;
  scope?: string | null;
  constraints?: Record<string, unknown>;
  sourceMessageExternalId?: string | null;
  timezone?: string | null;
  timezoneSource?: string | null;
  interpretedAtUtc?: string | null;
}): TaskCharter {
  return {
    originalIntent: input.originalIntent,
    requesterNumber: input.requesterNumber ?? null,
    targetNumber: input.targetNumber ?? null,
    scope: input.scope ?? null,
    constraints: input.constraints ?? {},
    sourceMessageExternalId: input.sourceMessageExternalId ?? null,
    timeContext: input.timezone
      ? {
          timezone: input.timezone,
          timezoneSource: input.timezoneSource ?? "contact_timezone",
          interpretedAtUtc: input.interpretedAtUtc ?? new Date().toISOString()
        }
      : null
  };
}

export function buildTaskSnapshot(input: {
  status?: string | null;
  currentSummary: string;
  nextStep?: string | null;
  blocker?: string | null;
  waitingFor?: string | null;
  latestKnownContext?: Record<string, unknown>;
}): TaskSnapshot {
  return {
    status: normalizeTaskStatus(input.status) ?? "TODO",
    currentSummary: input.currentSummary,
    nextStep: input.nextStep ?? null,
    blocker: input.blocker ?? null,
    waitingFor: input.waitingFor ?? null,
    latestKnownContext: input.latestKnownContext ?? {}
  };
}
