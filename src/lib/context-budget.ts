type BudgetMeta = {
  tokenBudget: number;
  estimatedTokens: number;
  trimmedLayers: string[];
};

type InboundContextBudgetInput = {
  senderProfile: any;
  recentContext: any;
  activeTasks: any[];
  memoryEvidence: any;
};

type WakeupContextBudgetInput = {
  task: any;
  taskEvents: any[];
  memoryEvidence: any;
};

export type InboundContextBudgetPayload = {
  senderProfile: any;
  recentContext: any;
  activeTasks: any[];
  memoryEvidence: any;
  budgetMeta: BudgetMeta;
};

export type WakeupContextBudgetPayload = {
  task: any;
  recentTimeline: any[];
  memoryEvidence: any;
  budgetMeta: BudgetMeta;
};

const DEFAULT_TOKEN_BUDGET = 20_000;

export function assembleInboundContext(
  input: InboundContextBudgetInput,
  tokenBudget = DEFAULT_TOKEN_BUDGET
): InboundContextBudgetPayload {
  const payload: InboundContextBudgetPayload = {
    senderProfile: compactSenderProfile(input.senderProfile),
    recentContext: {
      recentMessages: compactRecentMessages(input.recentContext?.recentMessages, 6),
      contacts: compactContacts(input.recentContext?.contacts, 2),
      facts: compactFacts(input.recentContext?.facts, 10)
    },
    activeTasks: compactTasks(input.activeTasks, 3),
    memoryEvidence: compactMemoryEvidence(input.memoryEvidence, 5),
    budgetMeta: {
      tokenBudget,
      estimatedTokens: 0,
      trimmedLayers: []
    }
  };

  trimInboundPayload(payload, tokenBudget);
  payload.budgetMeta.estimatedTokens = estimateTokens(payload);
  return payload;
}

export function assembleWakeupContext(
  input: WakeupContextBudgetInput,
  tokenBudget = DEFAULT_TOKEN_BUDGET
): WakeupContextBudgetPayload {
  const payload: WakeupContextBudgetPayload = {
    task: compactPrimaryTask(input.task),
    recentTimeline: compactTimeline(input.taskEvents, 12),
    memoryEvidence: compactMemoryEvidence(input.memoryEvidence, 5),
    budgetMeta: {
      tokenBudget,
      estimatedTokens: 0,
      trimmedLayers: []
    }
  };

  trimWakeupPayload(payload, tokenBudget);
  payload.budgetMeta.estimatedTokens = estimateTokens(payload);
  return payload;
}

function trimInboundPayload(payload: InboundContextBudgetPayload, tokenBudget: number): void {
  const trimmedLayers = payload.budgetMeta.trimmedLayers;

  while (estimateTokens(payload) > tokenBudget && payload.memoryEvidence.relevantMemories.length > 3) {
    payload.memoryEvidence.relevantMemories.pop();
    pushTrimmed(trimmedLayers, "memoryEvidence.relevantMemories");
  }

  while (estimateTokens(payload) > tokenBudget && payload.recentContext.recentMessages.length > 4) {
    payload.recentContext.recentMessages.pop();
    pushTrimmed(trimmedLayers, "recentContext.recentMessages");
  }

  while (estimateTokens(payload) > tokenBudget && payload.activeTasks.length > 2) {
    payload.activeTasks.pop();
    pushTrimmed(trimmedLayers, "activeTasks");
  }

  while (estimateTokens(payload) > tokenBudget && payload.recentContext.contacts.length > 1) {
    payload.recentContext.contacts.pop();
    pushTrimmed(trimmedLayers, "recentContext.contacts");
  }

  while (estimateTokens(payload) > tokenBudget && payload.recentContext.facts.length > 5) {
    payload.recentContext.facts.pop();
    pushTrimmed(trimmedLayers, "recentContext.facts");
  }

  while (estimateTokens(payload) > tokenBudget && payload.memoryEvidence.relevantMemories.length > 0) {
    payload.memoryEvidence.relevantMemories.pop();
    pushTrimmed(trimmedLayers, "memoryEvidence.relevantMemories");
  }
}

function trimWakeupPayload(payload: WakeupContextBudgetPayload, tokenBudget: number): void {
  const trimmedLayers = payload.budgetMeta.trimmedLayers;

  while (estimateTokens(payload) > tokenBudget && countNonSummaryEvents(payload.recentTimeline) > 8) {
    payload.recentTimeline = keepTaskSummaryPlusLatest(payload.recentTimeline, 8);
    pushTrimmed(trimmedLayers, "recentTimeline");
  }

  while (estimateTokens(payload) > tokenBudget && payload.memoryEvidence.relevantMemories.length > 3) {
    payload.memoryEvidence.relevantMemories.pop();
    pushTrimmed(trimmedLayers, "memoryEvidence.relevantMemories");
  }

  while (estimateTokens(payload) > tokenBudget && countNonSummaryEvents(payload.recentTimeline) > 4) {
    payload.recentTimeline = keepTaskSummaryPlusLatest(payload.recentTimeline, 4);
    pushTrimmed(trimmedLayers, "recentTimeline");
  }

  while (estimateTokens(payload) > tokenBudget && payload.memoryEvidence.relevantMemories.length > 0) {
    payload.memoryEvidence.relevantMemories.pop();
    pushTrimmed(trimmedLayers, "memoryEvidence.relevantMemories");
  }
}

