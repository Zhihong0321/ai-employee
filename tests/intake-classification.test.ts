import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntakeClassifier } from "../src/agent/classifier.js";
import { LlmRouter } from "../src/llm/llm-router.js";
import { PromptRegistry } from "../src/prompts/prompt-registry.js";
import { InboundMessage } from "../src/types.js";

describe("IntakeClassifier", () => {
  let classifier: IntakeClassifier;
  let mockLlmRouter: any;
  let mockPromptRegistry: any;

  beforeEach(() => {
    mockLlmRouter = {
      generateJson: vi.fn()
    };
    mockPromptRegistry = {
      getActivePromptPack: vi.fn().mockResolvedValue({
        systemPrompt: "System Prompt",
        schemaDescription: "Schema Description"
      })
    };
    classifier = new IntakeClassifier(mockLlmRouter as any, mockPromptRegistry as any);
  });

  const createMockMessage = (text: string): InboundMessage => ({
    externalId: "msg-123",
    chatId: "chat-123",
    isGroupChat: false,
    senderNumber: "60123456789",
    kind: "text",
    text,
    rawPayload: {},
    occurredAt: new Date()
  });

  it("should classify task instructions as TASK_ACTION", async () => {
    mockLlmRouter.generateJson.mockResolvedValue({
      category: "TASK_ACTION",
      reason: "Direct instruction to create a reminder",
      confidence: 0.95,
      normalizedText: "Remind me to call John at 5pm"
    });

    const result = await classifier.classify(createMockMessage("Remind me to call John at 5pm"));
    
    expect(result.category).toBe("TASK_ACTION");
    expect(result.disposition).toBe("dispatch");
  });

  it("should classify greetings as CASUAL_CHAT", async () => {
    mockLlmRouter.generateJson.mockResolvedValue({
      category: "CASUAL_CHAT",
      reason: "Standard greeting",
      confidence: 0.98,
      normalizedText: "Hi there!"
    });

    const result = await classifier.classify(createMockMessage("Hi there!"));
    
    expect(result.category).toBe("CASUAL_CHAT");
    expect(result.disposition).toBe("store_only");
  });

  it("should classify questions as KNOWLEDGE_QUERY", async () => {
    mockLlmRouter.generateJson.mockResolvedValue({
      category: "KNOWLEDGE_QUERY",
      reason: "Seeking status information",
      confidence: 0.92,
      normalizedText: "What is the status of the invoice?"
    });

    const result = await classifier.classify(createMockMessage("What is the status of the invoice?"));
    
    expect(result.category).toBe("KNOWLEDGE_QUERY");
    expect(result.disposition).toBe("dispatch");
  });
});
