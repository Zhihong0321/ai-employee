import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "src", "database", "migrations");
const targetDir = path.join(repoRoot, "dist", "database", "migrations");
const promptsSourceDir = path.join(repoRoot, "prompts");
const promptsTargetDir = path.join(repoRoot, "dist", "prompts");

await fs.mkdir(targetDir, { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

await fs.mkdir(promptsTargetDir, { recursive: true });
await fs.cp(promptsSourceDir, promptsTargetDir, { recursive: true });
