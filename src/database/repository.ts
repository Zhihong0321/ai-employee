import { Pool, PoolClient } from "pg";
import { ContactRecord, InboundMessage, MemoryIndexEntry, StoredMessageInput } from "../types.js";
import { DebugConfig, DebugSeverity, DebugStage } from "../debug/types.js";
import { LlmCallType, LlmModelPricingEntry, LlmProviderName } from "../llm/types.js";
import { inferTimezoneFromWhatsappNumber } from "../lib/timezone.js";
import { TaskCharter, TaskSnapshot, buildTaskCharter, buildTaskSnapshot, normalizeTaskStatus } from "../agent/task-core.js";

const LLM_MODEL_PRICING_SETTING_KEY = "llm_model_pricing";
const DEBUG_CONFIG_SETTING_KEY = "debug_config";
const TESTER_WHATSAPP_NUMBERS_SETTING_KEY = "tester_whatsapp_numbers";

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function parseMemoryIndexRow(row: any): MemoryIndexEntry {
  return {
    id: Number(row.id),
    memoryKey: row.memory_key,
    memoryType: row.memory_type,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    title: row.title,
    summary: row.summary,
    sourceTable: row.source_table,
    sourceRef: row.source_ref,
    tags: parseTextArray(row.tags),
    entities: parseTextArray(row.entities),
    importanceScore: parseNullableNumber(row.importance_score),
    freshnessScore: parseNullableNumber(row.freshness_score),
    confidence: parseNullableNumber(row.confidence),
    metadata: row.metadata ?? {},
    updatedAt: row.updated_at ?? null
  };
}

function parseTaskOptimizationCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseTaskRow(row: any): any {
  if (!row) {
    return row;
  }

  const metadata = row.metadata ?? {};
  const fallbackLastOptimizedAt =
    row.last_optimized_at ??
    (typeof metadata?.last_optimized_at === "string" ? metadata.last_optimized_at : null);
  const fallbackOptimizationCount =
    row.sdmo_optimization_count ?? parseTaskOptimizationCount(metadata?.sdmo_optimization_count);

  return {
    ...row,
    last_optimized_at: fallbackLastOptimizedAt,
    sdmo_optimization_count: parseTaskOptimizationCount(fallbackOptimizationCount)
  };
}

function resolveContactTimezone(input: {
  whatsappNumber: string;
  timezone?: string | null;
  timezoneSource?: string | null;
}): { timezone: string | null; timezoneSource: string | null } {
  const explicitTimezone = input.timezone?.trim();
  if (explicitTimezone) {
    return {
      timezone: explicitTimezone,
      timezoneSource: input.timezoneSource?.trim() || "manual"
    };
  }

  const inferred = inferTimezoneFromWhatsappNumber(input.whatsappNumber);
  return {
    timezone: inferred?.timezone ?? null,
    timezoneSource: inferred?.source ?? null
  };
}

export class Repository {
  constructor(private readonly pool: Pool) { }

  private async getContactByNumberWithClient(client: Pool | PoolClient, whatsappNumber: string): Promise<any | null> {
    const result = await client.query("SELECT * FROM contacts WHERE whatsapp_number = $1", [whatsappNumber]);
    return result.rowCount ? result.rows[0] : null;
  }

  private async getContactByLidWithClient(client: Pool | PoolClient, whatsappLid: string): Promise<any | null> {
    const result = await client.query("SELECT * FROM contacts WHERE whatsapp_lid = $1", [whatsappLid]);
    return result.rowCount ? result.rows[0] : null;
  }

