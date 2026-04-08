import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTimeContextInstruction,
  buildPromptTimeContext,
  isTimeSensitiveText,
  normalizeAgentPlanTimes,
  normalizePlannedIsoToUtc
} from "./time-context.js";

test("buildPromptTimeContext uses stored contact timezone", () => {
  const context = buildPromptTimeContext(
    {
      timezone: "Asia/Kuala_Lumpur",
      timezone_source: "inferred_from_phone_country_code"
    },
    new Date("2026-04-03T06:10:00.000Z")
  );

  assert.deepEqual(context, {
    utcNow: "2026-04-03T06:10:00.000Z",
    userTimezone: "Asia/Kuala_Lumpur",
    localNow: "2026-04-03 14:10",
    timezoneSource: "inferred_from_phone_country_code"
  });
});

test("buildPromptTimeContext falls back to UTC when timezone is missing", () => {
  const context = buildPromptTimeContext(null, new Date("2026-04-03T06:10:00.000Z"));

  assert.deepEqual(context, {
    utcNow: "2026-04-03T06:10:00.000Z",
    userTimezone: "UTC",
    localNow: "2026-04-03 06:10",
    timezoneSource: "default_utc_fallback"
  });
});

test("appendTimeContextInstruction keeps prompt addition compact", () => {
  assert.match(
    appendTimeContextInstruction("Base prompt"),
    /Base prompt[\s\S]*Use TimeContext for any date, time, deadline, reminder, or schedule reasoning\./
  );
});

test("isTimeSensitiveText catches relative-time questions and skips timeless facts", () => {
  assert.equal(isTimeSensitiveText("What is my meeting time today?"), true);
  assert.equal(isTimeSensitiveText("Remind me tomorrow at 9am"), true);
  assert.equal(isTimeSensitiveText("What is our company address?"), false);
});

test("normalizePlannedIsoToUtc interprets planner timestamps as local wall clock time", () => {
  assert.equal(
    normalizePlannedIsoToUtc("2026-04-08T16:52:00Z", "Asia/Kuala_Lumpur"),
    "2026-04-08T08:52:00.000Z"
  );
});

test("normalizeAgentPlanTimes converts task and reminder times using the contact timezone", () => {
  const normalized = normalizeAgentPlanTimes(
    {
      category: "task",
      summary: "Test",
      replyText: "Okay",
      claims: [],
      contactUpdates: [],
      facts: [],
      tasks: [
        {
          title: "Add notes",
          details: "Add notes for Kapar meeting",
          dueAt: "2026-04-08T16:52:00Z"
        }
      ],
      reminders: [
        {
          runAt: "2026-04-08T16:52:00Z",
          targetNumber: "601121000099",
          message: "Reminder"
        }
      ],
      outboundMessages: [],
      clarification: {
        needed: false
      },
      companyQuery: null,
      webSearchQuery: null
    },
    "Asia/Kuala_Lumpur"
  );

  assert.equal(normalized.tasks[0].dueAt, "2026-04-08T08:52:00.000Z");
  assert.equal(normalized.reminders[0].runAt, "2026-04-08T08:52:00.000Z");
});
