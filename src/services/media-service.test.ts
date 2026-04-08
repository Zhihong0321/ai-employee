import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, test } from "vitest";
import { MediaService } from "./media-service.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
  tempDirs = [];
});

async function createTempFile(fileName: string, content: string | Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "media-service-test-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);
  return filePath;
}

test("extractReadableText reads plain text files", async () => {
  const service = new MediaService("/tmp/media-service-test");
  const filePath = await createTempFile("notes.txt", "  Hello WhatsApp attachment  \n\n");

  const text = await service.extractReadableText(filePath, "text/plain");

  assert.equal(text, "Hello WhatsApp attachment");
});

test("isReadableTextFile recognizes markdown and json files", () => {
  const service = new MediaService("/tmp/media-service-test");

  assert.equal(service.isReadableTextFile("/tmp/sample.md", null), true);
  assert.equal(service.isReadableTextFile("/tmp/sample.json", "application/octet-stream"), true);
  assert.equal(service.isReadableTextFile("/tmp/sample.bin", "application/octet-stream"), false);
});
