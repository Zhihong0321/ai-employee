import { existsSync } from "node:fs";
import path from "node:path";
import { ActiveSkillPack, ResolvedSkillContext, SkillSelectionEntry, SkillSelectionResult } from "./types.js";
import { SkillRegistry } from "./skill-registry.js";

type SkillSelectorInput = {
  normalizedText?: string | null;
  senderProfile?: any;
  recentContext?: any;
  wakeupReason?: string | null;
  task?: any;
  taskEvents?: any[];
};

export class SkillSelector {
  private static readonly MAX_SELECTED_SKILLS = 3;

  constructor(private readonly skillRegistry: SkillRegistry) {}

  async selectForInbound(input: {
    normalizedText: string;
    senderProfile?: any;
    recentContext?: any;
  }): Promise<SkillSelectionResult> {
    return this.select({
      normalizedText: input.normalizedText,
      senderProfile: input.senderProfile,
      recentContext: input.recentContext
    });
  }

  async selectForWakeup(input: {
    wakeupReason: string;
    task?: any;
    taskEvents?: any[];
  }): Promise<SkillSelectionResult> {
    return this.select({
      wakeupReason: input.wakeupReason,
      task: input.task,
      taskEvents: input.taskEvents
    });
  }

  private async select(input: SkillSelectorInput): Promise<SkillSelectionResult> {
    const activeSkills = await this.skillRegistry.listActiveSkillPacks();
    if (activeSkills.length === 0) {
      return {
        selectedSkills: [],
        consideredSkills: []
      };
    }

    const haystacks = this.buildHaystacks(input);
    const considered = activeSkills
      .map((skill) => this.evaluateSkill(skill, haystacks))
      .sort((left, right) => {
        if (Number(right.selectedByAlways) !== Number(left.selectedByAlways)) {
          return Number(right.selectedByAlways) - Number(left.selectedByAlways);
        }

        if (right.score !== left.score) {
          return right.score - left.score;
        }

        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }

        return left.skillId.localeCompare(right.skillId);
      });

    const alwaysSelected = considered.filter((entry) => entry.available && entry.selectedByAlways);
    const scoredSelected = considered
      .filter((entry) => entry.available && entry.score > 0 && !entry.selectedByAlways)
      .slice(0, SkillSelector.MAX_SELECTED_SKILLS);
    const selected = [...alwaysSelected, ...scoredSelected];

    const selectedSkillIds = new Set(selected.map((entry) => entry.skillId));

