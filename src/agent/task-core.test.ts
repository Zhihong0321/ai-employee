import { describe, expect, test } from "vitest";
import { buildTaskCharter, buildTaskSnapshot, normalizeTaskStatus } from "./task-core.js";

describe("task core", () => {
  test("normalizes legacy task statuses into V2 statuses", () => {
    expect(normalizeTaskStatus("open")).toBe("TODO");
    expect(normalizeTaskStatus("in_progress")).toBe("IN_PROGRESS");
    expect(normalizeTaskStatus("cancelled")).toBe("CANCELLED");
  });

  test("buildTaskCharter preserves time context when available", () => {
    const charter = buildTaskCharter({
      originalIntent: "Remind the branch manager tomorrow morning.",
      requesterNumber: "60111111111",
      timezone: "Asia/Kuala_Lumpur",
      timezoneSource: "contact_timezone",
      interpretedAtUtc: "2026-04-03T10:00:00.000Z"
    });

    expect(charter.timeContext?.timezone).toBe("Asia/Kuala_Lumpur");
    expect(charter.timeContext?.timezoneSource).toBe("contact_timezone");
  });

  test("buildTaskSnapshot uses TODO by default", () => {
    const snapshot = buildTaskSnapshot({
      currentSummary: "Follow up with HR."
    });

    expect(snapshot.status).toBe("TODO");
    expect(snapshot.currentSummary).toBe("Follow up with HR.");
  });
});
