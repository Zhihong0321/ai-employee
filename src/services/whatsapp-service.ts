import fs from "node:fs/promises";
import makeWASocket, {
  AnyMessageContent,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import {
  detectBaileysMessageKind,
  extractBaileysMessageText,
  extractBaileysMimeType
} from "../agent/intake/baileys-message.js";
import { getIntakeGatewayPreflight, RecentExternalIdCache } from "../agent/intake/preflight.js";
import { isWhatsAppGroupChat, normalizeChatNumber, normalizeWhatsAppIdentityUser } from "../lib/phone.js";
import { GroupContext, InboundMessage } from "../types.js";
import { MediaService } from "./media-service.js";
import { OpenAiService } from "./openai-service.js";

type WhatsAppMessageHandler = {
  handleInboundMessage: (message: InboundMessage) => Promise<void>;
  handleOwnMessage?: (message: InboundMessage) => Promise<void>;
};

type WhatsAppMessageRecorder = {
  handleInboundMessage: (message: InboundMessage) => Promise<void>;
  handleOwnMessage?: (message: InboundMessage) => Promise<void>;
};

export class WhatsAppService {
  private static readonly RECENT_MESSAGE_TTL_MS = 10 * 60 * 1000;

  private socket: any;
  private connected = false;
  private restarting = false;
  private readonly recentExternalIds = new RecentExternalIdCache(WhatsAppService.RECENT_MESSAGE_TTL_MS);
  private readonly runtimeDiagnostics = {
    connected: false,
    ownNumber: null as string | null,
    authDir: "",
    lastConnectionUpdateAt: null as string | null,
    lastConnectionState: "idle",
    lastConnectionDetail: "Not started",
    lastSendAttemptAt: null as string | null,
    lastSendTarget: null as string | null,
    lastSendText: null as string | null,
    lastSendExternalId: null as string | null,
    lastMessagesUpsertAt: null as string | null,
    lastMessagesUpsertCount: 0,
    lastMessageExternalId: null as string | null,
    lastMessageDirection: null as string | null,
    lastMessageText: null as string | null,
    lastRecorderResult: null as string | null,
    lastAgentHandoffResult: null as string | null,
    lastErrorAt: null as string | null,
    lastErrorStage: null as string | null,
    lastErrorMessage: null as string | null
  };

  constructor(
    private readonly authDir: string,
    private readonly mediaService: MediaService,
    private readonly openAiService: OpenAiService,
    private readonly agentService: WhatsAppMessageHandler,
    private readonly options?: {
      enableMediaAi?: boolean;
      captureOwnMessages?: boolean;
      messageRecorder?: WhatsAppMessageRecorder;
    }
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  getRuntimeDiagnostics(): Record<string, unknown> {
    return {
      ...this.runtimeDiagnostics,
      connected: this.connected,
      ownNumber: this.getOwnNumber(),
      authDir: this.authDir
    };
  }

  async listParticipatingGroups(): Promise<any[]> {
    if (!this.socket?.groupFetchAllParticipating) {
      throw new Error("WhatsApp socket is not ready");
    }

    const response = await this.socket.groupFetchAllParticipating();
    const groups = Object.values(response ?? {}).map((metadata: any) => this.summarizeGroupMetadata(metadata));
    groups.sort((left: any, right: any) => String(left.subject ?? "").localeCompare(String(right.subject ?? "")));
    return groups;
  }

  async getGroupMetadata(chatId: string): Promise<any> {
    if (!this.socket?.groupMetadata) {
      throw new Error("WhatsApp socket is not ready");
    }

    const metadata = await this.socket.groupMetadata(chatId);
    return {
      ...this.summarizeGroupMetadata(metadata),
      desc: metadata?.desc ?? null,
      participants: Array.isArray(metadata?.participants)
        ? metadata.participants.map((participant: any) => ({
            id: participant?.id ?? null,
            lid: participant?.lid ?? null,
            notify: participant?.notify ?? null,
            name: participant?.name ?? null,
            verifiedName: participant?.verifiedName ?? null,
            admin: participant?.admin ?? null,
            isAdmin: Boolean(participant?.isAdmin),
            isSuperAdmin: Boolean(participant?.isSuperAdmin)
          }))
        : []
    };
  }

  getOwnNumber(): string | null {
    const userId = this.socket?.user?.id;
    return userId ? normalizeChatNumber(userId) : null;
  }

  async restart(): Promise<void> {
    if (this.restarting) {
      return;
    }

    this.restarting = true;

    try {
      await this.stopSocket();
      await this.start();
    } finally {
      this.restarting = false;
    }
  }

  async start(): Promise<void> {
    await fs.mkdir(this.authDir, { recursive: true });
    this.runtimeDiagnostics.authDir = this.authDir;
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false
    });

    this.socket.ev.on("creds.update", saveCreds);
    this.socket.ev.on("connection.update", (update: any) => {
      this.runtimeDiagnostics.lastConnectionUpdateAt = new Date().toISOString();
      if (update.qr) {
        qrcode.generate(update.qr, { small: true });
        this.runtimeDiagnostics.lastConnectionState = "qr";
        this.runtimeDiagnostics.lastConnectionDetail = "QR generated";
      }

      if (update.connection === "open") {
        this.connected = true;
        this.runtimeDiagnostics.connected = true;
        this.runtimeDiagnostics.lastConnectionState = "open";
        this.runtimeDiagnostics.lastConnectionDetail = "WhatsApp connected";
        console.log("WhatsApp connected");
      }

      if (update.connection === "close") {
        this.connected = false;
        this.runtimeDiagnostics.connected = false;
        this.runtimeDiagnostics.lastConnectionState = "close";
        this.runtimeDiagnostics.lastConnectionDetail =
          update.lastDisconnect?.error?.message ??
          `Connection closed with status ${update.lastDisconnect?.error?.output?.statusCode ?? "unknown"}`;
        const shouldReconnect = update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          void this.restart();
        }
      }
    });

    this.socket.ev.on("messages.upsert", async ({ messages }: any) => {
      this.runtimeDiagnostics.lastMessagesUpsertAt = new Date().toISOString();
      this.runtimeDiagnostics.lastMessagesUpsertCount = Array.isArray(messages) ? messages.length : 0;
      for (const message of messages) {
        if (!message.message) {
          continue;
        }

        try {
          const inbound = await this.normalizeMessage(message);
          this.runtimeDiagnostics.lastMessageExternalId = inbound.externalId;
          this.runtimeDiagnostics.lastMessageDirection = message.key?.fromMe ? "outbound" : "inbound";
          this.runtimeDiagnostics.lastMessageText = inbound.text || null;
          const preflight = getIntakeGatewayPreflight(inbound, this.recentExternalIds);

          if (!preflight.isRecentDuplicate) {
            this.recentExternalIds.remember(inbound.externalId);
          }

          const preparedInbound = preflight.shouldSkipMediaEnrichment
            ? inbound
            : await this.enrichMediaFields(message, inbound);

          if (message.key?.fromMe) {
            if (this.options?.messageRecorder?.handleOwnMessage) {
              await this.options.messageRecorder.handleOwnMessage(preparedInbound);
              this.runtimeDiagnostics.lastRecorderResult = "own_message_saved";
            }
            if (this.options?.captureOwnMessages && this.agentService.handleOwnMessage) {
              await this.agentService.handleOwnMessage(preparedInbound);
              this.runtimeDiagnostics.lastAgentHandoffResult = "own_message_handoff_ok";
            }
            continue;
          }

          if (this.options?.messageRecorder?.handleInboundMessage) {
            await this.options.messageRecorder.handleInboundMessage(preparedInbound);
            this.runtimeDiagnostics.lastRecorderResult = "inbound_saved";
          }
          await this.agentService.handleInboundMessage(preparedInbound);
          this.runtimeDiagnostics.lastAgentHandoffResult = "inbound_handoff_ok";
        } catch (error) {
          const externalId = this.resolveExternalId(message, this.resolveCanonicalChatJid(message));
          this.recentExternalIds.forget(externalId);
          this.runtimeDiagnostics.lastErrorAt = new Date().toISOString();
          this.runtimeDiagnostics.lastErrorStage = "messages.upsert";
          this.runtimeDiagnostics.lastErrorMessage = error instanceof Error ? error.message : String(error);
          console.error("Failed to handle inbound WhatsApp message", error);
        }
      }
    });
  }

  private async stopSocket(): Promise<void> {
    try {
      this.connected = false;

      if (this.socket?.ev?.removeAllListeners) {
        this.socket.ev.removeAllListeners();
      }
      if (this.socket?.end) {
        this.socket.end(undefined);
      }
      if (this.socket?.ws?.close) {
        this.socket.ws.close();
      }
    } catch {
      // Best-effort shutdown only.
    } finally {
      this.socket = undefined;
    }
  }

  async sendText(chatIdOrNumber: string, text: string): Promise<InboundMessage | null> {
    if (!this.socket) {
      throw new Error("WhatsApp socket is not ready");
    }

    const jid = chatIdOrNumber.includes("@") ? chatIdOrNumber : `${normalizeChatNumber(chatIdOrNumber)}@s.whatsapp.net`;
    this.runtimeDiagnostics.lastSendAttemptAt = new Date().toISOString();
    this.runtimeDiagnostics.lastSendTarget = jid;
    this.runtimeDiagnostics.lastSendText = text;
    const content: AnyMessageContent = { text };
    const sentMessage = await this.socket.sendMessage(jid, content);
    const normalized = sentMessage ? await this.normalizeMessage(sentMessage) : null;
    this.runtimeDiagnostics.lastSendExternalId = normalized?.externalId ?? null;
    return normalized;
  }

  private async normalizeMessage(message: any): Promise<InboundMessage> {
    const chatId = this.resolveCanonicalChatJid(message);
    const isGroupChat = isWhatsAppGroupChat(chatId);
    const groupContext = isGroupChat ? await this.resolveGroupContext(chatId) : null;
    const senderNumber = normalizeChatNumber(this.resolveCanonicalAuthorJid(message));
    const senderLid = this.resolveCanonicalAuthorLid(message);
    const externalId = this.resolveExternalId(message, chatId);
    const kind = detectBaileysMessageKind(message.message);
    const text = extractBaileysMessageText(message.message);
    const mimeType = extractBaileysMimeType(message.message);

    return {
      externalId,
      chatId,
      isGroupChat,
      groupContext,
      senderNumber,
      senderLid: senderLid ? normalizeWhatsAppIdentityUser(senderLid) : null,
      senderName: message.pushName ?? null,
      kind,
      text,
      mediaPath: null,
      mimeType,
      transcript: null,
      analysis: null,
      rawPayload: message,
      occurredAt: new Date(Number(message.messageTimestamp) * 1000)
    };
  }

  private async enrichMediaFields(message: any, inbound: InboundMessage): Promise<InboundMessage> {
    if (inbound.kind !== "audio" && inbound.kind !== "image" && inbound.kind !== "document") {
      return inbound;
    }

    const buffer = (await downloadMediaMessage(
      message,
      "buffer",
      {},
      {
        logger: undefined as any,
        reuploadRequest: this.socket.updateMediaMessage
      }
    )) as Buffer;
    const extension = this.extensionFromMime(inbound.mimeType);
    const filePath = await this.mediaService.saveBuffer(`${inbound.externalId}.${extension}`, buffer);

    let transcript: string | null = null;
    let analysis: string | null = null;

    if (inbound.kind === "audio" && this.options?.enableMediaAi) {
      transcript = await this.openAiService.transcribeAudio(filePath);
    }

    if (inbound.kind === "image" && this.options?.enableMediaAi) {
      analysis = await this.openAiService.analyzeImage(filePath, inbound.mimeType || "image/jpeg");
    }

    if (inbound.kind === "document") {
      const readableText = await this.mediaService.extractReadableText(filePath, inbound.mimeType);

      if (this.options?.enableMediaAi) {
        analysis = await this.openAiService.analyzeDocument(filePath, inbound.mimeType, readableText);
      }

      if (!analysis && readableText) {
        analysis = readableText;
      }
    }

    return {
      ...inbound,
      mediaPath: filePath,
      transcript,
      analysis
    };
  }

  private resolveExternalId(message: any, chatId: string): string {
    const explicitId = message?.key?.id;
    if (typeof explicitId === "string" && explicitId.trim()) {
      return explicitId;
    }

    const timestamp = Number(message?.messageTimestamp);
    const occurredAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    const author = normalizeWhatsAppIdentityUser(this.resolveCanonicalAuthorJid(message)) || "unknown";
    const scope = normalizeWhatsAppIdentityUser(chatId) || "chat";
    return `${scope}:${author}:${occurredAt}`;
  }

  private resolveCanonicalChatJid(message: any): string {
    const remoteJid = message.key?.remoteJid as string | undefined;
    const remoteJidAlt = message.key?.remoteJidAlt as string | undefined;

    if (remoteJidAlt && isPnUser(remoteJidAlt) && remoteJid && isLidUser(remoteJid)) {
      return remoteJidAlt;
    }

    return remoteJid || remoteJidAlt || "";
  }

  private resolveCanonicalAuthorJid(message: any): string {
    const participant = message.key?.participant as string | undefined;
    const participantAlt = message.key?.participantAlt as string | undefined;
    const remoteJid = message.key?.remoteJid as string | undefined;
    const remoteJidAlt = message.key?.remoteJidAlt as string | undefined;

    if (participantAlt && isPnUser(participantAlt)) {
      return participantAlt;
    }

    if (participant && isPnUser(participant)) {
      return participant;
    }

    if (remoteJidAlt && isPnUser(remoteJidAlt)) {
      return remoteJidAlt;
    }

    return participant || remoteJid || remoteJidAlt || "";
  }

  private resolveCanonicalAuthorLid(message: any): string | null {
    const participant = message.key?.participant as string | undefined;
    const remoteJid = message.key?.remoteJid as string | undefined;

    if (participant && isLidUser(participant)) {
      return participant;
    }

    if (remoteJid && isLidUser(remoteJid)) {
      return remoteJid;
    }

    return null;
  }

  private extensionFromMime(mimeType: string | null): string {
    if (!mimeType) {
      return "bin";
    }

    const normalized = mimeType.toLowerCase();
    if (normalized.includes("ogg")) {
      return "ogg";
    }
    if (normalized.includes("mpeg") || normalized.includes("mp3")) {
      return "mp3";
    }
    if (normalized.includes("png")) {
      return "png";
    }
    if (normalized.includes("jpeg") || normalized.includes("jpg")) {
      return "jpg";
    }
    if (normalized.includes("plain")) {
      return "txt";
    }
    if (normalized.includes("markdown")) {
      return "md";
    }
    if (normalized.includes("csv")) {
      return "csv";
    }
    if (normalized.includes("json")) {
      return "json";
    }
    if (normalized.includes("xml")) {
      return "xml";
    }
    if (normalized.includes("html")) {
      return "html";
    }
    if (normalized.includes("wordprocessingml.document")) {
      return "docx";
    }
    if (normalized.includes("msword")) {
      return "doc";
    }
    if (normalized.includes("pdf")) {
      return "pdf";
    }

    return normalized.split("/")[1] ?? "bin";
  }

  private summarizeGroupMetadata(metadata: any): any {
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];

    return {
      id: metadata?.id ?? null,
      subject: metadata?.subject ?? null,
      owner: metadata?.owner ?? metadata?.ownerPn ?? null,
      announce: Boolean(metadata?.announce),
      restrict: Boolean(metadata?.restrict),
      memberAddMode: Boolean(metadata?.memberAddMode),
      joinApprovalMode: Boolean(metadata?.joinApprovalMode),
      addressingMode: metadata?.addressingMode ?? null,
      size: Number(metadata?.size ?? participants.length ?? 0),
      participantCount: participants.length
    };
  }

  private async resolveGroupContext(chatId: string): Promise<GroupContext | null> {
    if (!this.socket?.groupMetadata) {
      return null;
    }

    try {
      const metadata = await this.socket.groupMetadata(chatId);
      const participants = Array.isArray(metadata?.participants)
        ? metadata.participants.map((participant: any) => ({
            id: String(participant?.id ?? "").trim(),
            admin: participant?.admin ?? null,
            isAdmin: Boolean(participant?.isAdmin),
            isSuperAdmin: Boolean(participant?.isSuperAdmin)
          }))
        : [];

      return {
        id: metadata?.id ?? chatId,
        subject: metadata?.subject ?? null,
        owner: metadata?.owner ?? metadata?.ownerPn ?? null,
        participantCount: participants.length,
        participants: participants.filter((participant) => participant.id)
      };
    } catch (error) {
      console.warn("Failed to resolve group metadata for inbound message", {
        chatId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}
