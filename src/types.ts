export type Direction = "inbound" | "outbound";

export type MessageKind =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "video"
  | "unknown";

export type IntentCategory =
  | "discussion"
  | "question"
  | "instruction"
  | "fact"
  | "task";

export type IntakeCategory =
  | "CASUAL_CHAT"
  | "TASK_ACTION"
  | "KNOWLEDGE_QUERY"
  | "PROTOCOL_RESPONSE"
  | "NOISE"
  | "UNKNOWN";

export type ScheduledJobStatus = "pending" | "running" | "completed" | "failed";

export type GroupParticipantContext = {
  id: string;
  admin?: "admin" | "superadmin" | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
};

export type GroupContext = {
  id: string;
  subject?: string | null;
  owner?: string | null;
  participantCount: number;
  participants: GroupParticipantContext[];
};

export type InboundMessage = {
  externalId: string;
  chatId: string;
  isGroupChat: boolean;
  groupContext?: GroupContext | null;
  reactionDecision?: ReactionDecision | null;
  isAddressedToAgent?: boolean;
  shouldRespond?: boolean;
  addressReason?: string | null;
  senderNumber: string;
  senderLid?: string | null;
  senderName?: string | null;
  kind: MessageKind;
  text: string;
  mediaPath?: string | null;
  mimeType?: string | null;
  transcript?: string | null;
  analysis?: string | null;
  rawPayload: unknown;
  occurredAt: Date;
};

export type IntakeDisposition = "dispatch" | "store_only" | "duplicate";

export type IntakeDecision = {
  disposition: IntakeDisposition;
  category: IntakeCategory;
  reason: string;
  normalizedText: string;
  confidence?: number;
};

export type ReactionAddressScope =
  | "direct"
  | "group_wide"
  | "another_person"
  | "unclear"
  | "not_addressed";

export type ReactionResponseMode = "reply_now" | "silent_review" | "history_only" | "ignore";

export type ReactionType =
  | "casual_chat"
  | "question"
  | "task_request"
  | "important_info"
  | "fact_update"
  | "instruction"
  | "clarification"
  | "unknown";

export type HumanClarificationTarget = "sender" | "known_human" | "group" | null;

export type ReactionDecision = {
  addressedToAgent: boolean;
  addressScope: ReactionAddressScope;
  responseMode: ReactionResponseMode;
  reactionType: ReactionType;
  shouldRecordMemory: boolean;
  shouldCreateOrUpdateTask: boolean;
  needsHumanClarification: boolean;
  humanClarificationReason?: string | null;
  humanClarificationTarget?: HumanClarificationTarget;
  webSearchAllowed: boolean;
  confidence: number;
  reason: string;
};

export type MemoryIndexEntry = {
  id?: number;
  memoryKey: string;
  memoryType: string;
  scopeType: string;
  scopeId?: string | null;
  title?: string | null;
  summary: string;
  sourceTable: string;
  sourceRef: string;
  tags?: string[];
  entities?: string[];
  importanceScore?: number | null;
  freshnessScore?: number | null;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
};

export type MemoryEvidencePack = {
  retrievalQuery: string;
  scopeType: string;
  scopeId: string;
  groupContext?: GroupContext | null;
  relevantMemories: MemoryIndexEntry[];
  activeTasks: any[];
  recentMessages: any[];
  facts: any[];
};

export type AgentIdentity = {
  name: string;
  aliases: string[];
  roleDescription: string;
};

export type AuthorityPolicy = {
  singleSourceOfTruthNumber?: string | null;
  requireSingleSourceOfTruthForSensitiveChanges: boolean;
};

export type AuthorityContactReference = {
  whatsappNumber: string;
  name?: string | null;
  authorityLevel?: number | null;
};

export type AuthorityContext = {
  senderNumber: string;
  senderName?: string | null;
  senderAuthorityLevel?: number | null;
  senderIsHumanApi: boolean;
  initiatorContact?: AuthorityContactReference | null;
  singleSourceOfTruthContact?: AuthorityContactReference | null;
  requireSingleSourceOfTruthForSensitiveChanges: boolean;
};

export type StoredMessageInput = {
  externalId: string;
  chatId: string;
  direction: Direction;
  kind: MessageKind;
  text: string;
  rawPayload: unknown;
  occurredAt: Date;
  senderNumber: string;
  senderName?: string | null;
  contactId?: number | null;
  contactNumber?: string | null;
  authorNumber?: string | null;
  authorName?: string | null;
  isFromMe?: boolean;
  mediaPath?: string | null;
  mimeType?: string | null;
  transcript?: string | null;
  analysis?: string | null;
};

export type HealthReport = {
  status: "ok" | "degraded" | "failed";
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
  }>;
};

export type ContactRecord = {
  whatsappNumber: string;
  whatsappLid?: string | null;
  name: string;
  role?: string | null;
  branch?: string | null;
  authorityLevel?: number | null;
  domains?: string[] | null;
  isHumanApi?: boolean;
  notes?: string | null;
  source?: string | null;
  isInternal?: boolean | null;
  department?: string | null;
  relationType?: string | null;
  aboutPerson?: string | null;
  autonomousOutreach?: boolean | null;
  timezone?: string | null;
  timezoneSource?: string | null;
};

export type AgentPlan = {
  category: IntentCategory;
  summary: string;
  replyText: string;
  claims: Array<{
    subject: string;
    predicate: string;
    value: string;
    status: "candidate" | "working";
    confidence: number;
  }>;
  contactUpdates: ContactRecord[];
  facts: Array<{
    factKey: string;
    subject: string;
    predicate: string;
    value: string;
    status: "working" | "confirmed";
    confidence: number;
  }>;
  tasks: Array<{
    title: string;
    details: string;
    targetNumber?: string | null;
    dueAt?: string | null;
  }>;
  reminders: Array<{
    runAt: string;
    targetNumber: string;
    message: string;
  }>;
  outboundMessages: Array<{
    targetNumber: string;
    text: string;
    risk: "low" | "sensitive";
  }>;
  clarification: {
    needed: boolean;
    targetNumber?: string | null;
    question?: string | null;
  };
  companyQuery?: string | null;
  webSearchQuery?: string | null;
};
