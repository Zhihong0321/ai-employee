import { describe, expect, it } from "vitest";
import { inferTimezoneFromWhatsappNumber } from "./timezone.js";

describe("inferTimezoneFromWhatsappNumber", () => {
  it("maps Malaysia numbers to Asia/Kuala_Lumpur", () => {
    expect(inferTimezoneFromWhatsappNumber("60123456789")).toEqual({
      timezone: "Asia/Kuala_Lumpur",
      source: "inferred_from_phone_country_code"
    });
  });

  it("maps Singapore numbers to Asia/Singapore", () => {
    expect(inferTimezoneFromWhatsappNumber("+6591234567")).toEqual({
      timezone: "Asia/Singapore",
      source: "inferred_from_phone_country_code"
    });
  });

  it("maps China numbers to Asia/Shanghai", () => {
    expect(inferTimezoneFromWhatsappNumber("8613812345678")).toEqual({
      timezone: "Asia/Shanghai",
      source: "inferred_from_phone_country_code"
    });
  });

  it("returns null for unsupported prefixes", () => {
    expect(inferTimezoneFromWhatsappNumber("447700900123")).toBeNull();
  });
});
