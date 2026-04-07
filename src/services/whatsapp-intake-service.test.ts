import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppIntakeService } from "./whatsapp-intake-service.js";
import { InboundMessage, ReactionDecision } from "../types.js";

class FakeRepository {
  public saveStoredMessageResult = true;
  public ensuredContacts: any[] = [];
  public storedMessages: any[] = [];
  public decisionLogs: any[] = [];
  public knowledgeAssets: any[] = [];
  public memoryIndexEntries: any[] = [];
  public contactByNumber: any = {
    whatsapp_number: "+60123456789",
    name: "Normalized Contact"
  };
  public recentContext: any = {
    recentMessages: [],
    facts: []
  };

  async ensureContactShell(input: any): Promise<any> {
    this.ensuredContacts.push(input);
    return {
      id: 7,
      name: "Normalized Contact",
      whatsapp_number: input.whatsappNumber
    };
  }

  async saveStoredMessage(input: any): Promise<boolean> {
    this.storedMessages.push(input);
    return this.saveStoredMessageResult;
  }

  async addDecisionLog(messageExternalId: string | null, decisionType: string, summary: string, context: unknown): Promise<void> {
    this.decisionLogs.push({
      messageExternalId,
      decisionType,
      summary,
      context
    });
  }

  async addKnowledgeAsset(input: any): Promise<number> {
    this.knowledgeAssets.push(input);
    return this.knowledgeAssets.length;
  }

  async upsertMemoryIndex(input: any): Promise<number> {
    this.memoryIndexEntries.push(input);
    return this.memoryIndexEntries.length;
  }

  async getContactByNumber(_number: string): Promise<any> {
    return this.contactByNumber;
  }

  async getRecentContext(_number: string): Promise<any> {
    return this.recentContext;
  }
}

class FakeDebugService {
  public logs: any[] = [];

  createRunId(prefix: string): string {
    return `${prefix}_test`;
  }

  async log(input: any): Promise<void> {
    this.logs.push(input);
  }
}

class FakeReactionClassifier {
  public calls: any[] = [];
  public nextDecision: ReactionDecision = {
    addressedToAgent: true,
    addressScope: "direct",
    responseMode: "reply_now",
    reactionType: "question",
    shouldRecordMemory: true,
    shouldCreateOrUpdateTask: false,
    needsHumanClarification: false,
    humanClarificationReason: null,
    humanClarificationTarget: null,
    webSearchAllowed: false,
    confidence: 0.92,
    reason: "test_reply_now"
  };

  async classify(input: any): Promise<ReactionDecision> {
    this.calls.push(input);
    return this.nextDecision;
  }
}

class FakeAgentIdentityService {
  public identity = {
    name: "Eter",
    aliases: ["@eter"],
    roleDescription: "Default role"
  };

  async getIdentity(): Promise<any> {
    return this.identity;
  }
}

class FakeAuthorityPolicyService {
  public nextContext: any = {
    senderNumber: "+60123456789",
    senderName: "Normalized Contact",
    senderAuthorityLevel: 0,
    senderIsHumanApi: false,
    initiatorContact: null,
    singleSourceOfTruthContact: {
      whatsappNumber: "+601121000099",
      name: "Mr. Gan Zhi Hong",
      authorityLevel: 5
    },
    requireSingleSourceOfTruthForSensitiveChanges: true
  };
  public calls: any[] = [];

  async buildAuthorityContext(input: any): Promise<any> {
    this.calls.push(input);
    return {
      ...this.nextContext,
      senderNumber: input.senderNumber,
      senderName: input.senderName ?? this.nextContext.senderName
    };
  }
}

class FakeDownstreamHandler {
  public messages: InboundMessage[] = [];

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    this.messages.push(message);
  }
}

function createMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    externalId: "msg-1",
    chatId: "60123456789@s.whatsapp.net",
    isGroupChat: false,
    senderNumber: "+60 12-345 6789",
    senderLid: null,
    senderName: "Original Sender",
    kind: "text",
    text: "Please handle this",
    mediaPath: null,
    mimeType: null,
    transcript: null,
    analysis: null,
    rawPayload: {
      key: {
        remoteJid: "60123456789@s.whatsapp.net"
      },
      message: {
        conversation: "Please handle this"
      }
    },
    occurredAt: new Date("2026-04-03T00:00:00.000Z"),
    ...overrides
  };
}

test("duplicate inbound message is stored once and skipped before reaction classification", async () => {
  const repository = new FakeRepository();
  repository.saveStoredMessageResult = false;
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(createMessage());

  assert.equal(repository.storedMessages.length, 1);
  assert.equal(classifier.calls.length, 0);
  assert.equal(downstream.messages.length, 0);
  assert.equal(repository.decisionLogs.length, 1);
  assert.equal(repository.decisionLogs[0].decisionType, "message_intake_skip");
});

test("deterministic protocol/noise preflight skips reaction classification", async () => {
  const repository = new FakeRepository();
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(
    createMessage({
      kind: "unknown",
      text: "",
      rawPayload: {
        key: {
          remoteJid: "60123456789@s.whatsapp.net"
        },
        message: {
          reactionMessage: {
            key: {
              id: "abc123"
            }
          }
        }
      }
    })
  );

  assert.equal(classifier.calls.length, 0);
  assert.equal(downstream.messages.length, 0);
  assert.equal(repository.decisionLogs.length, 1);
  assert.equal(repository.decisionLogs[0].decisionType, "message_gate_history_only");
  assert.equal((repository.decisionLogs[0].context as any).reactionSource, "deterministic_preflight");
  const preflightLog = debugService.logs.find((entry) => entry.summary === "Inbound message skipped by deterministic preflight");
  assert.ok(preflightLog);
});

