import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";

type PromptManifest = {
  promptKey: string;
  description?: string;
  systemFiles: string[];
  schemaFile?: string;
  referenceFiles?: string[];
};

type PromptManifestFile = PromptManifest & {
  manifestName: string;
};

export type ActivePromptPack = {
  promptKey: string;
  manifestName: string;
  version: number;
  versionHash: string;
  systemPrompt: string;
  schemaDescription?: string;
  referenceContext?: string;
  sourceFiles: string[];
  metadata: Record<string, unknown>;
};

export class PromptRegistry {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {}

  async initialize(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<Array<{ promptKey: string; manifestName: string; versionHash: string; activated: boolean }>> {
    const manifests = await this.loadManifestFiles();
    const synced: Array<{ promptKey: string; manifestName: string; versionHash: string; activated: boolean }> = [];
    const seenPromptKeys = new Map<string, string>();

    for (const manifestFile of manifests) {
      const compiled = await this.compileManifest(manifestFile);
      const existingManifest = seenPromptKeys.get(compiled.manifest.promptKey);
      if (existingManifest) {
        throw new Error(
          `Duplicate promptKey "${compiled.manifest.promptKey}" found in prompt manifests: ${existingManifest} and ${compiled.manifestName}`
        );
      }

      seenPromptKeys.set(compiled.manifest.promptKey, compiled.manifestName);

      await this.repository.savePromptVersion({
        promptKey: compiled.manifest.promptKey,
        manifestName: compiled.manifestName,
        content: compiled.systemPrompt,
        versionHash: compiled.versionHash,
        sourceFiles: compiled.sourceFiles,
        metadata: {
          schemaFile: compiled.schemaFile,
          schemaDescription: compiled.schemaDescription,
          referenceFiles: compiled.referenceFiles,
          referenceContext: compiled.referenceContext,
          description: compiled.manifest.description ?? null
        }
      });

      const active = await this.repository.getActivePromptVersion(compiled.manifest.promptKey);
      let activated = false;
      if (!active) {
        await this.repository.activatePromptVersion({
          promptKey: compiled.manifest.promptKey,
          versionHash: compiled.versionHash
        });
        activated = true;
      }

      synced.push({
        promptKey: compiled.manifest.promptKey,
        manifestName: compiled.manifestName,
        versionHash: compiled.versionHash,
        activated
      });
    }

    return synced;
  }

  async activatePromptVersion(input: { promptKey: string; versionHash?: string; version?: number }): Promise<any | null> {
    return this.repository.activatePromptVersion(input);
  }

  async getActivePromptPack(promptKey: string): Promise<ActivePromptPack> {
    let active = await this.repository.getActivePromptVersion(promptKey);
    if (!active) {
      await this.reload();
      active = await this.repository.getActivePromptVersion(promptKey);
    }

    if (!active) {
      throw new Error(`No active prompt version found for prompt key: ${promptKey}`);
    }

    return {
      promptKey: active.prompt_key,
      manifestName: active.manifest_name ?? active.prompt_key,
      version: Number(active.version),
      versionHash: active.version_hash,
      systemPrompt: active.content,
      schemaDescription:
        typeof active.metadata?.schemaDescription === "string" ? active.metadata.schemaDescription : undefined,
      referenceContext:
        typeof active.metadata?.referenceContext === "string" ? active.metadata.referenceContext : undefined,
      sourceFiles: Array.isArray(active.source_files) ? active.source_files : [],
      metadata: active.metadata ?? {}
    };
  }

  private async loadManifestFiles(): Promise<string[]> {
    const manifestsDir = path.join(this.config.promptsDir, "manifests");
    const entries = await fs.readdir(manifestsDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(manifestsDir, entry.name))
      .sort();
  }

  private async compileManifest(manifestPath: string): Promise<{
    manifestName: string;
    manifest: PromptManifest;
    systemPrompt: string;
    schemaDescription?: string;
    referenceContext?: string;
    sourceFiles: string[];
    schemaFile?: string;
    referenceFiles: string[];
    versionHash: string;
  }> {
    const manifestName = path.basename(manifestPath, ".json");
    const manifest = await this.readManifestFile(manifestPath);

    if (!manifest.promptKey) {
      throw new Error(`Prompt manifest ${manifestName} is missing required field "promptKey"`);
    }

    if (!Array.isArray(manifest.systemFiles) || manifest.systemFiles.length === 0) {
      throw new Error(`Prompt manifest ${manifestName} must define a non-empty "systemFiles" array`);
    }

    const systemParts: string[] = [];
    const sourceFiles = [path.relative(this.config.promptsDir, manifestPath)];

    for (const relativeFile of manifest.systemFiles) {
      if (typeof relativeFile !== "string" || !relativeFile.trim()) {
        throw new Error(`Prompt manifest ${manifestName} contains an invalid systemFiles entry`);
      }

      const absoluteFile = path.join(this.config.promptsDir, relativeFile);
      const content = await this.readRequiredTextFile(absoluteFile, manifestName, relativeFile);
      systemParts.push(content.trim());
      sourceFiles.push(relativeFile);
    }

    let schemaDescription: string | undefined;
    if (manifest.schemaFile) {
      if (typeof manifest.schemaFile !== "string" || !manifest.schemaFile.trim()) {
        throw new Error(`Prompt manifest ${manifestName} contains an invalid schemaFile entry`);
      }

      const absoluteSchemaFile = path.join(this.config.promptsDir, manifest.schemaFile);
      schemaDescription = (await this.readRequiredTextFile(absoluteSchemaFile, manifestName, manifest.schemaFile)).trim();
      sourceFiles.push(manifest.schemaFile);
    }

    const referenceFiles: string[] = [];
    const referenceParts: string[] = [];
    if (Array.isArray(manifest.referenceFiles)) {
      for (const relativeFile of manifest.referenceFiles) {
        if (typeof relativeFile !== "string" || !relativeFile.trim()) {
          throw new Error(`Prompt manifest ${manifestName} contains an invalid referenceFiles entry`);
        }

        const absoluteReferenceFile = path.join(this.config.promptsDir, relativeFile);
        const content = (await this.readRequiredTextFile(absoluteReferenceFile, manifestName, relativeFile)).trim();
        referenceFiles.push(relativeFile);
        sourceFiles.push(relativeFile);
        referenceParts.push(`REFERENCE ARTIFACT: ${relativeFile}\n${content}`);
      }
    }
    const referenceContext = referenceParts.length ? referenceParts.join("\n\n---\n\n") : undefined;

    const systemPrompt = systemParts.filter(Boolean).join("\n\n");
    const versionHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          promptKey: manifest.promptKey,
          manifestName,
          systemFiles: manifest.systemFiles,
          schemaFile: manifest.schemaFile ?? null,
          referenceFiles,
          systemPrompt,
          schemaDescription: schemaDescription ?? null,
          referenceContext: referenceContext ?? null
        })
      )
      .digest("hex");

    return {
      manifestName,
      manifest,
      systemPrompt,
      schemaDescription,
      referenceContext,
      sourceFiles,
      schemaFile: manifest.schemaFile,
      referenceFiles,
      versionHash
    };
  }

  private async readManifestFile(manifestPath: string): Promise<PromptManifestFile> {
    const manifestName = path.basename(manifestPath, ".json");

    try {
      const manifestRaw = await fs.readFile(manifestPath, "utf8");
      return { manifestName, ...(JSON.parse(manifestRaw) as PromptManifest) };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load prompt manifest ${manifestName}: ${detail}`);
    }
  }

  private async readRequiredTextFile(absolutePath: string, manifestName: string, relativePath: string): Promise<string> {
    try {
      return await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Prompt manifest ${manifestName} references missing file ${relativePath}: ${detail}`);
    }
  }
}
