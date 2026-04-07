import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";
import { ActiveSkillPack, SkillManifest, SkillManifestFile, SkillRequirements, SkillStatus } from "./types.js";

const VALID_SKILL_STATUSES = new Set<SkillStatus>(["draft", "ready", "disabled"]);

export class SkillRegistry {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {}

  async initialize(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<Array<{ skillId: string; manifestName: string; versionHash: string }>> {
    const packageDirs = await this.loadSkillPackageDirs();
    const synced: Array<{ skillId: string; manifestName: string; versionHash: string }> = [];
    const seenSkillIds = new Map<string, string>();

    for (const packageDir of packageDirs) {
      const compiled = await this.compilePackage(packageDir);
      const existingManifest = seenSkillIds.get(compiled.manifest.skillId);
      if (existingManifest) {
        throw new Error(
          `Duplicate skillId "${compiled.manifest.skillId}" found in skill packages: ${existingManifest} and ${compiled.manifestName}`
        );
      }

      seenSkillIds.set(compiled.manifest.skillId, compiled.manifestName);

      await this.repository.saveSkillVersion({
        skillId: compiled.manifest.skillId,
        manifestName: compiled.manifestName,
        content: compiled.instructions,
        versionHash: compiled.versionHash,
        sourceFiles: compiled.sourceFiles,
        metadata: {
          ...compiled.manifest,
          description: compiled.manifest.description
        }
      });

      synced.push({
        skillId: compiled.manifest.skillId,
        manifestName: compiled.manifestName,
        versionHash: compiled.versionHash
      });
    }

    return synced;
  }

  async activateSkillVersion(input: { skillId: string; versionHash?: string; version?: number }): Promise<any | null> {
    return this.repository.activateSkillVersion(input);
  }

  async listActiveSkillPacks(): Promise<ActiveSkillPack[]> {
    const rows = await this.repository.listActiveSkillVersions();
    return rows.map((row) => this.mapActiveSkillRow(row));
  }

  async getActiveSkillPack(skillId: string): Promise<ActiveSkillPack | null> {
    const row = await this.repository.getActiveSkillVersion(skillId);
    return row ? this.mapActiveSkillRow(row) : null;
  }

  private async loadSkillPackageDirs(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.skillsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(this.config.skillsDir, entry.name))
        .sort();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async compilePackage(packageDir: string): Promise<{
    manifestName: string;
    manifest: SkillManifest;
    instructions: string;
    sourceFiles: string[];
    versionHash: string;
  }> {
    const manifestName = path.basename(packageDir);
    const manifestPath = path.join(packageDir, "skill.json");
    const instructionsPath = path.join(packageDir, "SKILL.md");
    const manifest = await this.readManifestFile(manifestPath, manifestName);
    const instructions = (await this.readRequiredTextFile(instructionsPath, manifestName, "SKILL.md")).trim();

    if (!manifest.skillId) {
      throw new Error(`Skill package ${manifestName} is missing required field "skillId"`);
    }

    if (!manifest.name) {
      throw new Error(`Skill package ${manifestName} is missing required field "name"`);
    }

    if (!manifest.description) {
      throw new Error(`Skill package ${manifestName} is missing required field "description"`);
    }

    if (!VALID_SKILL_STATUSES.has(manifest.status)) {
      throw new Error(`Skill package ${manifestName} has unsupported status "${String(manifest.status)}"`);
    }

    const sourceFiles = [
      path.relative(this.config.skillsDir, manifestPath),
      path.relative(this.config.skillsDir, instructionsPath)
    ];

    const versionHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          manifestName,
          manifest,
          instructions
        })
      )
      .digest("hex");

    return {
      manifestName,
      manifest,
      instructions,
      sourceFiles,
      versionHash
    };
  }

  private async readManifestFile(manifestPath: string, manifestName: string): Promise<SkillManifestFile> {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SkillManifest>;
      return {
        manifestName,
        skillId: String(parsed.skillId ?? "").trim(),
        name: String(parsed.name ?? "").trim(),
        description: String(parsed.description ?? "").trim(),
        tags: this.normalizeStringArray(parsed.tags),
        domains: this.normalizeStringArray(parsed.domains),
        triggers: this.normalizeStringArray(parsed.triggers),
        allowedTools: this.normalizeStringArray(parsed.allowedTools),
        priority: Number.isFinite(Number(parsed.priority)) ? Number(parsed.priority) : 0,
        always: Boolean((parsed as any).always),
        requires: this.normalizeRequirements((parsed as any).requires),
        status: String(parsed.status ?? "draft").trim().toLowerCase() as SkillStatus
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load skill package ${manifestName}: ${detail}`);
    }
  }

  private async readRequiredTextFile(absolutePath: string, manifestName: string, relativePath: string): Promise<string> {
    try {
      return await fs.readFile(absolutePath, "utf8");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Skill package ${manifestName} references missing file ${relativePath}: ${detail}`);
    }
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }

  private normalizeRequirements(value: unknown): SkillRequirements {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
      bins: this.normalizeStringArray(raw.bins),
      env: this.normalizeStringArray(raw.env)
    };
  }

  private mapActiveSkillRow(row: any): ActiveSkillPack {
    const metadata = row.metadata ?? {};
    return {
      skillId: row.skill_id,
      manifestName: row.manifest_name ?? row.skill_id,
      version: Number(row.version),
      versionHash: row.version_hash,
      instructions: row.content,
      name: String(metadata.name ?? row.skill_id),
      description: String(metadata.description ?? ""),
      tags: Array.isArray(metadata.tags) ? metadata.tags.map((item: unknown) => String(item)) : [],
      domains: Array.isArray(metadata.domains) ? metadata.domains.map((item: unknown) => String(item)) : [],
      triggers: Array.isArray(metadata.triggers) ? metadata.triggers.map((item: unknown) => String(item)) : [],
      allowedTools: Array.isArray(metadata.allowedTools)
        ? metadata.allowedTools.map((item: unknown) => String(item))
        : [],
      priority: Number.isFinite(Number(metadata.priority)) ? Number(metadata.priority) : 0,
      always: Boolean(metadata.always),
      requires: this.normalizeRequirements(metadata.requires),
      status: VALID_SKILL_STATUSES.has(metadata.status as SkillStatus) ? (metadata.status as SkillStatus) : "draft",
      sourceFiles: Array.isArray(row.source_files) ? row.source_files.map((item: unknown) => String(item)) : [],
      metadata
    };
  }
}
