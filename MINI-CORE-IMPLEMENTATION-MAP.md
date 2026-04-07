# Mini-Core Implementation Map

Date: 2026-04-02

Purpose:

- translate `AGENTIC-AI-BUILDPLAN-V2.md` into execution ownership
- define which mini-cores are safe to parallelize
- define likely file ownership and boundaries

This is a coordination document, not a coding log.

## 1. Mini-Core Summary

The internal mini-cores are:

1. Channel Intake Core
2. Identity Core
3. Decision Gate Core
4. Task Core
5. Execution Core
6. Policy Core
7. Memory Core
8. Scheduler Core
9. Prompt Ops Core
10. Debug and Trace Core

## 2. Ownership Template

Each mini-core below defines:

- purpose
- likely owned files
- likely forbidden/shared files
- tables touched
- dependencies
- safe to parallelize now: yes/no
- suggested branch/worktree name

## 3. Channel Intake Core

Purpose:

- normalize inbound WhatsApp events
- media convergence into one intake shape
- duplicate and protocol-noise handling
- raw message persistence trigger

Likely owned files:

- `src/services/whatsapp-service.ts`
- `src/agent/intake.ts`
- any new files under `src/agent/intake/`

Allowed shared files:

- `src/types.ts`
- `src/lib/phone.ts`

Forbidden by default:

- `src/agent/runner.ts`
- `src/agent/executor.ts`
- task schema files

Tables touched:

- raw messages
- media-related audit fields only

Dependencies:

- Identity Core
- Debug and Trace Core

Safe to parallelize now:

- yes

Suggested branch/worktree:

- `codex/intake-core`
- `wt-intake-core`

## 4. Identity Core

Purpose:

- stabilize contact identity
- separate contact identity from Human API profile and outreach permission

Likely owned files:

- `src/lib/phone.ts`
- repository contact helpers in `src/database/repository.ts`
- any new files under `src/identity/`

Allowed shared files:

- `src/types.ts`

Forbidden by default:

- scheduler logic
- prompt registry internals

Tables touched:

- contacts
- Human API related tables
- outreach permission related tables if added

Dependencies:

- Channel Intake Core
- Task Core
- Policy Core

Safe to parallelize now:

- later

Suggested branch/worktree:

- `codex/identity-core`
- `wt-identity-core`

## 5. Decision Gate Core

Purpose:

- deterministic pre-LLM gate
- classify event into operational path

Likely owned files:

- `src/services/agent-service.ts`
- `src/agent/intake.ts`
- any new files under `src/agent/gate/`

Allowed shared files:

- `src/types.ts`

Forbidden by default:

- low-level WhatsApp transport files
- scheduler internals

Tables touched:

- decision logs
- task promotion related tables indirectly

Dependencies:

- Channel Intake Core
- Identity Core
- Task Core

Safe to parallelize now:

- no

Suggested branch/worktree:

- `codex/decision-gate`
- `wt-decision-gate`

## 6. Task Core

Purpose:

- durable task charter
- task snapshot
- task events
- wake-up readiness

Likely owned files:

- `src/agent/runner.ts`
- `src/database/repository.ts`
- any new files under `src/task/`

Allowed shared files:

- `src/types.ts`

Forbidden by default:

- WhatsApp transport internals
- prompt manifest loader internals

Tables touched:

- tasks
- task_events
- decision logs
- scheduled_jobs linkage fields

Dependencies:

- Decision Gate Core
- Execution Core
- Scheduler Core

Safe to parallelize now:

- no

Suggested branch/worktree:

- `codex/task-core`
- `wt-task-core`

## 7. Execution Core

Purpose:

- planner/tool runner split
- structured decision outputs
- validated action execution inputs

Likely owned files:

- `src/agent/runner.ts`
- `src/agent/executor.ts`
- `src/agent/tools.ts`
- any new files under `src/agent/execution/`

Allowed shared files:

- `src/types.ts`
- prompt registry interfaces

Forbidden by default:

- WhatsApp transport internals
- raw DB schema-heavy work outside execution-owned surfaces

Tables touched:

- decision logs
- task events indirectly
- debug trace records

Dependencies:

