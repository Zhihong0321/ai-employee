import { MessageKind } from "../../types.js";

const MESSAGE_WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "deviceSentMessage"
] as const;

type MessageContent = Record<string, any>;

function asMessageContent(value: unknown): MessageContent | null {
  return value && typeof value === "object" ? (value as MessageContent) : null;
}

function readNestedMessage(value: unknown): MessageContent | null {
  const objectValue = asMessageContent(value);
  return asMessageContent(objectValue?.message);
}

function firstNonEmptyText(candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

export function unwrapBaileysMessageContent(messageContent: unknown): MessageContent {
  let current = asMessageContent(messageContent) ?? {};

  for (let depth = 0; depth < 8; depth += 1) {
    let next: MessageContent | null = null;

    for (const key of MESSAGE_WRAPPER_KEYS) {
      next = readNestedMessage(current[key]);
      if (next) {
        break;
      }
    }

    if (!next) {
      return current;
    }

    current = next;
  }

  return current;
}

export function getNormalizedBaileysMessageKeys(messageContent: unknown): string[] {
  return Object.keys(unwrapBaileysMessageContent(messageContent));
}

export function detectBaileysMessageKind(messageContent: unknown): MessageKind {
  const content = unwrapBaileysMessageContent(messageContent);

  if (content.audioMessage) {
    return "audio";
  }

  if (content.imageMessage) {
    return "image";
  }

  if (content.documentMessage) {
    return "document";
  }

  if (content.videoMessage) {
    return "video";
  }

  if (
    content.conversation ||
    content.extendedTextMessage ||
    content.buttonsResponseMessage ||
    content.listResponseMessage ||
    content.templateButtonReplyMessage ||
    content.interactiveResponseMessage ||
    content.contactMessage ||
    content.contactsArrayMessage
  ) {
    return "text";
  }

  return "unknown";
}

export function extractBaileysMessageText(messageContent: unknown): string {
  const content = unwrapBaileysMessageContent(messageContent);

  return firstNonEmptyText([
    content.conversation,
    content.extendedTextMessage?.text,
    content.imageMessage?.caption,
    content.videoMessage?.caption,
    content.documentMessage?.caption,
    content.buttonsResponseMessage?.selectedDisplayText,
    content.listResponseMessage?.title,
    content.listResponseMessage?.singleSelectReply?.selectedRowId,
    content.templateButtonReplyMessage?.selectedDisplayText,
    content.templateButtonReplyMessage?.selectedId,
    content.interactiveResponseMessage?.body?.text,
    content.contactMessage?.displayName,
    content.contactsArrayMessage?.contacts?.[0]?.displayName
  ]);
}

export function extractBaileysMimeType(messageContent: unknown): string | null {
  const content = unwrapBaileysMessageContent(messageContent);

  return (
    content.imageMessage?.mimetype ||
    content.audioMessage?.mimetype ||
    content.documentMessage?.mimetype ||
    content.videoMessage?.mimetype ||
    null
  );
}
