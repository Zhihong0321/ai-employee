import { normalizePhoneNumber } from "../lib/phone.js";
import { Repository } from "../database/repository.js";
import { AuthorityContext, AuthorityPolicy } from "../types.js";

const AUTHORITY_POLICY_SETTING_KEY = "authority_policy";

const DEFAULT_POLICY: AuthorityPolicy = {
  singleSourceOfTruthNumber: null,
  requireSingleSourceOfTruthForSensitiveChanges: true
};

function normalizeOptionalNumber(value: unknown): string | null {
  const normalized = normalizePhoneNumber(String(value ?? "").trim());
  return normalized || null;
}

export class AuthorityPolicyService {
  constructor(private readonly repository: Repository) {}

  async getPolicy(): Promise<AuthorityPolicy> {
    const stored = await this.repository.getSetting<Partial<AuthorityPolicy>>(AUTHORITY_POLICY_SETTING_KEY);
    return {
      singleSourceOfTruthNumber: normalizeOptionalNumber(stored?.singleSourceOfTruthNumber),
      requireSingleSourceOfTruthForSensitiveChanges:
        stored?.requireSingleSourceOfTruthForSensitiveChanges !== false
    };
  }

  async savePolicy(input: Partial<AuthorityPolicy>): Promise<AuthorityPolicy> {
    const current = await this.getPolicy();
    const next: AuthorityPolicy = {
      singleSourceOfTruthNumber:
        input.singleSourceOfTruthNumber === undefined
          ? current.singleSourceOfTruthNumber ?? null
          : normalizeOptionalNumber(input.singleSourceOfTruthNumber),
      requireSingleSourceOfTruthForSensitiveChanges:
        input.requireSingleSourceOfTruthForSensitiveChanges === undefined
          ? current.requireSingleSourceOfTruthForSensitiveChanges
          : input.requireSingleSourceOfTruthForSensitiveChanges !== false
    };

    await this.repository.saveSetting(AUTHORITY_POLICY_SETTING_KEY, next);
    return next;
  }

  async buildAuthorityContext(input: {
    senderNumber: string;
    senderName?: string | null;
    senderProfile?: any;
  }): Promise<AuthorityContext> {
    const [policy, initiator, singleSourceContact] = await Promise.all([
      this.getPolicy(),
      this.repository.getSetting<any>("initiator_contact"),
      this.getSingleSourceContact()
    ]);

    return {
      senderNumber: normalizePhoneNumber(input.senderNumber),
      senderName: input.senderName ?? input.senderProfile?.name ?? null,
      senderAuthorityLevel:
        input.senderProfile?.authority_level != null
          ? Number(input.senderProfile.authority_level)
          : input.senderProfile?.authorityLevel != null
            ? Number(input.senderProfile.authorityLevel)
            : null,
      senderIsHumanApi:
        input.senderProfile?.is_human_api != null
          ? Boolean(input.senderProfile.is_human_api)
          : Boolean(input.senderProfile?.isHumanApi),
      initiatorContact: initiator
        ? {
            whatsappNumber: normalizePhoneNumber(initiator.whatsappNumber),
            name: initiator.name ?? null,
            authorityLevel: initiator.authorityLevel != null ? Number(initiator.authorityLevel) : null
          }
        : null,
      singleSourceOfTruthContact: singleSourceContact,
      requireSingleSourceOfTruthForSensitiveChanges: policy.requireSingleSourceOfTruthForSensitiveChanges
    };
  }

  private async getSingleSourceContact() {
    const policy = await this.getPolicy();
    if (!policy.singleSourceOfTruthNumber) {
      return null;
    }

    const contact = await this.repository.getContactByNumber(policy.singleSourceOfTruthNumber);
    return {
      whatsappNumber: policy.singleSourceOfTruthNumber,
      name: contact?.name ?? null,
      authorityLevel:
        contact?.authority_level != null
          ? Number(contact.authority_level)
          : contact?.authorityLevel != null
            ? Number(contact.authorityLevel)
            : null
    };
  }
}
