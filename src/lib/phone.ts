export function normalizeWhatsAppIdentityUser(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const userPart = trimmed.split("@")[0] ?? trimmed;
  const deviceSeparatorIndex = userPart.indexOf(":");
  return deviceSeparatorIndex >= 0 ? userPart.slice(0, deviceSeparatorIndex) : userPart;
}

export function normalizePhoneNumber(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const userPart = normalizeWhatsAppIdentityUser(value);
  const hasPlus = userPart.startsWith("+");
  const digits = userPart.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function normalizeChatNumber(chatId: string): string {
  return normalizePhoneNumber(chatId);
}

export function isWhatsAppGroupChat(chatId: string | null | undefined): boolean {
  return typeof chatId === "string" && chatId.trim().toLowerCase().endsWith("@g.us");
}
