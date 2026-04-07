import { Repository } from "../database/repository.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { InboundMessage } from "../types.js";
import { WhatsAppSender } from "./agent-service.js";

export class WhatsAppPlaygroundService {
  private whatsappSender?: WhatsAppSender;

  constructor(private readonly repository: Repository) {}

  setWhatsappSender(sender: WhatsAppSender): void {
    this.whatsappSender = sender;
  }

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    const contactNumber = normalizePhoneNumber(message.senderNumber);
    const contact = await this.repository.ensureContactShell({
      whatsappNumber: contactNumber,
      whatsappLid: message.senderLid ?? null,
      name: message.senderName ?? contactNumber
    });

    await this.repository.saveStoredMessage({
      externalId: message.externalId,
      chatId: message.chatId,
      senderNumber: contactNumber,
      senderName: message.senderName ?? null,
      direction: "inbound",
      kind: message.kind,
      text: message.text,
      mediaPath: message.mediaPath ?? null,
      mimeType: message.mimeType ?? null,
      transcript: message.transcript ?? null,
      analysis: message.analysis ?? null,
      rawPayload: message.rawPayload ?? {},
      occurredAt: message.occurredAt,
      contactId: contact?.id ?? null,
      contactNumber,
      authorNumber: contactNumber,
      authorName: message.senderName ?? null,
      isFromMe: false
    });
  }

  async handleOwnMessage(message: InboundMessage): Promise<void> {
    const contactNumber = normalizePhoneNumber(message.senderNumber);
    const contact = await this.repository.ensureContactShell({
      whatsappNumber: contactNumber,
      whatsappLid: message.senderLid ?? null,
      name: message.senderName ?? contactNumber
    });

    await this.repository.saveStoredMessage({
      externalId: message.externalId,
      chatId: message.chatId,
      senderNumber: contactNumber,
      senderName: contact?.name ?? message.senderName ?? null,
      direction: "outbound",
      kind: message.kind,
      text: message.text,
      mediaPath: message.mediaPath ?? null,
      mimeType: message.mimeType ?? null,
      transcript: message.transcript ?? null,
      analysis: message.analysis ?? null,
      rawPayload: message.rawPayload ?? {},
      occurredAt: message.occurredAt,
      contactId: contact?.id ?? null,
      contactNumber,
      authorNumber: this.whatsappSender?.getOwnNumber?.() ?? null,
      authorName: "AI Employee",
      isFromMe: true
    });
  }

  async sendText(targetNumber: string, text: string): Promise<void> {
    if (!this.whatsappSender) {
      throw new Error("WhatsApp sender is not configured");
    }

    const contactNumber = normalizePhoneNumber(targetNumber);
    const contact = await this.repository.ensureContactShell({
      whatsappNumber: contactNumber,
      name: contactNumber
    });

    const sentMessage = await this.whatsappSender.sendText(`${contactNumber}@s.whatsapp.net`, text);
    if (!sentMessage) {
      throw new Error("WhatsApp send succeeded but no message receipt was returned for storage.");
    }

    await this.repository.saveStoredMessage({
      externalId: sentMessage.externalId,
      chatId: sentMessage.chatId,
      senderNumber: contactNumber,
      senderName: contact?.name ?? sentMessage.senderName ?? null,
      direction: "outbound",
      kind: sentMessage.kind,
      text: sentMessage.text,
      mediaPath: sentMessage.mediaPath ?? null,
      mimeType: sentMessage.mimeType ?? null,
      transcript: sentMessage.transcript ?? null,
      analysis: sentMessage.analysis ?? null,
      rawPayload: sentMessage.rawPayload ?? {},
      occurredAt: sentMessage.occurredAt,
      contactId: contact?.id ?? null,
      contactNumber,
      authorNumber: this.whatsappSender.getOwnNumber?.() ?? null,
      authorName: "AI Employee",
      isFromMe: true
    });
  }
}