function compactSenderProfile(profile: any): any {
  if (!profile) {
    return null;
  }

  return {
    whatsapp_number: profile.whatsapp_number ?? null,
    whatsapp_lid: profile.whatsapp_lid ?? null,
    name: profile.name ?? null,
    role: profile.role ?? null,
    branch: profile.branch ?? null,
    department: profile.department ?? null,
    authority_level: profile.authority_level ?? null,
    domains: profile.domains ?? [],
    relation_type: profile.relation_type ?? null,
    autonomous_outreach: profile.autonomous_outreach ?? null,
    timezone: profile.timezone ?? null,
    timezone_source: profile.timezone_source ?? null,
    about_person: profile.about_person ?? null,
    notes: profile.notes ?? null
  };
}

function compactRecentMessages(messages: any[] | undefined, limit: number): any[] {
  return (Array.isArray(messages) ? messages : [])
    .slice(0, limit)
    .map((message) => ({
      direction: message.direction ?? null,
      kind: message.kind ?? null,
      text_content: message.text_content ?? null,
      transcript: message.transcript ?? null,
      analysis: message.analysis ?? null,
      occurred_at: message.occurred_at ?? null
    }));
}

function compactContacts(contacts: any[] | undefined, limit: number): any[] {
  return (Array.isArray(contacts) ? contacts : [])
    .slice(0, limit)
    .map((contact) => ({
      whatsapp_number: contact.whatsapp_number ?? null,
      name: contact.name ?? null,
      role: contact.role ?? null,
      authority_level: contact.authority_level ?? null,
      autonomous_outreach: contact.autonomous_outreach ?? null,
      timezone: contact.timezone ?? null
    }));
}

function compactFacts(facts: any[] | undefined, limit: number): any[] {
  return (Array.isArray(facts) ? facts : [])
    .slice(0, limit)
    .map((fact) => ({
      fact_key: fact.fact_key ?? null,
      subject: fact.subject ?? null,
      predicate: fact.predicate ?? null,
      value: fact.value ?? null,
      confidence: fact.confidence ?? null,
      memory_tier: fact.memory_tier ?? null
    }));
}

function compactTasks(tasks: any[] | undefined, limit: number): any[] {
  return (Array.isArray(tasks) ? tasks : [])
    .slice(0, limit)
    .map(compactTaskSummary);
}

function compactTaskSummary(task: any): any {
  return {
    id: task.id ?? null,
    title: task.title ?? null,
    status: task.status ?? null,
    target_number: task.target_number ?? null,
    requested_by: task.requested_by ?? null,
    due_at: task.due_at ?? null,
    snapshot: task.snapshot ?? null,
    timezone: task.timezone ?? null,
    timezone_source: task.timezone_source ?? null,
    updated_at: task.updated_at ?? null
  };
}

function compactPrimaryTask(task: any): any {
  if (!task) {
    return null;
  }

  return {
    id: task.id ?? null,
    title: task.title ?? null,
    details: task.details ?? null,
    status: task.status ?? null,
    requested_by: task.requested_by ?? null,
    target_number: task.target_number ?? null,
    due_at: task.due_at ?? null,
    charter: task.charter ?? null,
    snapshot: task.snapshot ?? null,
    timezone: task.timezone ?? null,
    timezone_source: task.timezone_source ?? null,
    updated_at: task.updated_at ?? null
  };
}

function compactTimeline(taskEvents: any[] | undefined, nonSummaryLimit: number): any[] {
  return keepTaskSummaryPlusLatest(
    (Array.isArray(taskEvents) ? taskEvents : []).map((event) => ({
      id: event.id ?? null,
      event_type: event.event_type ?? null,
      content: event.content ?? null,
      created_at: event.created_at ?? null
    })),
    nonSummaryLimit
  );
}

function compactMemoryEvidence(memoryEvidence: any, limit: number): any {
  return {
    scopeType: memoryEvidence?.scopeType ?? null,
    scopeId: memoryEvidence?.scopeId ?? null,
    relevantMemories: (Array.isArray(memoryEvidence?.relevantMemories) ? memoryEvidence.relevantMemories : [])
      .slice(0, limit)
      .map((memory: any) => ({
        memoryKey: memory.memoryKey ?? null,
        memoryType: memory.memoryType ?? null,
        title: memory.title ?? null,
        summary: memory.summary ?? null,
        tags: memory.tags ?? [],
        entities: memory.entities ?? [],
        importanceScore: memory.importanceScore ?? null,
        freshnessScore: memory.freshnessScore ?? null,
        confidence: memory.confidence ?? null
      }))
  };
}

function keepTaskSummaryPlusLatest(events: any[], nonSummaryLimit: number): any[] {
  const summaryEvents = events.filter((event) => event.event_type === "TASK_SUMMARY");
  const nonSummaryEvents = events.filter((event) => event.event_type !== "TASK_SUMMARY");
  const keptSummary = summaryEvents.length > 0 ? [summaryEvents[summaryEvents.length - 1]] : [];
  return [...keptSummary, ...nonSummaryEvents.slice(-nonSummaryLimit)];
}

function countNonSummaryEvents(events: any[]): number {
  return events.filter((event) => event.event_type !== "TASK_SUMMARY").length;
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? null).length / 4);
}

function pushTrimmed(layers: string[], layer: string): void {
  if (!layers.includes(layer)) {
    layers.push(layer);
  }
}
