import fs from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { loadConfig } from "../config.js";

function installBrokenPipeGuard(): void {
  const guard = (error: any) => {
    if (error?.code === "EPIPE") {
      process.exit(0);
    }
  };

  process.stdout.on("error", guard);
  process.stderr.on("error", guard);
}

async function main(): Promise<void> {
  installBrokenPipeGuard();

  const config = loadConfig();

  await fs.mkdir(config.whatsappAuthDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(config.whatsappAuthDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log("Baileys onboarding starting...");
  console.log(`Auth directory: ${config.whatsappAuthDir}`);
  console.log("Scan the QR code below with the WhatsApp account you want this bot to use.");
  console.log("Press Ctrl+C after you see the connection open.");

  const socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", (update: any) => {
    if (update.qr) {
      qrcode.generate(update.qr, { small: true });
    }

    if (update.connection === "open") {
      const userId = socket.user?.id ?? "unknown";
      const userName = socket.user?.name ?? "unknown";
      console.log("WhatsApp connected.");
      console.log(`Logged in as: ${userName} (${userId})`);
      console.log("Credentials are now stored locally. You can stop this script.");
    }

    if (update.connection === "close") {
      const statusCode = update.lastDisconnect?.error?.output?.statusCode;
      const reason =
        statusCode === DisconnectReason.loggedOut
          ? "logged out"
          : statusCode
            ? `disconnected (${statusCode})`
            : "connection closed";
      console.log(`Connection update: ${reason}`);
    }
  });

  await new Promise<void>(() => {
    // Keep process alive until the user stops it.
  });
}

main().catch((error) => {
  console.error("Baileys onboarding failed", error);
  process.exit(1);
});