  async saveSetting(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO system_settings (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
      `,
      [key, JSON.stringify(value)]
    );
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const result = await this.pool.query("SELECT value_json FROM system_settings WHERE key = $1", [key]);
    return result.rowCount ? (result.rows[0].value_json as T) : null;
  }

  async getLlmModelPricing(): Promise<LlmModelPricingEntry[]> {
    const stored = await this.getSetting<LlmModelPricingEntry[]>(LLM_MODEL_PRICING_SETTING_KEY);
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map((entry) => ({
        provider: entry?.provider,
        model: String(entry?.model ?? "").trim(),
        inputCostPerTokenMyr: Number(entry?.inputCostPerTokenMyr ?? 0),
        outputCostPerTokenMyr: Number(entry?.outputCostPerTokenMyr ?? 0)
      }))
      .filter(
        (entry): entry is LlmModelPricingEntry =>
          (entry.provider === "openai" || entry.provider === "uniapi-openai" || entry.provider === "uniapi-gemini") &&
          Boolean(entry.model) &&
          Number.isFinite(entry.inputCostPerTokenMyr) &&
          Number.isFinite(entry.outputCostPerTokenMyr)
      );
  }

  async saveLlmModelPricing(entries: LlmModelPricingEntry[]): Promise<void> {
    await this.saveSetting(LLM_MODEL_PRICING_SETTING_KEY, entries);
  }

  async getDebugConfig(): Promise<DebugConfig> {
    const stored = await this.getSetting<Partial<DebugConfig>>(DEBUG_CONFIG_SETTING_KEY);
    return {
      mode:
        stored?.mode === "debug_basic" ||
          stored?.mode === "debug_verbose" ||
          stored?.mode === "debug_trace"
          ? stored.mode
          : "debug_off",
      promptTrace: Boolean(stored?.promptTrace),
      apiPayloadTrace: Boolean(stored?.apiPayloadTrace),
      enabledTaskIds: Array.isArray(stored?.enabledTaskIds)
        ? stored.enabledTaskIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [],
      enabledToolNames: Array.isArray(stored?.enabledToolNames)
        ? stored.enabledToolNames.map((value) => String(value))
        : []
    };
  }

  async saveDebugConfig(config: DebugConfig): Promise<void> {
    await this.saveSetting(DEBUG_CONFIG_SETTING_KEY, config);
  }

  async getTesterWhatsappNumbers(): Promise<string[]> {
    const stored = await this.getSetting<unknown>(TESTER_WHATSAPP_NUMBERS_SETTING_KEY);
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  }

  async saveTesterWhatsappNumbers(numbers: string[]): Promise<void> {
    await this.saveSetting(TESTER_WHATSAPP_NUMBERS_SETTING_KEY, numbers);
  }

  async addLlmCallLog(input: {
    providerName: LlmProviderName;
    model: string;
    callType: LlmCallType;
    success: boolean;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    inputCostPerTokenMyr?: number | null;
    outputCostPerTokenMyr?: number | null;
    inputCostMyr?: number | null;
    outputCostMyr?: number | null;
    totalCostMyr?: number | null;
    latencyMs?: number | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO llm_call_logs (
        provider_name, model, call_type, success,
        input_tokens, output_tokens, total_tokens,
        input_cost_per_token_myr, output_cost_per_token_myr,
        input_cost_myr, output_cost_myr, total_cost_myr,
        latency_ms, error_message, metadata
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11, $12,
        $13, $14, $15::jsonb
      )
      `,
      [
        input.providerName,
        input.model,
        input.callType,
        input.success,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.totalTokens ?? null,
        input.inputCostPerTokenMyr ?? null,
        input.outputCostPerTokenMyr ?? null,
        input.inputCostMyr ?? null,
        input.outputCostMyr ?? null,
        input.totalCostMyr ?? null,
        input.latencyMs ?? null,
        input.errorMessage ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  async listRecentLlmCallLogs(limit = 100): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT
        id,
        provider_name,
        model,
        call_type,
        success,
        input_tokens,
        output_tokens,
        total_tokens,
        input_cost_per_token_myr,
        output_cost_per_token_myr,
        input_cost_myr,
        output_cost_myr,
        total_cost_myr,
        latency_ms,
        error_message,
        metadata,
        created_at
      FROM llm_call_logs
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      ...row,
      input_tokens: parseNullableNumber(row.input_tokens),
      output_tokens: parseNullableNumber(row.output_tokens),
      total_tokens: parseNullableNumber(row.total_tokens),
      input_cost_per_token_myr: parseNullableNumber(row.input_cost_per_token_myr),
      output_cost_per_token_myr: parseNullableNumber(row.output_cost_per_token_myr),
      input_cost_myr: parseNullableNumber(row.input_cost_myr),
      output_cost_myr: parseNullableNumber(row.output_cost_myr),
      total_cost_myr: parseNullableNumber(row.total_cost_myr),
      latency_ms: parseNullableNumber(row.latency_ms)
    }));
  }

  async listKnownLlmModels(limit = 50): Promise<Array<{ provider: LlmProviderName; model: string; lastUsedAt: string }>> {
    const result = await this.pool.query(
      `
      SELECT
        provider_name AS provider,
        model,
        MAX(created_at) AS last_used_at
      FROM llm_call_logs
      GROUP BY provider_name, model
      ORDER BY MAX(created_at) DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      provider: row.provider as LlmProviderName,
      model: row.model,
      lastUsedAt: row.last_used_at
    }));
  }

  async ensureDefaultPrompt(content: string): Promise<void> {
    const existing = await this.pool.query(
      "SELECT 1 FROM prompt_hub_versions WHERE prompt_key = 'system' AND is_active = TRUE LIMIT 1"
    );

    if (existing.rowCount) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO prompt_hub_versions (prompt_key, version, content, is_active)
      VALUES ('system', 1, $1, TRUE)
      `,
      [content]
    );
  }

  async getActivePrompt(): Promise<string> {
    const result = await this.pool.query(
      "SELECT content FROM prompt_hub_versions WHERE prompt_key = 'system' AND is_active = TRUE ORDER BY version DESC LIMIT 1"
    );

    return result.rowCount ? result.rows[0].content : "";
  }

  async listPromptVersions(promptKey?: string): Promise<any[]> {
    const result = promptKey
      ? await this.pool.query(
        `
          SELECT *
          FROM prompt_hub_versions
          WHERE prompt_key = $1
          ORDER BY version DESC
          `,
        [promptKey]
      )
      : await this.pool.query(
        `
          SELECT *
          FROM prompt_hub_versions
          ORDER BY prompt_key ASC, version DESC
          `
      );

    return result.rows;
  }

  async getActivePromptVersion(promptKey: string): Promise<any | null> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM prompt_hub_versions
      WHERE prompt_key = $1 AND is_active = TRUE
      ORDER BY version DESC
      LIMIT 1
      `,
      [promptKey]
    );

    return result.rowCount ? result.rows[0] : null;
  }

  async savePromptVersion(input: {
    promptKey: string;
    manifestName: string;
    content: string;
    versionHash: string;
    sourceFiles: string[];
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const existing = await this.pool.query(
      `
      SELECT *
      FROM prompt_hub_versions
      WHERE prompt_key = $1 AND version_hash = $2
      LIMIT 1
      `,
      [input.promptKey, input.versionHash]
    );

    if (existing.rowCount) {
      return existing.rows[0];
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const versionResult = await client.query(
        `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM prompt_hub_versions
        WHERE prompt_key = $1
        `,
        [input.promptKey]
      );

      const nextVersion = Number(versionResult.rows[0]?.next_version ?? 1);
      const inserted = await client.query(
        `
        INSERT INTO prompt_hub_versions (
          prompt_key, version, content, is_active, manifest_name, version_hash, source_files, metadata
        ) VALUES ($1, $2, $3, FALSE, $4, $5, $6::jsonb, $7::jsonb)
        RETURNING *
        `,
        [
          input.promptKey,
          nextVersion,
          input.content,
          input.manifestName,
          input.versionHash,
          JSON.stringify(input.sourceFiles),
          JSON.stringify(input.metadata ?? {})
        ]
      );

      await client.query("COMMIT");
      return inserted.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async activatePromptVersion(input: {
    promptKey: string;
    version?: number;
    versionHash?: string;
  }): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const targetResult = input.versionHash
        ? await client.query(
          `
            SELECT *
            FROM prompt_hub_versions
            WHERE prompt_key = $1 AND version_hash = $2
            LIMIT 1
            `,
          [input.promptKey, input.versionHash]
        )
        : await client.query(
          `
            SELECT *
            FROM prompt_hub_versions
            WHERE prompt_key = $1 AND version = $2
            LIMIT 1
            `,
          [input.promptKey, input.version ?? 0]
        );

      if (!targetResult.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const target = targetResult.rows[0];

      await client.query(
        `
        UPDATE prompt_hub_versions
        SET is_active = FALSE
        WHERE prompt_key = $1 AND is_active = TRUE
        `,
        [input.promptKey]
      );

      await client.query(
        `
        UPDATE prompt_hub_versions
        SET is_active = TRUE, activated_at = NOW()
        WHERE id = $1
        `,
        [target.id]
      );

      await client.query("COMMIT");
      return this.getActivePromptVersion(input.promptKey);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listSkillVersions(skillId?: string): Promise<any[]> {
    const result = skillId
      ? await this.pool.query(
        `
          SELECT *
          FROM skill_hub_versions
          WHERE skill_id = $1
          ORDER BY version DESC
          `,
        [skillId]
      )
      : await this.pool.query(
        `
          SELECT *
          FROM skill_hub_versions
          ORDER BY skill_id ASC, version DESC
          `
      );

    return result.rows;
  }

  async getActiveSkillVersion(skillId: string): Promise<any | null> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM skill_hub_versions
      WHERE skill_id = $1 AND is_active = TRUE
      ORDER BY version DESC
      LIMIT 1
      `,
      [skillId]
    );

    return result.rowCount ? result.rows[0] : null;
  }

  async listActiveSkillVersions(): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM skill_hub_versions
      WHERE is_active = TRUE
      ORDER BY COALESCE((metadata->>'priority')::INTEGER, 0) DESC, skill_id ASC
      `
    );

    return result.rows;
  }

  async saveSkillVersion(input: {
    skillId: string;
    manifestName: string;
    content: string;
    versionHash: string;
    sourceFiles: string[];
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const existing = await this.pool.query(
      `
      SELECT *
      FROM skill_hub_versions
      WHERE skill_id = $1 AND version_hash = $2
      LIMIT 1
      `,
      [input.skillId, input.versionHash]
    );

    if (existing.rowCount) {
      return existing.rows[0];
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const versionResult = await client.query(
        `
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM skill_hub_versions
        WHERE skill_id = $1
        `,
        [input.skillId]
      );

      const nextVersion = Number(versionResult.rows[0]?.next_version ?? 1);
      const inserted = await client.query(
        `
        INSERT INTO skill_hub_versions (
          skill_id, version, content, is_active, manifest_name, version_hash, source_files, metadata
        ) VALUES ($1, $2, $3, FALSE, $4, $5, $6::jsonb, $7::jsonb)
        RETURNING *
        `,
        [
          input.skillId,
          nextVersion,
          input.content,
          input.manifestName,
          input.versionHash,
          JSON.stringify(input.sourceFiles),
          JSON.stringify(input.metadata ?? {})
        ]
      );

      await client.query("COMMIT");
      return inserted.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async activateSkillVersion(input: {
    skillId: string;
    version?: number;
    versionHash?: string;
  }): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const targetResult = input.versionHash
        ? await client.query(
          `
            SELECT *
            FROM skill_hub_versions
            WHERE skill_id = $1 AND version_hash = $2
            LIMIT 1
            `,
          [input.skillId, input.versionHash]
        )
        : await client.query(
          `
            SELECT *
            FROM skill_hub_versions
            WHERE skill_id = $1 AND version = $2
            LIMIT 1
            `,
          [input.skillId, input.version ?? 0]
        );

      if (!targetResult.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }

      const target = targetResult.rows[0];

      await client.query(
        `
        UPDATE skill_hub_versions
        SET is_active = FALSE
        WHERE skill_id = $1 AND is_active = TRUE
        `,
        [input.skillId]
      );

      await client.query(
        `
        UPDATE skill_hub_versions
        SET is_active = TRUE, activated_at = NOW()
        WHERE id = $1
        `,
        [target.id]
      );

      await client.query("COMMIT");
      return this.getActiveSkillVersion(input.skillId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveStoredMessage(input: StoredMessageInput): Promise<boolean> {
    const result = await this.pool.query(
      `
        INSERT INTO messages (
          external_id, chat_id, sender_number, sender_name, direction, kind,
          text_content, transcript, analysis, media_path, mime_type, raw_payload, occurred_at,
          contact_id, contact_number, author_number, author_name, is_from_me
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12::jsonb, $13,
          $14, $15, $16, $17, $18
        )
        ON CONFLICT (external_id) DO NOTHING
        RETURNING id
        `,
      [
        input.externalId,
        input.chatId,
        input.senderNumber,
        input.senderName ?? null,
        input.direction,
        input.kind,
        input.text,
        input.transcript ?? null,
        input.analysis ?? null,
        input.mediaPath ?? null,
        input.mimeType ?? null,
        JSON.stringify(input.rawPayload ?? {}),
        input.occurredAt,
        input.contactId ?? null,
        input.contactNumber ?? input.senderNumber,
        input.authorNumber ?? null,
        input.authorName ?? null,
        input.isFromMe ?? input.direction === "outbound"
      ]
    );

    return result.rowCount > 0;
  }

  async saveMessage(input: InboundMessage, direction: "inbound" | "outbound"): Promise<boolean> {
    return this.saveStoredMessage({
      externalId: input.externalId,
      chatId: input.chatId,
      senderNumber: input.senderNumber,
      senderName: input.senderName ?? null,
      direction,
      kind: input.kind,
      text: input.text,
      mediaPath: input.mediaPath ?? null,
      mimeType: input.mimeType ?? null,
      transcript: input.transcript ?? null,
      analysis: input.analysis ?? null,
      rawPayload: input.rawPayload ?? {},
      occurredAt: input.occurredAt,
      contactNumber: input.senderNumber,
      authorNumber: direction === "inbound" ? input.senderNumber : null,
      authorName: input.senderName ?? null,
      isFromMe: direction === "outbound"
    });
  }

  async upsertContact(contact: ContactRecord): Promise<void> {
    const hasExplicitTimezone = Boolean(contact.timezone?.trim());
    const resolvedTimezone = resolveContactTimezone({
      whatsappNumber: contact.whatsappNumber,
      timezone: contact.timezone ?? null,
      timezoneSource: contact.timezoneSource ?? null
    });

    await this.pool.query(
      `
      INSERT INTO contacts (
        whatsapp_number, name, role, branch, authority_level, domains,
        is_human_api, notes, source, is_internal, department, relation_type, about_person,
        whatsapp_lid, autonomous_outreach, timezone, timezone_source, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, COALESCE($15, FALSE), $16, $17, NOW())
      ON CONFLICT (whatsapp_number)
      DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        branch = EXCLUDED.branch,
        authority_level = EXCLUDED.authority_level,
        domains = EXCLUDED.domains,
        is_human_api = EXCLUDED.is_human_api,
        notes = EXCLUDED.notes,
        source = EXCLUDED.source,
        is_internal = EXCLUDED.is_internal,
        department = EXCLUDED.department,
        relation_type = EXCLUDED.relation_type,
        about_person = EXCLUDED.about_person,
        whatsapp_lid = COALESCE(EXCLUDED.whatsapp_lid, contacts.whatsapp_lid),
        autonomous_outreach = COALESCE($15, contacts.autonomous_outreach),
        timezone = CASE
          WHEN $18 THEN EXCLUDED.timezone
          ELSE COALESCE(contacts.timezone, EXCLUDED.timezone)
        END,
        timezone_source = CASE
          WHEN $18 THEN EXCLUDED.timezone_source
          ELSE COALESCE(contacts.timezone_source, EXCLUDED.timezone_source)
        END,
        updated_at = NOW()
      `,
      [
        contact.whatsappNumber,
        contact.name,
        contact.role ?? null,
        contact.branch ?? null,
        contact.authorityLevel ?? null,
        contact.domains ?? [],
        contact.isHumanApi ?? true,
        contact.notes ?? null,
        contact.source ?? null,
        contact.isInternal ?? false,
        contact.department ?? null,
        contact.relationType ?? null,
        contact.aboutPerson ?? null,
        contact.whatsappLid ?? null,
        contact.autonomousOutreach ?? null,
        resolvedTimezone.timezone,
        resolvedTimezone.timezoneSource,
        hasExplicitTimezone
      ]
    );
  }

  async getContactByNumber(whatsappNumber: string): Promise<any | null> {
    return this.getContactByNumberWithClient(this.pool, whatsappNumber);
  }

  async getContactByLid(whatsappLid: string): Promise<any | null> {
    return this.getContactByLidWithClient(this.pool, whatsappLid);
  }

  async getContactByIdentity(input: {
    whatsappNumber?: string | null;
    whatsappLid?: string | null;
  }): Promise<any | null> {
    if (input.whatsappNumber) {
      const byNumber = await this.getContactByNumber(input.whatsappNumber);
      if (byNumber) {
        return byNumber;
      }
    }

    if (input.whatsappLid) {
      return this.getContactByLid(input.whatsappLid);
    }

    return null;
  }

  async listContacts(): Promise<any[]> {
    const result = await this.pool.query(
      "SELECT * FROM contacts WHERE is_active = TRUE ORDER BY authority_level DESC NULLS LAST, name ASC"
    );
    return result.rows;
  }

  async ensureContactShell(input: {
    whatsappNumber: string;
    whatsappLid?: string | null;
    name?: string | null;
    notes?: string | null;
  }): Promise<any> {
    const client = await this.pool.connect();
    const desiredNumber = input.whatsappNumber;
    const desiredLid = input.whatsappLid ?? null;
    const desiredPrimaryIdentity = desiredNumber || desiredLid || "";
    const desiredName = input.name?.trim() || desiredPrimaryIdentity;
    const inferredTimezone = resolveContactTimezone({
      whatsappNumber: desiredNumber,
      timezone: null,
      timezoneSource: null
    });

    try {
      if (!desiredPrimaryIdentity) {
        return null;
      }

      await client.query("BEGIN");

      const [byNumber, byLid] = await Promise.all([
        desiredNumber ? this.getContactByNumberWithClient(client, desiredNumber) : Promise.resolve(null),
        desiredLid ? this.getContactByLidWithClient(client, desiredLid) : Promise.resolve(null)
      ]);

      if (byNumber && byLid && byNumber.id !== byLid.id) {
        await client.query(
          `
          UPDATE messages
          SET contact_id = $1, contact_number = $2
          WHERE contact_id = $3 OR contact_number = $4
          `,
          [byNumber.id, byNumber.whatsapp_number, byLid.id, byLid.whatsapp_number]
        );

        await client.query(
          `
          UPDATE contacts
          SET
            whatsapp_lid = COALESCE($2, whatsapp_lid),
            name = CASE
              WHEN $3 IS NOT NULL AND (name = whatsapp_number OR name = COALESCE(whatsapp_lid, '') OR name = '')
                THEN $3
              ELSE name
            END,
            timezone = COALESCE(timezone, $4),
            timezone_source = CASE
              WHEN timezone IS NULL AND $4 IS NOT NULL THEN $5
              ELSE timezone_source
            END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [
            byNumber.id,
            desiredLid ?? byLid.whatsapp_lid ?? null,
            desiredName,
            inferredTimezone.timezone,
            inferredTimezone.timezoneSource
          ]
        );

        await client.query(
          `
          UPDATE contacts
          SET
            is_active = FALSE,
            notes = CASE
              WHEN COALESCE(notes, '') = '' THEN $2
              ELSE notes || E'\n' || $2
            END,
            updated_at = NOW()
          WHERE id = $1
          `,
          [byLid.id, `Merged into contact #${byNumber.id} during identity reconciliation.`]
        );

        await client.query("COMMIT");
        return this.getContactByNumber(byNumber.whatsapp_number);
      }

      const existing = byNumber ?? byLid;
      if (existing) {
        const nextNumber = desiredNumber || existing.whatsapp_number;
        const nextLid = desiredLid ?? existing.whatsapp_lid ?? null;
        const shouldRename =
          Boolean(input.name?.trim()) &&
          (existing.name === existing.whatsapp_number || existing.name === existing.whatsapp_lid || existing.name === "");
        const shouldSetTimezone = !existing.timezone && Boolean(inferredTimezone.timezone);

        if (existing.whatsapp_number !== nextNumber || existing.whatsapp_lid !== nextLid || shouldRename || shouldSetTimezone) {
          await client.query(
            `
            UPDATE contacts
            SET
              whatsapp_number = $2,
              whatsapp_lid = $3,
              name = CASE WHEN $4 THEN $5 ELSE name END,
              timezone = COALESCE(timezone, $6),
              timezone_source = CASE
                WHEN timezone IS NULL AND $6 IS NOT NULL THEN $7
                ELSE timezone_source
              END,
              updated_at = NOW()
            WHERE id = $1
            `,
            [
              existing.id,
              nextNumber,
              nextLid,
              shouldRename,
              desiredName,
              inferredTimezone.timezone,
              inferredTimezone.timezoneSource
            ]
          );

          if (existing.whatsapp_number !== nextNumber) {
            await client.query(
              `
              UPDATE messages
              SET contact_number = $2
              WHERE contact_id = $1 OR contact_number = $3
              `,
              [existing.id, nextNumber, existing.whatsapp_number]
            );
          }
        }

        await client.query("COMMIT");
        return this.getContactByNumber(nextNumber);
      }

      await client.query(
        `
        INSERT INTO contacts (
          whatsapp_number, whatsapp_lid, name, role, branch, authority_level, domains,
          is_human_api, notes, source, is_internal, department, relation_type, about_person,
          autonomous_outreach, timezone, timezone_source, updated_at
        ) VALUES ($1, $2, $3, NULL, NULL, NULL, $4, FALSE, $5, NULL, FALSE, NULL, NULL, NULL, FALSE, $6, $7, NOW())
        `,
        [
          desiredPrimaryIdentity,
          desiredLid,
          desiredName,
          [],
          input.notes ?? "Auto-created from WhatsApp activity.",
          inferredTimezone.timezone,
          inferredTimezone.timezoneSource
        ]
      );

      await client.query("COMMIT");
      return this.getContactByNumber(desiredPrimaryIdentity);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async canAutonomouslyReachContact(targetNumber: string): Promise<boolean> {
    const contact = await this.getContactByNumber(targetNumber);
    return Boolean(contact?.autonomous_outreach);
  }

  async addKnowledgeAsset(input: {
    sourceType: string;
    sourceRef: string;
    title?: string | null;
    mimeType?: string | null;
    textContent?: string | null;
    summary?: string | null;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO knowledge_assets (
        source_type, source_ref, title, mime_type, text_content, summary, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING id
      `,
      [
        input.sourceType,
        input.sourceRef,
        input.title ?? null,
        input.mimeType ?? null,
        input.textContent ?? null,
        input.summary ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.createdBy ?? null
      ]
    );

    return Number(result.rows[0].id);
  }

  async addClaim(input: {
    subject: string;
    predicate: string;
    value: string;
    status: string;
    confidence: number;
    sourceMessageExternalId?: string | null;
    sourceContactNumber?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO claims (
        subject, predicate, value, status, confidence, source_message_external_id, source_contact_number, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id
      `,
      [
        input.subject,
        input.predicate,
        input.value,
        input.status,
        input.confidence,
        input.sourceMessageExternalId ?? null,
        input.sourceContactNumber ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return Number(result.rows[0].id);
  }

  /**
   * SDMO-aware upsert: supports memory_tier so the optimizer can
   * write Tier 1 facts directly without a separate query.
   * memory_tier: 1 = always-hot (behavioral rules), 2 = working, 3 = archive
   */
  async upsertFact(input: {
    factKey: string;
    subject: string;
    predicate: string;
    value: string;
    status: string;
    confidence: number;
    memoryTier?: number | null;
    sourceClaimId?: number | null;
    sourceContactNumber?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO facts (
        fact_key, subject, predicate, value, status, confidence, memory_tier, source_claim_id,
        source_contact_number, metadata, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT (fact_key)
      DO UPDATE SET
        subject = EXCLUDED.subject,
        predicate = EXCLUDED.predicate,
        value = EXCLUDED.value,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        memory_tier = COALESCE(EXCLUDED.memory_tier, facts.memory_tier),
        source_claim_id = EXCLUDED.source_claim_id,
        source_contact_number = EXCLUDED.source_contact_number,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      `,
      [
        input.factKey,
        input.subject,
        input.predicate,
        input.value,
        input.status,
        input.confidence,
        input.memoryTier ?? 2,
        input.sourceClaimId ?? null,
        input.sourceContactNumber ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }


  async upsertMemoryIndex(input: MemoryIndexEntry): Promise<number> {
    const result = await this.pool.query(
      `
      INSERT INTO memory_index (
        memory_key, memory_type, scope_type, scope_id, title, summary,
        source_table, source_ref, tags, entities, importance_score,
        freshness_score, confidence, metadata, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9::text[], $10::text[], $11,
        $12, $13, $14::jsonb, NOW()
      )
      ON CONFLICT (memory_key)
      DO UPDATE SET
        memory_type = EXCLUDED.memory_type,
        scope_type = EXCLUDED.scope_type,
        scope_id = EXCLUDED.scope_id,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        source_table = EXCLUDED.source_table,
        source_ref = EXCLUDED.source_ref,
        tags = EXCLUDED.tags,
        entities = EXCLUDED.entities,
        importance_score = EXCLUDED.importance_score,
        freshness_score = EXCLUDED.freshness_score,
        confidence = EXCLUDED.confidence,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
      `,
      [
        input.memoryKey,
        input.memoryType,
        input.scopeType,
        input.scopeId ?? null,
        input.title ?? null,
        input.summary,
        input.sourceTable,
        input.sourceRef,
        input.tags ?? [],
        input.entities ?? [],
        input.importanceScore ?? 0.5,
        input.freshnessScore ?? 0.5,
        input.confidence ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return Number(result.rows[0].id);
  }

  async browseMemoryIndex(input: {
    query: string;
    scopeType: string;
    scopeId: string;
    limit?: number;
  }): Promise<MemoryIndexEntry[]> {
    const scopeResult = await this.pool.query(
      `
      SELECT *
      FROM memory_index
      WHERE (scope_type = $1 AND COALESCE(scope_id, '') = COALESCE($2, ''))
         OR scope_type = 'global'
      ORDER BY updated_at DESC
      LIMIT $3
      `,
      [input.scopeType, input.scopeId, Math.max((input.limit ?? 12) * 6, 24)]
    );

    const tokens = String(input.query ?? "")
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    const ranked = scopeResult.rows
      .map((row) => {
        const entry = parseMemoryIndexRow(row);
        const haystack = [
          entry.title ?? "",
          entry.summary,
          ...(entry.tags ?? []),
          ...(entry.entities ?? [])
        ]
          .join(" ")
          .toLowerCase();

        const tokenMatches = tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
        const scopeBoost = entry.scopeType === input.scopeType && entry.scopeId === input.scopeId ? 3 : 1;
        const score =
          tokenMatches * 5 +
          (entry.importanceScore ?? 0) * 3 +
          (entry.freshnessScore ?? 0) * 2 +
          scopeBoost;

        return {
          entry,
          score
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 12)
      .map((item) => item.entry);

    return ranked;
  }

  async touchMemoryIndex(memoryKeys: string[]): Promise<void> {
    const normalizedKeys = memoryKeys.map((key) => String(key ?? "").trim()).filter(Boolean);
    if (normalizedKeys.length === 0) {
      return;
    }

    await this.pool.query(
      `
      UPDATE memory_index
      SET last_used_at = NOW()
      WHERE memory_key = ANY($1::text[])
      `,
      [normalizedKeys]
    );
  }

  async addTask(input: {
    title: string;
    details: string;
    status?: string | null;
    requestedBy?: string | null;
    targetNumber?: string | null;
    dueAt?: string | null;
    sourceMessageExternalId?: string | null;
    charter?: TaskCharter;
    snapshot?: TaskSnapshot;
    timezone?: string | null;
    timezoneSource?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<number> {
    const normalizedStatus = normalizeTaskStatus(input.status) ?? "TODO";
    const charter =
      input.charter ??
      buildTaskCharter({
        originalIntent: input.details,
        requesterNumber: input.requestedBy ?? null,
        targetNumber: input.targetNumber ?? null,
        constraints: input.metadata ?? {},
        sourceMessageExternalId: input.sourceMessageExternalId ?? null,
        timezone: input.timezone ?? null,
        timezoneSource: input.timezoneSource ?? null
      });
    const snapshot =
      input.snapshot ??
      buildTaskSnapshot({
        status: normalizedStatus,
        currentSummary: input.details,
        nextStep: input.dueAt ? "Wake up at the scheduled follow-up time and continue the task." : "Choose the next useful action."
      });

    const result = await this.pool.query(
      `
      INSERT INTO tasks (
        title, details, status, requested_by, target_number, due_at, source_message_external_id,
        charter, snapshot, timezone, timezone_source, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb)
      RETURNING id
      `,
      [
        input.title,
        input.details,
        normalizedStatus,
        input.requestedBy ?? null,
        input.targetNumber ?? null,
        input.dueAt ?? null,
        input.sourceMessageExternalId ?? null,
        JSON.stringify(charter),
        JSON.stringify(snapshot),
        input.timezone ?? null,
        input.timezoneSource ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );

    return Number(result.rows[0].id);
  }

  async updateTaskStatus(id: number, status: string): Promise<void> {
    const normalizedStatus = normalizeTaskStatus(status) ?? "TODO";
    await this.pool.query(
      `
      UPDATE tasks
      SET
        status = $2,
        snapshot = COALESCE(snapshot, '{}'::jsonb) || jsonb_build_object('status', $2),
        completed_at = CASE WHEN $2 = 'COMPLETED' THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, normalizedStatus]
    );
  }

  async updateTaskSnapshot(input: {
    taskId: number;
    status?: string | null;
    currentSummary?: string | null;
    nextStep?: string | null;
    blocker?: string | null;
    waitingFor?: string | null;
    latestKnownContext?: Record<string, unknown>;
  }): Promise<void> {
    const existing = await this.getTaskById(input.taskId);
    if (!existing) {
      throw new Error(`Task ${input.taskId} not found.`);
    }

    const nextSnapshot = buildTaskSnapshot({
      status: input.status ?? existing.status,
      currentSummary: input.currentSummary ?? existing.snapshot?.currentSummary ?? existing.details,
      nextStep:
        input.nextStep === undefined
          ? existing.snapshot?.nextStep ?? null
          : input.nextStep,
      blocker:
        input.blocker === undefined
          ? existing.snapshot?.blocker ?? null
          : input.blocker,
      waitingFor:
        input.waitingFor === undefined
          ? existing.snapshot?.waitingFor ?? null
          : input.waitingFor,
      latestKnownContext: {
        ...(existing.snapshot?.latestKnownContext ?? {}),
        ...(input.latestKnownContext ?? {})
      }
    });

    await this.pool.query(
      `
      UPDATE tasks
      SET
        status = $2,
        snapshot = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
      `,
      [input.taskId, nextSnapshot.status, JSON.stringify(nextSnapshot)]
    );
  }

  async addTaskEvent(taskId: number, eventType: string, content: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO task_events (task_id, event_type, content)
      VALUES ($1, $2, $3::jsonb)
      `,
      [taskId, eventType, JSON.stringify(content)]
    );
  }

  /**
   * Returns tasks for a target number.
   *
   * SDMO Phase 0: By default excludes COMPLETED and CANCELLED tasks to prevent
   * unnecessary token cost. Pass `includeCompleted: true` to get the full history
   * (e.g. for retrospective queries or the MCP on-demand path).
   */
  async getTasksByTarget(
    targetNumber: string,
    status?: string,
    options?: { includeCompleted?: boolean }
  ): Promise<any[]> {
    const params: any[] = [targetNumber];
    const whereClauses: string[] = ["target_number = $1"];

    if (status) {
      params.push(status);
      whereClauses.push(`status = $${params.length}`);
    } else if (!options?.includeCompleted) {
      // Default: active work only — exclude terminal statuses.
      whereClauses.push("status NOT IN ('COMPLETED', 'CANCELLED')");
    }

    const query = `SELECT * FROM tasks WHERE ${whereClauses.join(" AND ")} ORDER BY updated_at DESC`;
    const result = await this.pool.query(query, params);
    return result.rows.map(parseTaskRow);
  }

  async listTasks(limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM tasks
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(parseTaskRow);
  }

  async getTasksBySourceMessageExternalId(messageExternalId: string): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM tasks
      WHERE source_message_external_id = $1
      ORDER BY created_at ASC
      `,
      [messageExternalId]
    );

    return result.rows.map(parseTaskRow);
  }

  async getTaskById(taskId: number): Promise<any | null> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM tasks
      WHERE id = $1
      LIMIT 1
      `,
      [taskId]
    );

    return result.rowCount ? parseTaskRow(result.rows[0]) : null;
  }

  /**
   * Returns the event log for a task.
   *
   * SDMO Phase 0: If a TASK_SUMMARY event exists (written by the Memory Optimizer),
   * only that summary event plus all LIVE (non-archived) events created AFTER it
   * are returned. This keeps the prompt window small on long-running tasks while
   * preserving full history in Postgres (queryable via MCP on demand).
   *
   * Falls back to returning all non-archived events — fully backward compatible
   * with tasks that have never been optimized.
   */
  async getTaskEvents(taskId: number): Promise<any[]> {
    // Find the most recent TASK_SUMMARY event (optimizer distillation baseline).
    const summaryResult = await this.pool.query(
      `SELECT id, created_at
       FROM task_events
       WHERE task_id = $1
         AND event_type = 'TASK_SUMMARY'
         AND is_archived = FALSE
       ORDER BY created_at DESC
       LIMIT 1`,
      [taskId]
    );

    if (summaryResult.rowCount && summaryResult.rowCount > 0) {
      const summary = summaryResult.rows[0];
      // Return the summary event + all live events that came after it.
      const result = await this.pool.query(
        `SELECT *
         FROM task_events
         WHERE task_id = $1
           AND is_archived = FALSE
           AND (id = $2 OR created_at > $3)
         ORDER BY created_at ASC`,
        [taskId, summary.id, summary.created_at]
      );
      return result.rows;
    }

    // No optimizer run yet — return all non-archived events (original behaviour).
    const result = await this.pool.query(
      `SELECT *
       FROM task_events
       WHERE task_id = $1
         AND is_archived = FALSE
       ORDER BY created_at ASC`,
      [taskId]
    );
    return result.rows;
  }

  /**
   * Returns the full event history for a task, including archived entries.
   * Used by the SDMO optimizer, which needs the raw timeline for distillation.
   */
  async getAllTaskEvents(taskId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT *
       FROM task_events
       WHERE task_id = $1
       ORDER BY created_at ASC`,
      [taskId]
    );
    return result.rows;
  }

  /**
   * Returns the most recent TASK_SUMMARY event for a task, if present.
   * Used by SDMO components that need the latest distillation checkpoint.
   */
  async getLatestTaskSummaryEvent(taskId: number): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT *
       FROM task_events
       WHERE task_id = $1
         AND event_type = 'TASK_SUMMARY'
       ORDER BY created_at DESC
       LIMIT 1`,
      [taskId]
    );
    return result.rowCount ? result.rows[0] : null;
  }

  /**
   * SDMO Phase 2: Archives all task_events for a task that were created
   * BEFORE the given checkpoint event ID. Called by the Memory Optimizer
   * after it writes a TASK_SUMMARY event to collapse history.
   *
   * The checkpoint event itself (the TASK_SUMMARY) is NOT archived.
   */
  async archiveTaskEventsBeforeId(taskId: number, checkpointEventId: number): Promise<number> {
    const result = await this.pool.query(
      `UPDATE task_events
       SET is_archived = TRUE
       WHERE task_id = $1
         AND id < $2
         AND is_archived = FALSE
         AND event_type != 'TASK_SUMMARY'`,
      [taskId, checkpointEventId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * SDMO Phase 3: Records optimizer run metadata on the task.
   * Sets last_optimized_at and increments sdmo_optimization_count.
   */
  async setTaskOptimizationMeta(taskId: number): Promise<void> {
    await this.pool.query(
      `UPDATE tasks
       SET
         last_optimized_at = NOW(),
         sdmo_optimization_count = GREATEST(
           COALESCE(sdmo_optimization_count, 0),
           COALESCE((metadata->>'sdmo_optimization_count')::integer, 0)
         ) + 1,
         metadata = COALESCE(metadata, '{}'::jsonb)
           - 'last_optimized_at'
           - 'sdmo_optimization_count',
         updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );
  }

  /**
   * SDMO Phase 3: Finds task IDs whose LLM calls exceeded the token threshold
   * within the given lookback window. Only returns tasks that still exist and
   * are not in a terminal state (COMPLETED / CANCELLED).
   *
   * Returns an array of unique task IDs (as numbers), ordered by most recent call.
   */
  async findThresholdBreachingTaskIds(input: {
    tokenThreshold: number;
    lookbackMinutes?: number;
    limit?: number;
  }): Promise<number[]> {
    const lookbackMinutes = input.lookbackMinutes ?? 60;
    const limit = input.limit ?? 50;

    const result = await this.pool.query(
      `SELECT sub.task_id
       FROM (
         SELECT
           (metadata->>'sourceTaskId')::integer AS task_id,
           MAX(created_at) AS latest_call
         FROM llm_call_logs
         WHERE total_tokens > $1
           AND metadata->>'sourceTaskId' IS NOT NULL
           AND created_at >= NOW() - ($2 * INTERVAL '1 minute')
         GROUP BY (metadata->>'sourceTaskId')::integer
       ) sub
       JOIN tasks t ON t.id = sub.task_id
       WHERE t.status NOT IN ('COMPLETED', 'CANCELLED')
       ORDER BY sub.latest_call DESC
       LIMIT $3`,
      [input.tokenThreshold, lookbackMinutes, limit]
    );

    return result.rows
      .map((row: any) => Number(row.task_id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  }



  async addScheduledJob(input: {
    jobType: string;
    runAt: string;
    payload: Record<string, unknown>;
    createdBy?: string | null;
    sourceTaskId?: number | null;
    retryLimit?: number | null;
    idempotencyKey?: string | null;
    timezoneContext?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO scheduled_jobs (
        job_type, run_at, payload, created_by, source_task_id, retry_limit, idempotency_key, timezone_context
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
      `,
      [
        input.jobType,
        input.runAt,
        JSON.stringify(input.payload),
        input.createdBy ?? null,
        input.sourceTaskId ?? null,
        input.retryLimit ?? 3,
        input.idempotencyKey ?? null,
        JSON.stringify(input.timezoneContext ?? {})
      ]
    );
  }

  async fetchDueJobs(limit = 20): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM scheduled_jobs
      WHERE status = 'pending'
        AND run_at <= NOW()
        AND (cooldown_until IS NULL OR cooldown_until <= NOW())
      ORDER BY run_at ASC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows;
  }

  async markJobRunning(id: number): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'running', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      `,
      [id]
    );
    return result.rowCount > 0;
  }

  async markJobCompleted(id: number): Promise<void> {
    await this.pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'completed', executed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );
  }

  async markJobFailed(id: number, errorMessage: string, input?: {
    retryCooldownSeconds?: number;
    handoffSummary?: string;
  }): Promise<void> {
    const jobResult = await this.pool.query("SELECT attempts, retry_limit FROM scheduled_jobs WHERE id = $1 LIMIT 1", [id]);
    const job = jobResult.rowCount ? jobResult.rows[0] : null;
    const attempts = Number(job?.attempts ?? 0);
    const retryLimit = Number(job?.retry_limit ?? 3);
    const shouldRetry = attempts < retryLimit;

    if (shouldRetry) {
      const retryCooldownSeconds = input?.retryCooldownSeconds ?? 300;
      await this.pool.query(
        `
        UPDATE scheduled_jobs
        SET
          status = 'pending',
          last_error = $2,
          last_result_summary = $3,
          cooldown_until = NOW() + ($4 * INTERVAL '1 second'),
          updated_at = NOW()
        WHERE id = $1
        `,
        [id, errorMessage, input?.handoffSummary ?? "Retry scheduled after job failure.", retryCooldownSeconds]
      );
      return;
    }

    await this.pool.query(
      `
      UPDATE scheduled_jobs
      SET
        status = 'failed',
        handoff_required = TRUE,
        last_error = $2,
        last_result_summary = $3,
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, errorMessage, input?.handoffSummary ?? "Job failed after retry limit and now requires handoff."]
    );
  }

  async listJobs(limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      "SELECT * FROM scheduled_jobs ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return result.rows;
  }

  async listMessageContacts(limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT
        c.id,
        c.whatsapp_number,
        c.whatsapp_lid,
        c.name,
        c.role,
        c.branch,
        c.is_human_api,
        c.autonomous_outreach,
        c.timezone,
        c.timezone_source,
        last_message.id AS last_message_id,
        last_message.direction AS last_message_direction,
        last_message.kind AS last_message_kind,
        last_message.text_content AS last_message_text,
        last_message.occurred_at AS last_message_at
      FROM contacts c
      JOIN LATERAL (
        SELECT m.id, m.direction, m.kind, m.text_content, m.occurred_at
        FROM messages m
        WHERE m.contact_number = c.whatsapp_number
        ORDER BY m.occurred_at DESC
        LIMIT 1
      ) last_message ON TRUE
      WHERE c.is_active = TRUE
      ORDER BY last_message.occurred_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows;
  }

  async listMessageContactsByNumbers(contactNumbers: string[], limit = 50): Promise<any[]> {
    if (contactNumbers.length === 0) {
      return [];
    }

    const result = await this.pool.query(
      `
      SELECT
        c.id,
        c.whatsapp_number,
        c.whatsapp_lid,
        c.name,
        c.role,
        c.branch,
        c.is_human_api,
        c.autonomous_outreach,
        c.timezone,
        c.timezone_source,
        last_message.id AS last_message_id,
        last_message.direction AS last_message_direction,
        last_message.kind AS last_message_kind,
        last_message.text_content AS last_message_text,
        last_message.occurred_at AS last_message_at
      FROM contacts c
      JOIN LATERAL (
        SELECT m.id, m.direction, m.kind, m.text_content, m.occurred_at
        FROM messages m
        WHERE m.contact_number = c.whatsapp_number
        ORDER BY m.occurred_at DESC
        LIMIT 1
      ) last_message ON TRUE
      WHERE c.is_active = TRUE
        AND c.whatsapp_number = ANY($1::text[])
      ORDER BY last_message.occurred_at DESC
      LIMIT $2
      `,
      [contactNumbers, limit]
    );

    return result.rows;
  }

  async listMessagesForContact(contactNumber: string, limit = 100): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT
        m.id,
        m.external_id,
        m.chat_id,
        m.direction,
        m.kind,
        m.text_content,
        m.transcript,
        m.analysis,
        m.media_path,
        m.mime_type,
        m.occurred_at,
        m.contact_number,
        m.author_number,
        m.author_name,
        m.is_from_me,
        c.name AS contact_name,
        c.role AS contact_role
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      WHERE m.contact_number = $1
      ORDER BY m.occurred_at DESC
      LIMIT $2
      `,
      [contactNumber, limit]
    );

    return result.rows;
  }

  async listTasksForContact(contactNumber: string, limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT *
      FROM tasks
      WHERE requested_by = $1 OR target_number = $1
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $2
      `,
      [contactNumber, limit]
    );

    return result.rows;
  }

  async getMessageById(id: number): Promise<any | null> {
    const result = await this.pool.query("SELECT * FROM messages WHERE id = $1", [id]);
    return result.rowCount ? result.rows[0] : null;
  }

  async addDecisionLog(messageExternalId: string | null, decisionType: string, summary: string, context: unknown): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO decision_logs (message_external_id, decision_type, summary, context)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [messageExternalId, decisionType, summary, JSON.stringify(context ?? {})]
    );
  }

  async listDecisionLogs(input?: {
    limit?: number;
    messageExternalId?: string;
  }): Promise<any[]> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (input?.messageExternalId) {
      params.push(input.messageExternalId);
      whereClauses.push(`message_external_id = $${params.length}`);
    }

    params.push(input?.limit ?? 100);
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await this.pool.query(
      `
      SELECT *
      FROM decision_logs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length}
      `,
      params
    );

    return result.rows;
  }

  async listDecisionLogsForContact(contactNumber: string, limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT d.*
      FROM decision_logs d
      JOIN messages m ON m.external_id = d.message_external_id
      WHERE m.contact_number = $1
      ORDER BY d.created_at DESC
      LIMIT $2
      `,
      [contactNumber, limit]
    );

    return result.rows;
  }

  async addDebugRecord(input: {
    runId?: string | null;
    taskId?: number | null;
    messageExternalId?: string | null;
    schedulerJobId?: number | null;
    toolName?: string | null;
    severity: DebugSeverity;
    stage: DebugStage;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO debug_records (
        run_id, task_id, message_external_id, scheduler_job_id, tool_name,
        severity, stage, summary, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        input.runId ?? null,
        input.taskId ?? null,
        input.messageExternalId ?? null,
        input.schedulerJobId ?? null,
        input.toolName ?? null,
        input.severity,
        input.stage,
        input.summary,
        JSON.stringify(input.payload ?? {})
      ]
    );
  }

  async listDebugRecords(input?: {
    limit?: number;
    taskId?: number;
    runId?: string;
    stage?: string;
    severity?: string;
  }): Promise<any[]> {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (Number.isFinite(input?.taskId)) {
      params.push(input?.taskId);
      whereClauses.push(`task_id = $${params.length}`);
    }

    if (input?.runId) {
      params.push(input.runId);
      whereClauses.push(`run_id = $${params.length}`);
    }

    if (input?.stage) {
      params.push(input.stage);
      whereClauses.push(`stage = $${params.length}`);
    }

    if (input?.severity) {
      params.push(input.severity);
      whereClauses.push(`severity = $${params.length}`);
    }

    params.push(input?.limit ?? 100);
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await this.pool.query(
      `
      SELECT *
      FROM debug_records
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length}
      `,
      params
    );

    return result.rows;
  }

  async listDebugRecordsForContact(contactNumber: string, limit = 50): Promise<any[]> {
    const result = await this.pool.query(
      `
      SELECT DISTINCT dr.*
      FROM debug_records dr
      JOIN messages m ON m.external_id = dr.message_external_id
      WHERE m.contact_number = $1
      ORDER BY dr.created_at DESC
      LIMIT $2
      `,
      [contactNumber, limit]
    );

    return result.rows;
  }

  async upsertQueryCache(question: string, answer: string, source?: string | null): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO query_cache (question, answer, source, verified_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (question)
      DO UPDATE SET answer = EXCLUDED.answer, source = EXCLUDED.source, verified_at = NOW()
      `,
      [question, answer, source ?? null]
    );
  }

  async addClarificationThread(topic: string, details: unknown, openedByMessageExternalId?: string | null): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO clarification_threads (topic, details, opened_by_message_external_id)
      VALUES ($1, $2::jsonb, $3)
      `,
      [topic, JSON.stringify(details ?? {}), openedByMessageExternalId ?? null]
    );
  }

  /**
   * Returns the recent context bundle for an inbound message.
   *
   * SDMO Phase 0:
   *   - facts: filtered to memory_tier = 1 (Persistent / always-hot facts only).
   *     Tier 2/3 facts are retrievable on-demand via MCP query.
   *   - contacts: unchanged for now (unchanged global top-20).
   *   - recentMessages: last 10 for this sender (unchanged).
   */
  async getRecentContext(senderNumber: string): Promise<{
    recentMessages: any[];
    contacts: any[];
    facts: any[];
  }> {
    const [recentMessages, contacts, facts] = await Promise.all([
      this.pool.query(
        `
        SELECT direction, kind, text_content, transcript, analysis, occurred_at
        FROM messages
        WHERE contact_number = $1
        ORDER BY occurred_at DESC
        LIMIT 10
        `,
        [senderNumber]
      ),
      this.pool.query(
        `
        SELECT whatsapp_number, whatsapp_lid, name, role, branch, authority_level, domains, notes, autonomous_outreach, timezone, timezone_source
        FROM contacts
        ORDER BY authority_level DESC NULLS LAST, name ASC
        LIMIT 20
        `
      ),
      // SDMO Phase 0: Only Tier 1 (Persistent) facts are auto-injected.
      // Tier 1 = permanent agent behavioral rules ("Peter speaks Chinese only",
      // contact policies, company-wide constraints). These never change at runtime.
      // All other facts are available via MCP on-demand query.
      this.pool.query(
        `
        SELECT fact_key, subject, predicate, value, status, confidence, memory_tier
        FROM facts
        WHERE memory_tier = 1
        ORDER BY updated_at DESC
        LIMIT 50
        `
      )
    ]);

    return {
      recentMessages: recentMessages.rows,
      contacts: contacts.rows,
      facts: facts.rows
    };
  }
}
