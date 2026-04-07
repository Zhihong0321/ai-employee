export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const AT_UPDATE_TASK_STATUS: AgentToolDefinition = {
  name: "update_task_status",
  description: "Update the status of a specific task. Use this when a task becomes blocked, is completed, or progresses.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "The ID of the task" },
      status: { 
        type: "string", 
        enum: ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "COMPLETED", "CANCELLED"],
        description: "The new status of the task"
      },
      event_note: { type: "string", description: "Explain why the status is changing. This will be logged to the task's timeline." }
    },
    required: ["task_id", "status", "event_note"]
  }
};

export const AT_SEND_MESSAGE: AgentToolDefinition = {
  name: "send_whatsapp_message",
  description: "Send a message to a person (Human API). Use this to ask questions, gather info, or provide updates.",
  parameters: {
    type: "object",
    properties: {
      target_number: { type: "string", description: "The whatsapp_number of the target contact" },
      message: { type: "string", description: "The content of the message" }
    },
    required: ["target_number", "message"]
  }
};

export const AT_CREATE_TASK: AgentToolDefinition = {
  name: "create_task",
  description: "Create a new durable task when a human explicitly requests something to be done.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short, concise title for the task." },
      details: { type: "string", description: "Detailed explanation of exactly what needs to be done." },
      target_number: { type: "string", description: "The whatsapp_number of who is responsible for doing this work." },
      due_at: { type: "string", description: "ISO timestamp if there is a strict deadline, or leave empty." }
    },
    required: ["title", "details"]
  }
};

export const AT_SCHEDULE_WAKEUP: AgentToolDefinition = {
  name: "schedule_wakeup",
  description: "Schedule a future wake-up job for the agent to follow up on a task.",
  parameters: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "The ID of the task to follow up on" },
      run_at: { type: "string", description: "ISO timestamp representing when to wake up (e.g. 24 hours from now)." },
      reason: { type: "string", description: "Why the agent needs to wake up (e.g. 'Check if Employee A replied')." }
    },
    required: ["task_id", "run_at", "reason"]
  }
};

export const ALL_AGENT_TOOLS = [
  AT_UPDATE_TASK_STATUS,
  AT_SEND_MESSAGE,
  AT_CREATE_TASK,
  AT_SCHEDULE_WAKEUP
];
