import type { AgentPlan } from "../types.js";

function isValidTimezone(value: string | null | undefined): value is string {
  if (!value?.trim()) {
    return false;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatLocalDateTime(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const valueByType = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day} ${valueByType.hour}:${valueByType.minute}`;
}

export type PromptTimeContext = {
  utcNow: string;
  userTimezone: string;
  localNow: string;
  timezoneSource: string;
};

export function buildPromptTimeContext(
  senderProfile: { timezone?: string | null; timezone_source?: string | null } | null | undefined,
  now = new Date()
): PromptTimeContext {
  const requestedTimezone = senderProfile?.timezone?.trim();
  const userTimezone = isValidTimezone(requestedTimezone) ? requestedTimezone : "UTC";
  const timezoneSource =
    isValidTimezone(requestedTimezone)
      ? senderProfile?.timezone_source?.trim() || "contact_timezone"
      : "default_utc_fallback";

  return {
    utcNow: now.toISOString(),
    userTimezone,
    localNow: formatLocalDateTime(now, userTimezone),
    timezoneSource
  };
}

export function appendTimeContextInstruction(systemPrompt: string): string {
  return `${systemPrompt}\n\nUse TimeContext for any date, time, deadline, reminder, or schedule reasoning.`;
}

export function isTimeSensitiveText(text: string | null | undefined): boolean {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /\b(today|tomorrow|tonight|yesterday|now|current time|current date|this morning|this afternoon|this evening|next week|next month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|eod|deadline|remind me|schedule)\b/.test(
    normalized
  );
}

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

function parseIsoWallClock(value: string): WallClockParts | null {
  const match = String(value)
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?$/
    );

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number(String(match[7] ?? "0").padEnd(3, "0"))
  };
}

function parseTimezoneOffsetMinutes(value: string): number | null {
  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function getTimezoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit"
  });
  const zoneName = formatter.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "UTC";
  const parsed = parseTimezoneOffsetMinutes(zoneName);
  if (parsed === null) {
    throw new Error(`Unable to resolve timezone offset for ${timeZone}`);
  }
  return parsed;
}

function localWallClockToUtcIso(parts: WallClockParts, timeZone: string): string {
  const naiveUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );

  let offsetMinutes = getTimezoneOffsetMinutes(new Date(naiveUtcMs), timeZone);
  let utcMs = naiveUtcMs - offsetMinutes * 60_000;

  const finalOffsetMinutes = getTimezoneOffsetMinutes(new Date(utcMs), timeZone);
  if (finalOffsetMinutes !== offsetMinutes) {
    offsetMinutes = finalOffsetMinutes;
    utcMs = naiveUtcMs - offsetMinutes * 60_000;
  }

  return new Date(utcMs).toISOString();
}

export function normalizePlannedIsoToUtc(value: string | null | undefined, timeZone: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  if (!isValidTimezone(timeZone) || timeZone === "UTC") {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const wallClock = parseIsoWallClock(text);
  if (wallClock) {
    return localWallClockToUtcIso(wallClock, timeZone);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeAgentPlanTimes(plan: AgentPlan, timeZone: string | null | undefined): AgentPlan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => ({
      ...task,
      dueAt: normalizePlannedIsoToUtc(task.dueAt ?? null, timeZone)
    })),
    reminders: plan.reminders.map((reminder) => ({
      ...reminder,
      runAt: normalizePlannedIsoToUtc(reminder.runAt, timeZone) ?? reminder.runAt
    }))
  };
}
