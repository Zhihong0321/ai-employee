import { GoogleGenAI } from "@google/genai/node";
import { AppConfig } from "../../config.js";
import { safeJsonParse } from "../../lib/json.js";
import { LlmGenerateJsonInput, LlmGenerateTextInput, LlmJsonResult, LlmProvider, LlmTextResult, LlmUsage } from "../types.js";

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const genericFence = text.match(/```\s*([\s\S]*?)```/i);
  if (genericFence?.[1]) {
    return genericFence[1].trim();
  }

  return text.trim();
}

function extractUsage(result: any): LlmUsage {
  const usage = result?.usageMetadata;
  return {
    inputTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
    raw: usage ? { ...usage } : null
  };
}

export class UniApiGeminiProvider implements LlmProvider {
  readonly name = "uniapi-gemini" as const;
  private readonly client?: GoogleGenAI;

  constructor(private readonly config: AppConfig) {
    this.client = config.uniApiApiKey
      ? new GoogleGenAI({
          apiKey: config.uniApiApiKey,
          httpOptions: {
            baseUrl: config.uniApiGeminiBaseUrl
          }
        })
      : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async generateText(input: LlmGenerateTextInput): Promise<LlmTextResult> {
    if (!this.client) {
      throw new Error("UNIAPI_API_KEY is missing");
    }

    const result = await this.client.models.generateContent({
      model: input.model ?? this.config.llmRouterModel,
      contents: this.composePrompt(input.systemPrompt, input.prompt),
      config: {
        temperature: input.temperature ?? 0.2
      } as any
    } as any);

    return {
      text: result.text?.trim() ?? "",
      usage: extractUsage(result)
    };
  }

  async generateJson<T>(input: LlmGenerateJsonInput): Promise<LlmJsonResult<T>> {
    if (!this.client) {
      throw new Error("UNIAPI_API_KEY is missing");
    }

    const prompt = [
      input.prompt,
      "",
      input.referenceContext ? `Reference context:\n${input.referenceContext}` : "",
      "",
      "Return valid JSON only.",
      input.schemaDescription ? `JSON shape:\n${input.schemaDescription}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const result = await this.client.models.generateContent({
      model: input.model ?? this.config.llmRouterModel,
      contents: this.composePrompt(input.systemPrompt, prompt),
      config: {
        temperature: input.temperature ?? 0.1,
        responseMimeType: "application/json"
      } as any
    } as any);

    const rawText = extractJsonBlock(result.text ?? "");

    return {
      value: safeJsonParse<T>(rawText, {} as T),
      rawText,
      usage: extractUsage(result)
    };
  }

  async ping(model?: string): Promise<void> {
    await this.generateText({
      model,
      prompt: "Reply with OK."
    });
  }

  private composePrompt(systemPrompt: string | undefined, userPrompt: string): string {
    return [systemPrompt?.trim(), userPrompt.trim()].filter(Boolean).join("\n\n");
  }
}
