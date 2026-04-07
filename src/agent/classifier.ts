import { LlmRouter } from "../llm/llm-router.js";
import { PromptRegistry } from "../prompts/prompt-registry.js";
import { InboundMessage, IntakeDecision } from "../types.js";
import { buildNormalizedMessageText } from "./intake.js";

export class IntakeClassifier {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly promptRegistry: PromptRegistry
  ) {}

  async classify(message: InboundMessage): Promise<IntakeDecision> {
    const rawText = buildNormalizedMessageText(message);
    const promptPack = await this.promptRegistry.getActivePromptPack("intake-classifier");

    const result = await this.llmRouter.generateJson<{
      category: IntakeDecision["category"];
      reason: string;
      confidence: number;
      normalizedText: string;
    }>({
      systemPrompt: promptPack.systemPrompt,
      schemaDescription: promptPack.schemaDescription,
      prompt: `Classify this message:\n\nSender: ${message.senderName || message.senderNumber}\nText: ${rawText}`,
      temperature: 0.1,
      traceMetadata: {
        messageExternalId: message.externalId,
        stage: "classification"
      }
    });

    const disposition = this.mapCategoryToDisposition(result.category);

    return {
      disposition,
      category: result.category,
      reason: result.reason,
      normalizedText: result.normalizedText,
      confidence: result.confidence
    };
  }

  private mapCategoryToDisposition(category: IntakeDecision["category"]): "dispatch" | "store_only" {
    switch (category) {
      case "TASK_ACTION":
      case "KNOWLEDGE_QUERY":
        return "dispatch";
      case "CASUAL_CHAT":
      case "PROTOCOL_RESPONSE":
      case "NOISE":
      case "UNKNOWN":
      default:
        return "store_only";
    }
  }
}