    return {
      selectedSkills: selected.map((entry) =>
        this.mapResolvedSkill(entry.skill, entry.selectedByAlways && entry.score === 0 ? "compact" : "full")
      ),
      consideredSkills: considered.map((entry) => ({
        skillId: entry.skillId,
        name: entry.name,
        score: entry.score,
        available: entry.available,
        reasons: entry.reasons,
        selected: selectedSkillIds.has(entry.skillId)
      }))
    };
  }

  private buildHaystacks(input: SkillSelectorInput): {
    textTokens: Set<string>;
    textBlob: string;
    domainTokens: Set<string>;
    taskTokens: Set<string>;
  } {
    const textBlob = [
      input.normalizedText ?? "",
      input.senderProfile?.name ?? "",
      input.senderProfile?.role ?? "",
      input.senderProfile?.branch ?? "",
      Array.isArray(input.senderProfile?.domains) ? input.senderProfile.domains.join(" ") : "",
      input.wakeupReason ?? "",
      input.task?.title ?? "",
      input.task?.details ?? "",
      Array.isArray(input.taskEvents)
        ? input.taskEvents
            .map((event) => JSON.stringify(event?.content ?? event ?? {}))
            .join(" ")
        : "",
      Array.isArray(input.recentContext?.recentMessages)
        ? input.recentContext.recentMessages
            .map((message: any) => [message?.text_content, message?.text, message?.analysis, message?.transcript].filter(Boolean).join(" "))
            .join(" ")
        : ""
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const domainTokens = new Set<string>();
    if (Array.isArray(input.senderProfile?.domains)) {
      for (const domain of input.senderProfile.domains) {
        const normalized = String(domain ?? "").trim().toLowerCase();
        if (normalized) {
          domainTokens.add(normalized);
        }
      }
    }

    return {
      textTokens: new Set(this.tokenize(textBlob)),
      textBlob,
      domainTokens,
      taskTokens: new Set(
        this.tokenize(
          [input.task?.title ?? "", input.task?.details ?? "", input.wakeupReason ?? ""].join(" ").toLowerCase()
        )
      )
    };
  }

  private evaluateSkill(skill: ActiveSkillPack, haystacks: {
    textTokens: Set<string>;
    textBlob: string;
    domainTokens: Set<string>;
    taskTokens: Set<string>;
  }): ActiveSkillPack &
    SkillSelectionEntry & {
      priority: number;
      skill: ActiveSkillPack;
      available: boolean;
      selectedByAlways: boolean;
    } {
    const availability = this.checkRequirements(skill);
    let score = 0;
    const reasons: string[] = [...availability.reasons];

    if (!availability.available) {
      return {
        ...skill,
        skill,
        skillId: skill.skillId,
        name: skill.name,
        score: 0,
        reasons,
        selected: false,
        available: false,
        selectedByAlways: false,
        priority: skill.priority
      };
    }

    for (const trigger of skill.triggers) {
      const normalized = trigger.toLowerCase();
      if (normalized && haystacks.textBlob.includes(normalized)) {
        score += 6;
        reasons.push(`trigger:${trigger}`);
      }
    }

    for (const tag of skill.tags) {
      const normalized = tag.toLowerCase();
      if (haystacks.textTokens.has(normalized) || haystacks.taskTokens.has(normalized)) {
        score += 3;
        reasons.push(`tag:${tag}`);
      }
    }

    for (const domain of skill.domains) {
      const normalized = domain.toLowerCase();
      if (haystacks.domainTokens.has(normalized) || haystacks.textBlob.includes(normalized)) {
        score += 4;
        reasons.push(`domain:${domain}`);
      }
    }

    if (score > 0 && skill.priority > 0) {
      reasons.push(`priority:${skill.priority}`);
    }

    const selectedByAlways = skill.always;
    if (selectedByAlways) {
      reasons.push("always");
    }

    return {
      ...skill,
      skill,
      skillId: skill.skillId,
      name: skill.name,
      score,
      reasons,
      selected: false,
      available: true,
      selectedByAlways,
      priority: skill.priority
    };
  }

  private mapResolvedSkill(skill: ActiveSkillPack, injectionMode: "compact" | "full"): ResolvedSkillContext {
    return {
      skillId: skill.skillId,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      domains: skill.domains,
      triggers: skill.triggers,
      injectionMode,
      instructions: injectionMode === "full" ? skill.instructions : null,
      allowedTools: skill.allowedTools
    };
  }

  private checkRequirements(skill: ActiveSkillPack): { available: boolean; reasons: string[] } {
    const reasons: string[] = [];

    for (const envName of skill.requires.env) {
      if (!process.env[envName]) {
        reasons.push(`missing_env:${envName}`);
      }
    }

    for (const binName of skill.requires.bins) {
      if (!this.hasBinary(binName)) {
        reasons.push(`missing_bin:${binName}`);
      }
    }

    return {
      available: reasons.length === 0,
      reasons
    };
  }

  private hasBinary(binName: string): boolean {
    const pathValue = process.env.PATH;
    if (!pathValue) {
      return false;
    }

    const extensions = process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : [""];

    return pathValue.split(path.delimiter).some((directory) => {
      const trimmedDirectory = directory.trim();
      if (!trimmedDirectory) {
        return false;
      }

      return extensions.some((extension) => {
        const candidate = path.join(
          trimmedDirectory,
          process.platform === "win32" && path.extname(binName) ? binName : `${binName}${extension}`
        );
        return existsSync(candidate);
      });
    });
  }

  private tokenize(value: string): string[] {
    return value
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }
}
