export type SkillStatus = "draft" | "ready" | "disabled";
export type SkillInjectionMode = "compact" | "full";

export type SkillRequirements = {
  bins: string[];
  env: string[];
};

export type SkillManifest = {
  skillId: string;
  name: string;
  description: string;
  tags: string[];
  domains: string[];
  triggers: string[];
  allowedTools: string[];
  priority: number;
  always: boolean;
  requires: SkillRequirements;
  status: SkillStatus;
};

export type SkillManifestFile = SkillManifest & {
  manifestName: string;
};

export type ActiveSkillPack = {
  skillId: string;
  manifestName: string;
  version: number;
  versionHash: string;
  instructions: string;
  name: string;
  description: string;
  tags: string[];
  domains: string[];
  triggers: string[];
  allowedTools: string[];
  priority: number;
  always: boolean;
  requires: SkillRequirements;
  status: SkillStatus;
  sourceFiles: string[];
  metadata: Record<string, unknown>;
};

export type ResolvedSkillContext = {
  skillId: string;
  name: string;
  description: string;
  tags: string[];
  domains: string[];
  triggers: string[];
  injectionMode: SkillInjectionMode;
  instructions: string | null;
  allowedTools: string[];
};

export type SkillSelectionEntry = {
  skillId: string;
  name: string;
  score: number;
  available: boolean;
  reasons: string[];
  selected: boolean;
};

export type SkillSelectionResult = {
  selectedSkills: ResolvedSkillContext[];
  consideredSkills: SkillSelectionEntry[];
};
