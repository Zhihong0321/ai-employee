# Research Report: Agentic AI Core Architecture

## 1. Executive Summary
After a deep dive into **FastClaw**, **Gloamy**, and **Nanobot**, we have found significant alignment between your "Agentic AI Build Plan" and the architectural patterns used in these battle-tested repositories. 

The most "Professional" implementation of your vision would be a hybrid of **Gloamy's state management** and **FastClaw's flexibility**.

## 2. Competitive Analysis: Major Components

| Component | Your Plan | FastClaw (Go) | Gloamy (Rust) | Nanobot (Python) | Recommended Approach |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Task Memory** | Charter/Snapshot/Events | Simple Cron/List | **Snapshot/Checkpoint/History** | Session-based | **Gloamy's** dual-history model is the gold standard for long-running tasks. |
| **Intake Gate** | 5-type Classification | **Hooks System** | Rule-based Classifier | Command Router | **FastClaw's** hook system + **Gloamy's** rule classifier. |
| **Prompting** | File-based Hub | **SOUL.md (Hot-reload)** | Code-embedded | Template files | **FastClaw's** "Live SOUL" approach is best for rapid iteration. |
| **WhatsApp/IM** | Baileys | Plugin-based | Trait-based | **Node-Bridge** | **Nanobot's** bridge is highly evolved for diverse media (voice/image). |
| **Safety/Gating** | Policy-Gated Contracts | **YAML Policy Engine** | Security Traits | Simple checks | **FastClaw's** policy engine is extremely robust for autonomous work. |

---

## 3. Deep-Dive Findings

### A. The "Dual-History" Strategy (via Gloamy)
Gloamy maintains two distinct histories for every task:
1. **Execution History**: The raw log of everything (all tool calls, intermediate thoughts).
2. **Resumable History**: A "cleaned" version of the history where raw tool call tags (`<tool_call>...`) are stripped, leaving only the user messages and assistant replies (and results).
   - **Why this is better**: It prevents "prompt drift" where the LLM starts copying its own previous raw output formatting instead of following instructions.
   - **Action for us**: Implement a `get_resumable_context()` method in our `TaskRepository`.

### B. The "Hook" Architecture (via FastClaw)
FastClaw doesn't just "classify" a message. It runs a series of **Hooks**:
- `PrePrompt`: Enrichment (e.g., fetching RAG context).
- `PreTool`: Safety check (e.g., "Is the user allowed to run `rm -rf`?").
- `PostModel`: Output validation (e.g., "Did the model return valid JSON?").
  - **Why this is better**: Your "Intake Classification" is just one hook. Having a hook system makes the agent "Deterministic" at the infrastructure level, not just the logic level.
  - **Action for us**: Wrap the `AgentRunner` in a middleware/hook system.

### C. The "SOUL.md" vs Prompt Hub (via FastClaw)
FastClaw uses a single `SOUL.md` file that represents the agent's core personality and instructions. It watches this file for changes and **hot-reloads** the agent without a restart.
  - **Why this is better**: Your Prompt Hub is great, but keep the "Current Active Prompt" as a simple, editable file in the root for the developer. DB-based versioning is for audit, but File-watching is for **Developer Velocity**.
  - **Action for us**: Use `fs.watch` on the `prompts/` directory to reload the cache in memory.

### D. The "Human-in-the-Loop" as a State (via Nanobot)
Nanobot treats "Human Handoff" not just as a message, but as a **State transition**. When a task is "BLOCKED", it uses a specialized channel (Mochat) to escalate.
  - **Why this is better**: It ensures the agent stays dormant until the human replies, at which point the *inbound message* automatically re-activates the task.
  - **Action for us**: Ensure our `TaskStatus.BLOCKED` logic is tied to the `clarification_threads` table as the primary wake-up trigger.

---

## 4. Why They Do It "Better" (and what we should steal)

1. **Deterministic Guards (Gloamy)**: Gloamy has a `classifier.rs` that uses simple regex/keyword matching *before* the LLM. If a message is "Hi", it never hits the LLM reasoning loop. It just hits a "Fast Reply" hook. This saves 90% of your tokens.
2. **Trait/Contract Enforcement (Gloamy)**: Every tool in Gloamy is a "Trait". It MUST implement `execute()` and `describe()`. This makes it impossible for the agent to "hallucinate" a tool name that doesn't exist in the registry.
3. **Heartbeat Proactivity (FastClaw)**: FastClaw has a `HEARTBEAT.md` that the agent reads every 30 minutes. This is where it does "Self-Reflection". e.g., "I have 3 tasks blocked, I should nudge the CEO."
   - **User Plan vs FastClaw**: Your plan is reactive (inbound message). FastClaw is **Proactive**. We should add the 30-min heartbeat cron.

## 5. Summary Recommendation for our Build

1. **Keep the "Human API" concept**: None of the three repos have this. It's our "Secret Sauce".
2. **Steal "Resumable History"**: Clean the LLM context of raw logs via a "Snapshotting" process.
3. **Use "YAML Safety Policy"**: Define tool permissions in a config file, not hardcoded in TS.
4. **Implement "Heartbeat thinking"**: Give the agent a scheduled wake-up to check its own "Task Snapshot" table for overdue items.

---
*Report generated by Antigravity AI Assistant.*
