# Parallel Task Board

Date: 2026-04-02
Last Updated: 2026-04-03

Purpose:

- coordinate concurrent AI sessions without losing architecture discipline
- record live ownership, write scope, and handoff state
- keep worker assignments separate from durable implementation progress

This file is the live coordination board.
It may change more often than `IMPLEMENTATION-STATUS.md`.

## 1. Current Coordination State

Lead session:

- current session
- Ownership:
  - baseline live WhatsApp tester validation handoff
  - next Agentic Core layer framing
  - cross-core coordination
  - worker review and merge readiness

Active worker sessions:

- none currently running

Active integration branch:

- not set

Parallel safety note:

- it is currently safe to parallelize only the explicitly assigned safe slices below
- inform the user when this board and `IMPLEMENTATION-STATUS.md` show safe parallel readiness
- use Codex MCP workers only for the assigned bounded scopes below
- the first Codex MCP worker round for Prompt Ops Core and Debug and Trace Core completed successfully on 2026-04-03

## 2. Ready Queue

These are the safest first parallel targets based on current repo docs.

### Ready Task 1

- Mini-core: Channel Intake Core
- Priority: highest
- Suggested branch: `codex/intake-core`
- Suggested worktree: `wt-intake-core`
- Owned files:
  - `src/services/whatsapp-service.ts`
  - `src/agent/intake.ts`
  - new files under `src/agent/intake/`
- Allowed shared files:
  - `src/types.ts`
  - `src/lib/phone.ts`
- Forbidden files:
  - `src/agent/runner.ts`
  - `src/agent/executor.ts`
  - task schema files
- Acceptance target:
  - all inbound message kinds converge into one normalized event
  - duplicate inbound events do not double-trigger reasoning

### Ready Task 2

- Mini-core: Prompt Ops Core
- Priority: high
- Suggested branch: `codex/prompt-ops`
- Suggested worktree: `wt-prompt-ops`
- Owned files:
  - `prompts/`
  - `src/prompts/prompt-registry.ts`
  - new files under `src/prompts/`
- Allowed shared files:
  - `src/llm/`
- Forbidden files:
  - WhatsApp transport files
  - scheduler internals
  - task tables
- Acceptance target:
  - prompt manifest composition is explicit
  - active prompt version/hash tracking is available for runtime use
- Planned worker scope for current round:
  - validate prompt manifest structure and error reporting in `src/prompts/prompt-registry.ts`
  - add or update focused tests in `src/prompts/prompt-registry.test.ts`
  - avoid changing runtime behavior outside prompt loading/validation

### Ready Task 3

- Mini-core: Debug and Trace Core
- Priority: high
- Suggested branch: `codex/debug-trace`
- Suggested worktree: `wt-debug-trace`
- Owned files:
  - `src/debug/`
  - `src/database/repository.ts`
  - admin/debug endpoints
- Allowed shared files:
  - prompt registry interfaces
  - scheduler interfaces
- Forbidden files:
  - WhatsApp transport normalization logic
- Acceptance target:
  - structured debug records exist
  - runtime trace correlation is possible across task/run/job/prompt ids
- Planned worker scope for current round:
  - improve debug stage ergonomics and trace clarity inside `src/debug/`
  - add focused tests under `src/debug/`
  - do not edit WhatsApp intake or scheduler logic

## 3. Hold Queue

Do not start these in parallel without explicit lead-managed contracts:

- Task Core
- Execution Core
- Policy Core
- Scheduler Core
- Memory Core integration passes

## 4. Assignment Template

When claiming a task, record:

- session name
- mini-core
- role: lead or worker
- branch/worktree
- owned files
- forbidden files
- start date
- current status: planned, active, blocked, review, merged
- blocker notes

## 5. Current Assignments

- Session: current session
- Mini-core: baseline live WhatsApp validation -> next Agentic Core layer
- Role: lead
- Branch/worktree: current workspace
- Owned files:
  - bounded agent/task/policy/memory files for the next chosen layer
  - localhost operator surfaces if required for observability
  - coordination docs
- Forbidden files:
  - broad cross-core contract rewrites without an explicit bounded slice
  - unrelated transport rewrites unless a live tester blocker is discovered
- Start date: 2026-04-03
- Current status: active
- Blocker notes:
  - simple live WhatsApp tester loop is now working well enough for baseline use
  - localhost shows the connected AI number plus message, task, decision, and debug context
  - next work should add one new agentic layer without regressing the current live tester loop
  - `OPENAI_API_KEY` is still absent, so non-text OpenAI-backed validation remains incomplete

- Session: prompt-ops-worker
- Mini-core: Prompt Ops Core
- Role: worker
- Branch/worktree: Codex MCP worker session
- Owned files:
  - `src/prompts/prompt-registry.ts`
  - `src/prompts/prompt-registry.test.ts`
  - `prompts/` only if needed for manifest validation coverage
- Forbidden files:
  - `src/services/whatsapp-service.ts`
  - `src/services/whatsapp-intake-service.ts`
  - `src/debug/`
- Start date: 2026-04-03
- Current status: planned
- Completion note:
  - completed on 2026-04-03 and integrated into the lead workspace
- Blocker notes:
  - keep prompt changes local to manifest loading and validation

- Session: debug-trace-worker
- Mini-core: Debug and Trace Core
- Role: worker
- Branch/worktree: Codex MCP worker session
- Owned files:
  - `src/debug/`
  - debug-focused tests only
- Forbidden files:
  - `src/services/whatsapp-service.ts`
  - `src/services/whatsapp-intake-service.ts`
  - `src/prompts/`
- Start date: 2026-04-03
- Current status: planned
- Completion note:
  - completed on 2026-04-03 and integrated into the lead workspace
- Blocker notes:
  - avoid contract changes outside debug-specific types unless escalated

## 6. Update Rule

Update this board when:

- a lead session is chosen
- a worker claims a task
- ownership changes
- a task becomes blocked
- a branch is ready for review
- a task is merged or abandoned

Remove stale assignments quickly so new sessions do not trust outdated ownership.