- Task Core
- Policy Core
- Prompt Ops Core

Safe to parallelize now:

- no

Suggested branch/worktree:

- `codex/execution-core`
- `wt-execution-core`

## 8. Policy Core

Purpose:

- action validation
- autonomy control
- outreach permission enforcement
- sensitive action gating

Likely owned files:

- `src/agent/executor.ts`
- any new files under `src/policy/`

Allowed shared files:

- `src/types.ts`
- repository permission helpers

Forbidden by default:

- channel transport files
- prompt loader internals

Tables touched:

- contacts permission fields
- task events for policy blocks
- optional policy settings tables

Dependencies:

- Identity Core
- Execution Core
- Scheduler Core

Safe to parallelize now:

- no

Suggested branch/worktree:

- `codex/policy-core`
- `wt-policy-core`

## 9. Memory Core

Purpose:

- raw audit vs structured memory separation
- facts, claims, clarification, provenance

Likely owned files:

- `src/database/repository.ts`
- `src/services/agent-service.ts`
- any new files under `src/memory/`

Allowed shared files:

- `src/types.ts`

Forbidden by default:

- WhatsApp transport internals
- prompt ops internals

Tables touched:

- claims
- facts
- clarification_threads
- knowledge assets
- decision logs

Dependencies:

- Identity Core
- Task Core
- Decision Gate Core

Safe to parallelize now:

- later

Suggested branch/worktree:

- `codex/memory-core`
- `wt-memory-core`

## 10. Scheduler Core

Purpose:

- due-job claiming
- retries
- cooldowns
- wake-up execution flow

Likely owned files:

- `src/services/scheduler-service.ts`
- repository scheduler methods in `src/database/repository.ts`
- any new files under `src/scheduler/`

Allowed shared files:

- `src/types.ts`

Forbidden by default:

- WhatsApp transport internals
- prompt composition internals

Tables touched:

- scheduled_jobs
- tasks
- task_events
- debug traces

Dependencies:

- Task Core
- Policy Core
- Debug and Trace Core

Safe to parallelize now:

- no

Suggested branch/worktree:

- `codex/scheduler-core`
- `wt-scheduler-core`

## 11. Prompt Ops Core

Purpose:

- prompt file layout
- manifest composition
- activation and version hash tracking

Likely owned files:

- `prompts/`
- `src/prompts/prompt-registry.ts`
- any new files under `src/prompts/`

Allowed shared files:

- `src/llm/`

Forbidden by default:

- WhatsApp transport
- scheduler internals
- task tables

Tables touched:

- prompt metadata/version tables

Dependencies:

- Execution Core
- Debug and Trace Core

Safe to parallelize now:

- yes

Suggested branch/worktree:

- `codex/prompt-ops`
- `wt-prompt-ops`

## 12. Debug and Trace Core

Purpose:

- structured debug records
- runtime toggles
- task/run/job/prompt correlation

Likely owned files:

- `src/debug/`
- `src/database/repository.ts`
- admin/debug endpoints

Allowed shared files:

- prompt registry interfaces
- scheduler interfaces

Forbidden by default:

- WhatsApp transport normalization logic

Tables touched:

- debug records
- settings / runtime toggles

Dependencies:

- nearly all other cores as consumers

Safe to parallelize now:

- yes

Suggested branch/worktree:

- `codex/debug-trace`
- `wt-debug-trace`

## 13. Safe First Parallel Trio

If launching three parallel worker sessions first, prefer:

1. Channel Intake Core
2. Prompt Ops Core
3. Debug and Trace Core

Reason:

- lower overlap
- lower schema conflict risk
- useful enabling work for later cores

## 14. High-Risk Overlap Warning

Do not run these in parallel without explicit lead-managed contracts:

- Task Core + Execution Core
- Execution Core + Policy Core
- Task Core + Scheduler Core
- Memory Core + Task Core

## 15. Lead Session Default Ownership

The lead session should own:

- architecture documents
- contract changes
- cross-core shared types
- merge sequencing
- final integration passes

## 16. Final Intent

This map exists so future sessions can work fast without architecture drift.

If a requested task does not fit a defined mini-core and ownership rule, it should be clarified before implementation starts.
