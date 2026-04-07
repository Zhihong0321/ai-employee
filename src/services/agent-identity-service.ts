import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";
import { AgentIdentity } from "../types.js";

const AGENT_IDENTITY_SETTING_KEY = "agent_identity";

function dedupeAliases(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

export class AgentIdentityService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {}

  async getIdentity(): Promise<AgentIdentity> {
    const stored = await this.repository.getSetting<Partial<AgentIdentity>>(AGENT_IDENTITY_SETTING_KEY);
    const configuredName = String(this.config.botName ?? "").trim();
    const configuredRoleDescription = String(this.config.botRoleDescription ?? "").trim();

    return {
      name: String(stored?.name ?? configuredName).trim(),
      aliases: dedupeAliases(
        Array.isArray(stored?.aliases) ? stored.aliases.map((value) => String(value)) : this.config.botAliases ?? []
      ),
      roleDescription: String(stored?.roleDescription ?? configuredRoleDescription).trim()
    };
  }

  async saveIdentity(input: Partial<AgentIdentity>): Promise<AgentIdentity> {
    const current = await this.getIdentity();
    const nextName = String(input.name ?? current.name).trim() || current.name;
    const explicitAliases = Array.isArray(input.aliases)
      ? input.aliases.map((value) => String(value))
      : current.aliases;

    const aliases = dedupeAliases([
      ...explicitAliases,
      ...(current.name.toLowerCase() !== nextName.toLowerCase() ? [current.name] : [])
    ]).filter((alias) => alias.toLowerCase() !== nextName.toLowerCase());

    const next: AgentIdentity = {
      name: nextName,
      aliases,
      roleDescription:
        String(input.roleDescription ?? current.roleDescription).trim() || current.roleDescription
    };

    await this.repository.saveSetting(AGENT_IDENTITY_SETTING_KEY, next);
    return next;
  }
}
