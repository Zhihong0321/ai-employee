import fs from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";

export type WhatsAppOnboardingState = {
  status: "idle" | "starting" | "qr" | "connected" | "closed" | "error";
  qrText?: string | null;
  detail?: string | null;
  userId?: string | null;
  userName?: string | null;
  updatedAt: string;
};

function qrToText(value: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      qrcode.generate(value, { small: true }, (qrText) => {
        resolve(qrText);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export class WhatsAppOnboardingService {
  private socket: any;
  private startPromise?: Promise<void>;
  private restarting = false;
  private state: WhatsAppOnboardingState = {
    status: "idle",
    qrText: null,
    detail: "Not started",
    userId: null,
    userName: null,
    updatedAt: new Date().toISOString()
  };

  constructor(private readonly authDir: string) {}

  getState(): WhatsAppOnboardingState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = undefined;
    });

    return this.startPromise;
  }

  async reset(): Promise<void> {
    this.startPromise = undefined;

    try {
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
    }

    this.socket = undefined;

    await fs.rm(this.authDir, { recursive: true, force: true });
    await fs.mkdir(this.authDir, { recursive: true });

    this.setState({
      status: "idle",
      qrText: null,
      detail: "Auth state cleared. Ready for a fresh QR login.",
      userId: null,
      userName: null
    });
  }

  private async startInternal(): Promise<void> {
    this.setState({
      status: "starting",
      qrText: null,
      detail: "Initializing Baileys onboarding session...",
      userId: null,
      userName: null
    });

    await fs.mkdir(this.authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false
    });

    this.socket.ev.on("creds.update", saveCreds);
    this.socket.ev.on("connection.update", async (update: any) => {
      try {
        if (update.qr) {
          const qrText = await qrToText(update.qr);
          this.setState({
            status: "qr",
            qrText,
            detail: "Scan this QR with the WhatsApp account you want the bot to use.",
            userId: null,
            userName: null
          });
        }

        if (update.connection === "open") {
          this.setState({
            status: "connected",
            qrText: null,
            detail: "WhatsApp connected. Credentials are stored locally.",
            userId: this.socket.user?.id ?? null,
            userName: this.socket.user?.name ?? null
          });
        }

        if (update.connection === "close") {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.restartRequired) {
            this.setState({
              status: "starting",
              qrText: null,
              detail: "Pairing accepted. Restarting Baileys session to complete login...",
              userId: this.socket?.user?.id ?? null,
              userName: this.socket?.user?.name ?? null
            });

            void this.restart();
            return;
          }

          const detail =
            statusCode === DisconnectReason.loggedOut
              ? "WhatsApp logged out. Delete auth files and restart onboarding if you want a fresh login."
              : statusCode
                ? `Connection closed with status ${statusCode}.`
                : "Connection closed.";

          this.setState({
            status: "closed",
            qrText: null,
            detail,
            userId: this.socket?.user?.id ?? null,
            userName: this.socket?.user?.name ?? null
          });
        }
      } catch (error) {
        this.setState({
          status: "error",
          qrText: null,
          detail: error instanceof Error ? error.message : "Onboarding update failed",
          userId: null,
          userName: null
        });
      }
    });
  }

  private async restart(): Promise<void> {
    if (this.restarting) {
      return;
    }

    this.restarting = true;

    try {
      try {
        if (this.socket?.end) {
          this.socket.end(undefined);
        }
      } catch {
        // Ignore socket shutdown errors during restart.
      }

      this.socket = undefined;

      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.startInternal();
    } finally {
      this.restarting = false;
    }
  }

  private setState(next: Omit<WhatsAppOnboardingState, "updatedAt">): void {
    this.state = {
      ...next,
      updatedAt: new Date().toISOString()
    };
  }
}
