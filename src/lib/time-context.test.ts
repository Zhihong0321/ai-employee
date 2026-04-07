import test from "node:test";
import assert from "node:assert/strict";
import { appendTimeContextInstruction, buildPromptTimeContext, isTimeSensitiveText } from "./time-context.js";

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
