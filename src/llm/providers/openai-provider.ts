import OpenAI from "openai";
import { AppConfig } from "../../config.js";
import { safeJsonParse } from "../../lib/json.js";
import { LlmGenerateJsonInput, LlmGenerateTextInput, LlmJsonResult, LlmProvider, LlmTextResult, LlmUsage } from "../types.js";

function extractUsage(response: any): LlmUsage {
  return {
    inputTokens: response?.usage?.input_tokens ?? null,
    outputTokens: response?.usage?.output_tokens ?? null,
    totalTokens: response?.usage?.total_tokens ?? null,
    raw: response?.usage ? { ...response.usage } : null
  };
}

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai" as const;
  private readonly client?: OpenAI;

  constructor(private readonly config: AppConfig) {
    this.client = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async generateText(input: LlmGenerateTextInput): Promise<LlmTextResult> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing");
    }

    const response = await this.client.responses.create({
      model: input.model ?? this.config.openAiReasoningModel,
      instructions: input.systemPrompt,
      input: input.prompt,
      temperature: input.temperature ?? 0.2
    } as any);

    return {
      text: response.output_text?.trim() ?? "",
      usage: extractUsage(response)
    };
  }

  async generateJson<T>(input: LlmGenerateJsonInput): Promise<LlmJsonResult<T>> {
    if (!this.client) {
      throw new Error("OPENAI_API_KEY is missing");
    }

    const response = await this.client.responses.create({
      model: input.model ?? this.config.openAiReasoningModel,
      instructions: [input.systemPrompt, "Return valid JSON only.", input.schemaDescription].filter(Boolean).join("\n\n"),
      input: input.prompt,
      temperature: input.temperature ?? 0.1
    } as any);

    const rawText = response.output_text ?? "{}";

    return {
      value: safeJsonParse<T>(rawText, {} as T),
      rawText,
      usage: extractUsage(response)
    };
  }

  async ping(model?: string): Promise<void> {
    await this.generateText({
      model,
      prompt: "Reply with OK."
    });
  }
}
