import { Repository } from "../database/repository.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { ContactRecord } from "../types.js";

export class BootstrapService {
  constructor(private readonly repository: Repository) {}

  async ensureBootstrapContact(contact?: ContactRecord | null): Promise<void> {
    if (!contact?.whatsappNumber) {
      return;
    }

    const normalized = normalizePhoneNumber(contact.whatsappNumber);
    await this.repository.upsertContact({
      ...contact,
      whatsappNumber: normalized,
      isHumanApi: true,
      autonomousOutreach: contact.autonomousOutreach ?? true
    });

    await this.repository.saveSetting("initiator_contact", {
      whatsappNumber: normalized,
      name: contact.name,
      role: contact.role ?? "Initiator",
      authorityLevel: contact.authorityLevel ?? 5
    });
  }
}
