import { normalizePhoneNumber } from "./phone.js";

export type InferredTimezone = {
  timezone: string;
  source: "inferred_from_phone_country_code";
};

export function inferTimezoneFromWhatsappNumber(value: string | null | undefined): InferredTimezone | null {
  const normalized = normalizePhoneNumber(value);
  const digits = normalized.replace(/^\+/, "");

  if (digits.startsWith("60")) {
    return {
      timezone: "Asia/Kuala_Lumpur",
      source: "inferred_from_phone_country_code"
    };
  }

  if (digits.startsWith("65")) {
    return {
      timezone: "Asia/Singapore",
      source: "inferred_from_phone_country_code"
    };
  }

  if (digits.startsWith("86")) {
    return {
      timezone: "Asia/Shanghai",
      source: "inferred_from_phone_country_code"
    };
  }

  return null;
}
