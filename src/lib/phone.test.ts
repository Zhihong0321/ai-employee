import test from "node:test";
import assert from "node:assert/strict";
import { normalizeChatNumber, normalizePhoneNumber, normalizeWhatsAppIdentityUser } from "./phone.js";

test("normalizePhoneNumber strips WhatsApp server and device suffixes", () => {
  assert.equal(normalizePhoneNumber("60123456789:12@s.whatsapp.net"), "60123456789");
  assert.equal(normalizePhoneNumber("+60123456789:77@s.whatsapp.net"), "+60123456789");
  assert.equal(normalizePhoneNumber("60123456789@s.whatsapp.net"), "60123456789");
});

test("normalizeChatNumber handles raw WhatsApp chat ids", () => {
  assert.equal(normalizeChatNumber("60123456789:5@s.whatsapp.net"), "60123456789");
  assert.equal(normalizeChatNumber("120363123456789@g.us"), "120363123456789");
});

test("normalizePhoneNumber keeps plain manual inputs stable", () => {
  assert.equal(normalizePhoneNumber("+60 12-345 6789"), "+60123456789");
  assert.equal(normalizePhoneNumber("6012 345 6789"), "60123456789");
  assert.equal(normalizePhoneNumber("status@broadcast"), "");
});

test("normalizeWhatsAppIdentityUser preserves the raw identity user part", () => {
  assert.equal(normalizeWhatsAppIdentityUser("1234567890@lid"), "1234567890");
  assert.equal(normalizeWhatsAppIdentityUser("60123456789:14@s.whatsapp.net"), "60123456789");
});
