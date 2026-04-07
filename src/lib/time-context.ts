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
