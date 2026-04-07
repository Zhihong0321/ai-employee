import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";
import { OpenAiProvider } from "./providers/openai-provider.js";
import { UniApiGeminiProvider } from "./providers/uniapi-gemini-provider.js";
import { UniApiOpenAiProvider } from "./providers/uniapi-openai-provider.js";
import {
  LlmCallType,
  LlmGenerateJsonInput,
  LlmGenerateTextInput,
  LlmModelPricingEntry,
  LlmProvider,
  LlmProviderName,
  LlmUsage
} from "./types.js";

export class LlmRouter {
  private readonly providers: Record<LlmProviderName, LlmProvider>;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {
    this.providers = {
      "uniapi-gemini": new UniApiGeminiProvider(config),
      "uniapi-openai": new UniApiOpenAiProvider(config),
      openai: new OpenAiProvider(config)
    };
  }

  getDefaultProviderName(): LlmProviderName {
    return this.config.llmRouterProvider;
  }

  getDefaultModel(): string {
    return this.config.llmRouterModel;
  }

  isConfigured(providerName = this.getDefaultProviderName()): boolean {
    return this.providers[providerName].isConfigured();
  }

  async generateText(input: LlmGenerateTextInput & { provider?: LlmProviderName }): Promise<string> {
    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.getDefaultModel();
    const startedAt = Date.now();

    try {
      const result = await provider.generateText({
        ...input,
        model
      });

      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "text",
        usage: result.usage ?? null,
        latencyMs: Date.now() - startedAt,
        metadata: {
          hasSystemPrompt: Boolean(input.systemPrompt?.trim()),
          promptCharacters: input.prompt.length,
          temperature: input.temperature ?? 0.2,
          ...(input.traceMetadata ?? {})
        }
      });

      return result.text;
    } catch (error) {
      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "text",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "Unknown LLM router error",
        metadata: {
          hasSystemPrompt: Boolean(input.systemPrompt?.trim()),
          promptCharacters: input.prompt.length,
          temperature: input.temperature ?? 0.2,
          ...(input.traceMetadata ?? {})
        }
      });
      throw error;
    }
  }

  async generateJson<T>(input: LlmGenerateJsonInput & { provider?: LlmProviderName }): Promise<T> {
    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.getDefaultModel();
    const startedAt = Date.now();

    try {
      const result = await provider.generateJson<T>({
        ...input,
        model
      });

      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "json",
        usage: result.usage ?? null,
        latencyMs: Date.now() - startedAt,
        metadata: {
          hasSystemPrompt: Boolean(input.systemPrompt?.trim()),
          promptCharacters: input.prompt.length,
          schemaCharacters: input.schemaDescription?.length ?? 0,
          responseCharacters: result.rawText.length,
          temperature: input.temperature ?? 0.1,
          ...(input.traceMetadata ?? {})
        }
      });

      return result.value;
    } catch (error) {
      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "json",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "Unknown LLM router error",
        metadata: {
          hasSystemPrompt: Boolean(input.systemPrompt?.trim()),
          promptCharacters: input.prompt.length,
          schemaCharacters: input.schemaDescription?.length ?? 0,
          temperature: input.temperature ?? 0.1,
          ...(input.traceMetadata ?? {})
        }
      });
      throw error;
    }
  }

  async ping(providerName = this.getDefaultProviderName(), model = this.getDefaultModel()): Promise<void> {
    const provider = this.resolveProvider(providerName);
    const startedAt = Date.now();

    try {
      const result = await provider.generateText({
        model,
        prompt: "Reply with OK."
      });

      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "ping",
        usage: result.usage ?? null,
        latencyMs: Date.now() - startedAt,
        metadata: {
          promptCharacters: "Reply with OK.".length
        }
      });
    } catch (error) {
      await this.safeLogCall({
        providerName: provider.name,
        model,
        callType: "ping",
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "Unknown LLM router error",
        metadata: {
          promptCharacters: "Reply with OK.".length
        }
      });
      throw error;
    }
  }

  private async safeLogCall(input: {
    providerName: LlmProviderName;
    model: string;
    callType: LlmCallType;
    usage?: LlmUsage | null;
    latencyMs?: number | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const pricing = await this.resolvePricing(input.providerName, input.model);
      const costs = this.calculateCosts(input.usage ?? null, pricing);

      await this.repository.addLlmCallLog({
        providerName: input.providerName,
        model: input.model,
        callType: input.callType,
        success: !input.errorMessage,
        inputTokens: input.usage?.inputTokens ?? null,
        outputTokens: input.usage?.outputTokens ?? null,
        totalTokens: this.deriveTotalTokens(input.usage ?? null),
        inputCostPerTokenMyr: pricing?.inputCostPerTokenMyr ?? null,
        outputCostPerTokenMyr: pricing?.outputCostPerTokenMyr ?? null,
        inputCostMyr: costs.inputCostMyr,
        outputCostMyr: costs.outputCostMyr,
        totalCostMyr: costs.totalCostMyr,
        latencyMs: input.latencyMs ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          usageRaw: input.usage?.raw ?? null,
          pricingConfigured: Boolean(pricing)
        }
      });
    } catch (error) {
      console.error("Failed to write LLM call log", error);
    }
  }

  private async resolvePricing(providerName: LlmProviderName, model: string): Promise<LlmModelPricingEntry | null> {
    const pricing = await this.repository.getLlmModelPricing();
    return (
      pricing.find((entry) => entry.provider === providerName && entry.model.trim().toLowerCase() === model.trim().toLowerCase()) ??
      null
    );
  }

  private calculateCosts(
    usage: LlmUsage | null,
    pricing: LlmModelPricingEntry | null
  ): { inputCostMyr: number | null; outputCostMyr: number | null; totalCostMyr: number | null } {
    if (!usage || !pricing) {
      return {
        inputCostMyr: null,
        outputCostMyr: null,
        totalCostMyr: null
      };
    }

    const inputCostMyr =
      typeof usage.inputTokens === "number" ? usage.inputTokens * pricing.inputCostPerTokenMyr : null;
    const outputCostMyr =
      typeof usage.outputTokens === "number" ? usage.outputTokens * pricing.outputCostPerTokenMyr : null;

    if (inputCostMyr === null && outputCostMyr === null) {
      return {
        inputCostMyr: null,
        outputCostMyr: null,
        totalCostMyr: null
      };
    }

    return {
      inputCostMyr,
      outputCostMyr,
      totalCostMyr: (inputCostMyr ?? 0) + (outputCostMyr ?? 0)
    };
  }

  private deriveTotalTokens(usage: LlmUsage | null): number | null {
    if (!usage) {
      return null;
    }

    if (typeof usage.totalTokens === "number") {
      return usage.totalTokens;
    }

    const tokens = [usage.inputTokens, usage.outputTokens].filter((value): value is number => typeof value === "number");
    return tokens.length ? tokens.reduce((sum, value) => sum + value, 0) : null;
  }

  private resolveProvider(providerName?: LlmProviderName): LlmProvider {
    const name = providerName ?? this.getDefaultProviderName();
    const provider = this.providers[name];
    if (!provider) {
      throw new Error(`Unsupported LLM provider: ${name}`);
    }

    return provider;
  }
}