test("direct PM reply-now decision reaches downstream with reaction metadata", async () => {
  const repository = new FakeRepository();
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  classifier.nextDecision = {
    addressedToAgent: true,
    addressScope: "direct",
    responseMode: "reply_now",
    reactionType: "casual_chat",
    shouldRecordMemory: true,
    shouldCreateOrUpdateTask: false,
    needsHumanClarification: false,
    humanClarificationReason: null,
    humanClarificationTarget: null,
    webSearchAllowed: false,
    confidence: 0.84,
    reason: "pm_greeting"
  };
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(createMessage({ text: "hi" }));

  assert.equal(classifier.calls.length, 1);
  assert.equal(downstream.messages.length, 1);
  assert.equal(downstream.messages[0].shouldRespond, true);
  assert.equal(downstream.messages[0].isAddressedToAgent, true);
  assert.equal(downstream.messages[0].addressReason, "direct");
  assert.equal(downstream.messages[0].reactionDecision?.reason, "pm_greeting");
  assert.equal(repository.decisionLogs[0].decisionType, "message_gate_planner_handoff");
});

test("group history-only decision stays silent without downstream handoff", async () => {
  const repository = new FakeRepository();
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  classifier.nextDecision = {
    addressedToAgent: false,
    addressScope: "not_addressed",
    responseMode: "history_only",
    reactionType: "casual_chat",
    shouldRecordMemory: true,
    shouldCreateOrUpdateTask: false,
    needsHumanClarification: false,
    humanClarificationReason: null,
    humanClarificationTarget: null,
    webSearchAllowed: false,
    confidence: 0.79,
    reason: "ambient_group_chat"
  };
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(
    createMessage({
      chatId: "120363000000000000@g.us",
      isGroupChat: true,
      text: "welcome all"
    })
  );

  assert.equal(classifier.calls.length, 1);
  assert.equal(downstream.messages.length, 0);
  assert.equal(repository.decisionLogs[0].decisionType, "message_gate_history_only");
  assert.equal((repository.decisionLogs[0].context as any).addressReason, "not_addressed");
  assert.equal((repository.decisionLogs[0].context as any).reactionType, "casual_chat");
});

test("group silent-review decision reaches downstream without direct reply", async () => {
  const repository = new FakeRepository();
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  classifier.nextDecision = {
    addressedToAgent: false,
    addressScope: "not_addressed",
    responseMode: "silent_review",
    reactionType: "fact_update",
    shouldRecordMemory: true,
    shouldCreateOrUpdateTask: false,
    needsHumanClarification: false,
    humanClarificationReason: null,
    humanClarificationTarget: null,
    webSearchAllowed: false,
    confidence: 0.82,
    reason: "group_fact_update"
  };
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(
    createMessage({
      chatId: "120363000000000000@g.us",
      isGroupChat: true,
      text: "Actually, not Tuesday, it is Wednesday."
    })
  );

  assert.equal(classifier.calls.length, 1);
  assert.equal(downstream.messages.length, 1);
  assert.equal(downstream.messages[0].shouldRespond, false);
  assert.equal(downstream.messages[0].isAddressedToAgent, false);
  assert.equal(downstream.messages[0].addressReason, "not_addressed");
  assert.equal(downstream.messages[0].reactionDecision?.responseMode, "silent_review");
  assert.equal(repository.decisionLogs[0].decisionType, "message_gate_planner_handoff");
});

test("planner-required decision logs planner unavailable when no downstream handler exists", async () => {
  const repository = new FakeRepository();
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  classifier.nextDecision = {
    addressedToAgent: true,
    addressScope: "direct",
    responseMode: "reply_now",
    reactionType: "question",
    shouldRecordMemory: true,
    shouldCreateOrUpdateTask: false,
    needsHumanClarification: false,
    humanClarificationReason: null,
    humanClarificationTarget: null,
    webSearchAllowed: true,
    confidence: 0.81,
    reason: "planner_needed"
  };
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any
  );

  await service.handleInboundMessage(createMessage({ text: "What is the meeting time?" }));

  assert.equal(classifier.calls.length, 1);
  assert.equal(repository.decisionLogs.length, 1);
  assert.equal(repository.decisionLogs[0].decisionType, "message_gate_planner_unavailable");
  assert.equal((repository.decisionLogs[0].context as any).action, "planner_unavailable");
});

test("reaction classifier receives normalized sender identity and context", async () => {
  const repository = new FakeRepository();
  repository.recentContext = {
    recentMessages: [{ id: 1 }],
    facts: [{ id: 2 }]
  };
  const debugService = new FakeDebugService();
  const classifier = new FakeReactionClassifier();
  const identityService = new FakeAgentIdentityService();
  const authorityPolicyService = new FakeAuthorityPolicyService();
  const downstream = new FakeDownstreamHandler();
  const service = new WhatsAppIntakeService(
    repository as any,
    debugService as any,
    classifier as any,
    identityService as any,
    authorityPolicyService as any,
    downstream
  );

  await service.handleInboundMessage(createMessage({ text: "what is your name" }));

  assert.equal(classifier.calls.length, 1);
  assert.equal(classifier.calls[0].message.senderNumber, "+60123456789");
  assert.equal(classifier.calls[0].message.senderName, "Normalized Contact");
  assert.equal(classifier.calls[0].recentContext.recentMessages.length, 1);
  assert.equal(classifier.calls[0].agentIdentity.name, "Eter");
  assert.equal(classifier.calls[0].authorityContext.senderNumber, "+60123456789");
  assert.equal(classifier.calls[0].authorityContext.singleSourceOfTruthContact.whatsappNumber, "+601121000099");
});
