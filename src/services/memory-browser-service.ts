import { Repository } from "../database/repository.js";
import { buildNormalizedMessageText } from "../agent/intake.js";
import { InboundMessage, MemoryEvidencePack } from "../types.js";
import { normalizePhoneNumber } from "../lib/phone.js";

export class MemoryBrowserService {
  private static readonly MAX_MEMORY_ITEMS = 8;
  private static readonly MAX_TASKS = 8;
  private static readonly MAX_RECENT_MESSAGES = 8;
  private static readonly MAX_FACTS = 12;

  constructor(private readonly repository: Repository) {}

  async buildInboundEvidencePack(message: InboundMessage): Promise<MemoryEvidencePack> {
    const senderNumber = normalizePhoneNumber(message.senderNumber);
    const normalizedText = buildNormalizedMessageText(message);
    const scopeType = message.isGroupChat ? "group_chat" : "contact";
    const scopeId = message.isGroupChat ? message.chatId : senderNumber;

    const [memoryItems, tasks, recentContext] = await Promise.all([
      this.repository.browseMemoryIndex({
        query: normalizedText,
        scopeType,
        scopeId,
        limit: MemoryBrowserService.MAX_MEMORY_ITEMS
      }),
      this.repository.listTasksForContact(senderNumber, MemoryBrowserService.MAX_TASKS),
      this.repository.getRecentContext(senderNumber)
    ]);

    const recentMessages = Array.isArray(recentContext.recentMessages)
      ? recentContext.recentMessages.slice(0, MemoryBrowserService.MAX_RECENT_MESSAGES)
      : [];
    const facts = Array.isArray(recentContext.facts)
      ? recentContext.facts.slice(0, MemoryBrowserService.MAX_FACTS)
      : [];

    await this.repository.touchMemoryIndex(memoryItems.map((item) => item.memoryKey));

    return {
      retrievalQuery: normalizedText,
      scopeType,
      scopeId,
      groupContext: message.groupContext ?? null,
      relevantMemories: memoryItems,
      activeTasks: tasks,
      recentMessages,
      facts
    };
  }

  async buildWakeupEvidencePack(input: {
    task?: any;
    wakeupReason: string;
    taskEvents?: any[];
  }): Promise<MemoryEvidencePack> {
    const primaryNumber = normalizePhoneNumber(input.task?.target_number ?? input.task?.requested_by ?? "");
    const scopeType = primaryNumber ? "contact" : "task";
    const scopeId = primaryNumber || String(input.task?.id ?? "task");
    const retrievalQuery = [
      input.task?.title ?? "",
      input.task?.details ?? "",
      input.wakeupReason ?? "",
      Array.isArray(input.taskEvents)
        ? input.taskEvents
            .map((event) => JSON.stringify(event?.content ?? event ?? {}))
            .join(" ")
        : ""
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const [memoryItems, tasks, recentContext] = await Promise.all([
      this.repository.browseMemoryIndex({
        query: retrievalQuery,
        scopeType,
        scopeId,
        limit: MemoryBrowserService.MAX_MEMORY_ITEMS
      }),
      primaryNumber
        ? this.repository.listTasksForContact(primaryNumber, MemoryBrowserService.MAX_TASKS)
        : Promise.resolve([]),
      primaryNumber
        ? this.repository.getRecentContext(primaryNumber)
        : Promise.resolve({ recentMessages: [], contacts: [], facts: [] })
    ]);

    await this.repository.touchMemoryIndex(memoryItems.map((item) => item.memoryKey));

    return {
      retrievalQuery,
      scopeType,
      scopeId,
      groupContext: null,
      relevantMemories: memoryItems,
      activeTasks: tasks,
      recentMessages: Array.isArray(recentContext.recentMessages)
        ? recentContext.recentMessages.slice(0, MemoryBrowserService.MAX_RECENT_MESSAGES)
        : [],
      facts: Array.isArray(recentContext.facts)
        ? recentContext.facts.slice(0, MemoryBrowserService.MAX_FACTS)
        : []
    };
  }
}
