import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

const READABLE_TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/xml",
  "text/html",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/rtf",
  "application/x-yaml",
  "application/yaml",
  "application/toml"
]);

const READABLE_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".yml",
  ".yaml",
  ".log",
  ".ini",
  ".conf",
  ".toml",
  ".rtf",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".sql"
]);

export class MediaService {
  constructor(private readonly mediaStorageDir: string) {}

  async ensureStorage(): Promise<void> {
    await fs.mkdir(this.mediaStorageDir, { recursive: true });
  }

  async saveBuffer(fileName: string, buffer: Buffer): Promise<string> {
    await this.ensureStorage();
    const target = path.join(this.mediaStorageDir, fileName);
    await fs.writeFile(target, buffer);
    return target;
  }

  async extractPdfText(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }

  async extractReadableText(filePath: string, mimeType?: string | null): Promise<string> {
    if (this.isPdfMimeType(mimeType, filePath)) {
      return this.extractPdfText(filePath);
    }

    if (!this.isReadableTextFile(filePath, mimeType)) {
      return "";
    }

    const text = await fs.readFile(filePath, "utf8");
    return text.trim();
  }

  isReadableTextFile(filePath: string, mimeType?: string | null): boolean {
    if (this.isPdfMimeType(mimeType, filePath)) {
      return true;
    }

    const normalizedMimeType = String(mimeType ?? "").trim().toLowerCase();
    if (normalizedMimeType && (normalizedMimeType.startsWith("text/") || READABLE_TEXT_MIME_TYPES.has(normalizedMimeType))) {
      return true;
    }

    const extension = path.extname(filePath).toLowerCase();
    return READABLE_TEXT_EXTENSIONS.has(extension);
  }

  private isPdfMimeType(mimeType: string | null | undefined, filePath: string): boolean {
    const normalizedMimeType = String(mimeType ?? "").trim().toLowerCase();
    if (normalizedMimeType === "application/pdf" || normalizedMimeType.endsWith("/pdf")) {
      return true;
    }

    return path.extname(filePath).toLowerCase() === ".pdf";
  }
}
