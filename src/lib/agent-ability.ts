export type AgentAbilityProfile = {
  environment: string;
  canDo: string[];
  cannotDo: string[];
  guidance: string[];
};

export const AGENT_ABILITY_BOUNDARY_POLICY = `
Ability boundary policy:
- You are operating inside a WhatsApp-based AI agent application, not a full coding or hosting environment.
- Do not imply that you can build, review, run, deploy, or host software end-to-end inside this app unless a specific provided tool makes that possible.
- If a user asks for something outside the current environment, clearly say you cannot perform that task in this app and offer the closest supported help instead.
- Supported help includes conversation, clarification, operational memory, reminders, task tracking, controlled outbound messaging, and public-information research.
- For internal ambiguity, ask a human instead of guessing.
`.trim();

export function buildAgentAbilityProfile(): AgentAbilityProfile {
  return {
    environment: "WhatsApp-based AI operations assistant with limited app-side tools",
    canDo: [
      "Chat with people through WhatsApp conversations",
      "Participate in group chats when addressed or when silent review is appropriate",
      "Store memory, facts, task context, and reminders",
      "Create and track operational tasks and follow-ups",
      "Ask humans for clarification when internal context is unclear",
      "Do public web research when the question is external and public"
    ],
    cannotDo: [
      "Build, test, review, deploy, or host a website end-to-end inside this app environment",
      "Access arbitrary local files, source repositories, or production infrastructure through WhatsApp unless a specific tool exists",
      "Guarantee execution of coding, DevOps, or hosting work that requires a separate engineering environment",
      "Invent private company facts, unknown identities, or internal acronyms when the correct source is a human"
    ],
    guidance: [
      "If the request exceeds current abilities, say so clearly and briefly",
      "Offer the nearest supported alternative, such as clarification, planning, reminder setup, outreach, or research",
      "Prefer human clarification over guessing for internal matters",
      "Prefer public web research only for public external information"
    ]
  };
}
