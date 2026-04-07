export type LlmProviderName = "uniapi-gemini" | "uniapi-openai" | "openai";

export type LlmCallType = "text" | "json" | "ping";

export type LlmGenerateTextInput = {
  systemPrompt?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  traceMetadata?: Record<string, unknown>;
};

export type LlmGenerateJsonInput = {
  systemPrompt?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  schemaDescription?: string;
  traceMetadata?: Record<string, unknown>;
};

export type LlmUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  raw?: Record<string, unknown> | null;
};

export type LlmTextResult = {
  text: string;
  usage?: LlmUsage | null;
};

export type LlmJsonResult<T> = {
  value: T;
  rawText: string;
  usage?: LlmUsage | null;
};

export type LlmModelPricingEntry = {
  provider: LlmProviderName;
  model: string;
  inputCostPerTokenMyr: number;
  outputCostPerTokenMyr: number;
};

export interface LlmProvider {
  readonly name: LlmProviderName;
  isConfigured(): boolean;
  generateText(input: LlmGenerateTextInput): Promise<LlmTextResult>;
  generateJson<T>(input: LlmGenerateJsonInput): Promise<LlmJsonResult<T>>;
  ping(model?: string): Promise<void>;
}
