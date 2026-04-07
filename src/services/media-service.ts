import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

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
}
