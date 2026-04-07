# Agentic AI Build Plan

Date: 2026-04-02

This document is the implementation build plan for the Agentic Core.

It keeps the goal from [PROJECT-BLUEPRINT.md](G:\AI-Assistant\PROJECT-BLUEPRINT.md) and [AI-AGENTIC-CORE-BLUEPRINT.md](G:\AI-Assistant\AI-AGENTIC-CORE-BLUEPRINT.md), but refines the method so it can be built safely inside the current MVP codebase.

If this file conflicts with the product goal, the product goal wins.
If this file conflicts with MVP simplicity, MVP simplicity wins.

## 1. Build Goal

Build a practical Agentic Core for the WhatsApp AI Employee that can:

- receive a real inbound event
- determine whether it is just chat, reusable memory, or actionable work
- create and track real tasks when needed
- use tools to move work forward
- schedule follow-ups
- ask the right human when blocked
- preserve provenance and auditability
- stay safe for early-stage autonomous operation

This is not a research agent.
This is not a multi-agent platform.
This is not a chain-of-thought archive.

It is a single-server operational agent core for this repo.

## 2. Source Of Truth Order

Implementation should follow this order of authority:

1. [PROJECT-BLUEPRINT.md](G:\AI-Assistant\PROJECT-BLUEPRINT.md)
2. [MILESTONE-2026-04-02.md](G:\AI-Assistant\MILESTONE-2026-04-02.md)
3. this build plan
4. [AI-AGENTIC-CORE-BLUEPRINT.md](G:\AI-Assistant\AI-AGENTIC-CORE-BLUEPRINT.md)

Reason:

- the project blueprint defines the durable product intent
- the milestone defines the actual current repo state
- this file defines the method to build from here
- the agentic core blueprint is conceptually useful but too abstract to implement as-is

## 3. Non-Negotiable Build Principles

- keep the existing single-server architecture
- prefer extending current tables and services over inventing new subsystems
- do not wake the LLM for every event by default
- do not persist internal monologue as trusted reasoning
- do not create a task for every message
- do not allow uncontrolled outreach
- do not block on perfect abstractions before shipping one real workflow
- do not replace the current message pipeline in one hard cut; migrate behind flags or clean seams

## 4. Method Refinements

The new Agentic Core will not be built as "message in -> always reason -> always act".

It will be built as:

1. intake event
2. normalize and dedupe
3. classify event type
4. load minimal context
5. decide whether the LLM is needed
6. if needed, generate a structured decision
7. execute allowed actions
8. record decision and task events
9. schedule or hand off when blocked

This keeps the goal of an agentic worker, but avoids needless cost, loops, and instability.

### 4.1 No Chain-Of-Thought Persistence

We will not store raw `thought` as the reasoning artifact.

Instead, decision records should store:

- `trigger`
- `goal`
- `classification`
- `relevant_context_refs`
- `chosen_actions`
- `safety_decision`
- `result_summary`
- `error_summary`

This is enough for audit and debugging without pretending the model's internal narrative is a reliable system primitive.

### 4.2 Deterministic Event Gate Before LLM

Before any planning call, the system must deterministically decide:

- is this a real user-facing event or protocol noise
- is this a duplicate event
- does this event update raw history only
- does this event require memory promotion
- does this event require a task transition
- does this event require LLM reasoning at all

Examples where the LLM should often be skipped:

- duplicate inbound webhook/event
- protocol/history sync noise
- pure media storage acknowledgement
- scheduled reminder job with already-rendered content
- simple fixed workflow transitions

### 4.3 Task Promotion Rules

Task creation must be explicit and rule-driven.

Use this operating matrix:

- `discussion`: save raw chat; no task unless an explicit action item appears
- `question`: answer if possible; no task unless follow-up work or waiting state is needed
- `instruction`: create a task when the instruction implies execution, monitoring, scheduling, or third-party outreach
- `information/fact`: save provenance; no task unless clarification or downstream action is required
- `task`: create or update a task immediately

Practical rule:

- one-step reply only does not need a task
- anything that spans time, waiting, follow-up, another stakeholder, or a due date becomes a task

### 4.4 Task Memory Model

Every durable task should be modeled with three layers:

- `task charter`: why the task exists
- `task snapshot`: current working state
- `task events`: append-only execution timeline

The task charter is the stable intention anchor.
The task snapshot is the efficient reasoning surface.
The task events are the audit trail and replay history.

The agent must not rely on raw chat alone to remember what the task is actually for.

Required task charter fields:

- `requested_by`
- `original_request`
- `business_intent`
- `desired_outcome`
- `success_criteria`
- `constraints`
- `allowed_autonomy_level`
- `relevant_people`
- `source_message_ref`

Required task snapshot fields:

- `current_state`
- `current_goal`
- `waiting_reason`
- `active_blockers`
- `latest_confirmed_facts`
- `next_recommended_step`
- `last_reasoned_at`
- `last_run_id`

Reasoning rule:

- every task wake-up should read the task charter first
- then read the current task snapshot
- then read recent relevant task events
- only fall back to deeper/full log replay when needed

### 4.5 Separate Identity, Authority, And Permission

The build must not collapse all contact semantics into one record.

Keep these concerns distinct even if they live on related tables:

- `contact identity`: who this WhatsApp identity maps to
- `human api profile`: role, authority, domain trust, internal/external semantics
- `outreach permission`: whether the agent may message this person autonomously under current policy

This matters because WhatsApp contact reality appears before clean org modeling does.

### 4.6 Tool Use Is Policy-Gated

The planner may suggest actions.
The system policy decides whether they are allowed.

Every action must pass:

- capability exists
- arguments are valid
- target is permitted
- risk level is acceptable
- idempotency check passes
- retry policy allows execution

### 4.7 Progress And Retry Rules

The "5 steps max" idea is not enough by itself.

The build must also include:

- per-run action limit
- per-task retry tracking
- cooldown after repeated failure
- no-progress detection across wake-ups
- forced handoff when blocked beyond threshold

## 5. Current Codebase Starting Point

These existing areas are the build foundation:

- [src/services/agent-service.ts](G:\AI-Assistant\src\services\agent-service.ts)
- [src/agent/runner.ts](G:\AI-Assistant\src\agent\runner.ts)
- [src/agent/executor.ts](G:\AI-Assistant\src\agent\executor.ts)
- [src/agent/tools.ts](G:\AI-Assistant\src\agent\tools.ts)
- [src/database/repository.ts](G:\AI-Assistant\src\database\repository.ts)
- [src/services/whatsapp-service.ts](G:\AI-Assistant\src\services\whatsapp-service.ts)
- [src/services/scheduler-service.ts](G:\AI-Assistant\src\services\scheduler-service.ts)

Current data structures already exist for:

- contacts
- messages
- claims
- facts
- tasks
- scheduled_jobs
- decision_logs
- clarification_threads
- task_events

The build should reuse these first.
New tables should be added only when a real control problem cannot be solved cleanly with the current schema.

## 6. Target Runtime Flow

### 6.1 Inbound Message Flow

1. WhatsApp event arrives.
2. Normalize sender identity and chat identity.
3. Save raw message and media references.
4. Filter protocol noise and duplicates.
5. Classify message type.
6. Load minimal context:
   sender contact
   human api profile if present
   open tasks linked to sender or thread
   task charter when a task is in scope
   task snapshot when a task is in scope
   recent task events
   relevant facts and prompt policy
7. Decide whether to use:
   no LLM
   lightweight planner
   planner plus tools
8. Produce a structured decision.
9. Apply policy gates.
10. Execute allowed actions.
11. Persist task snapshot changes, task events, decision log, and any state changes.
12. Send reply or outbound messages if permitted.

### 6.2 Scheduled Wake-Up Flow

1. Scheduler selects due job.
2. Claim job with lock and idempotency guard.
3. Load linked task charter, task snapshot, and recent events.
4. Decide whether job is:
   deterministic send
   deterministic status update
   planner-required follow-up
5. Execute.
6. Record result.
7. Reschedule, complete, or block the task.

### 6.3 Tool Failure Flow

1. Capture tool failure as structured result.
2. Increment attempt metadata.
3. Decide whether retry is valid.
4. If no retry is valid, mark task blocked and prepare human handoff.
5. Do not recursively re-enter planning forever inside the same failure loop.

## 7. Build Scope For V1 Agentic Core

The first complete version of the Agentic Core must support these workflows:

- inbound text instruction -> task created or updated -> optional reply sent
- inbound reminder request -> scheduled job created -> reminder sent later
- inbound question -> answer using memory/tools -> no task unless follow-up is needed
- inbound conflicting fact -> clarification thread opened
- inbound voice note -> transcript used as message text input
- inbound image -> analysis used as message text input
- blocked task -> agent asks the correct human api or initiator

The following are explicitly not required for first completion:

- autonomous external outreach at scale
- full ERP-driven operations
- complex planning trees
- multi-agent decomposition
- semantic vector infrastructure
- background self-initiated monitoring loops

## 8. Phased Delivery Plan

This build will be executed in phases.
Each phase should leave the repo in a working state before the next phase begins.

### Phase 1: Intake Stability

Purpose:
Make sure the agent only wakes on real actionable events.

Build items:

- add deterministic intake classification
- formalize duplicate and protocol-noise handling
- separate raw message storage from agent wake-up
- ensure text, voice note, and image inputs converge into one normalized agent input shape

Exit criteria:

- duplicate inbound events do not trigger duplicate reasoning
- protocol noise is stored safely or ignored safely
- text, voice, and image events all produce one normalized intake shape

### Phase 2: Identity Stability

Purpose:
Make contact and sender identity stable before task logic deepens.

Build items:

- harden phone JID and LID mapping
- normalize bot self identity for outbound records
- distinguish contact identity from authority semantics
- introduce explicit outreach permission checks

Exit criteria:

- one human resolves consistently across inbound and outbound events
- policy can distinguish known contact from trusted authority from allowed target

### Phase 3: Prompt Hot-Swap Foundation

Purpose:
Make prompt and instruction tuning safe, fast, and redeploy-free.

Build items:

- establish the repo-level prompt file system
- build the prompt registry/composer seam
- support prompt reload without process restart
- support prompt activation and rollback by manifest or prompt key
- expose active prompt version metadata in logs and admin surfaces

Exit criteria:

- prompt files can be edited and reloaded without full redeploy
- subsequent eligible LLM calls use the newly activated version
- prompt version, manifest, and hash are traceable per call

### Phase 4: Debug And Trace Foundation

Purpose:
Make early multi-step failures diagnosable.

Build items:

- add runtime debug modes
- add structured debug records in Postgres
- support per-task, per-tool, and prompt-trace toggles
- capture useful execution traces across planner, policy, tool, and retry stages

Exit criteria:

- debug mode can be changed without full redeploy
- failed runs leave enough structured trace in Postgres for diagnosis
- console output is no longer the only debugging surface

### Phase 5: Task Memory And Lifecycle

Purpose:
Make tasks the durable execution anchor.

Build items:

- add clear message-to-task promotion rules
- create task charter at task creation time
- maintain task snapshot as the current reasoning surface
- ensure task creation is idempotent
- link task events to decisions, actions, replies, and failures
- support task state transitions:
  `TODO`, `IN_PROGRESS`, `WAITING`, `BLOCKED`, `COMPLETED`

Exit criteria:

- multi-step work survives beyond one chat turn
- original requester intent remains visible throughout the task lifecycle
- follow-ups and waits are represented in task state, not only message history

### Phase 6: Planner And Action Contracts

Purpose:
Replace brittle reasoning output with structured decisions and validated action contracts.

Build items:

- redesign planner schema to return structured decisions
- remove reliance on persisted internal monologue
- keep provider-independent router usage
- define the typed action catalog
- validate action args and result shapes through code-owned contracts

Planner output should include:

- classification
- goal
- task intent
- proposed actions
- proposed reply
- memory updates
- clarification need
- risk assessment

Exit criteria:

- planner output is stable enough to validate before execution
- decision logs are understandable without hidden reasoning prose
- tool/action requests are schema-validated before execution

### Phase 7: Execution Policy, Scheduler, And Retry Hardening

Purpose:
Make action execution safe and wake-ups reliable.

Build items:

- central action validator
- risk gating for sensitive communications
- whitelist and authority checks
- outbound transparency policy for external communication
- structured result capture per action
- idempotent job claiming
- retry classes and cooldowns
- no-progress detection
- blocked-task handoff flow

Exit criteria:

- unsafe outbound actions are blocked consistently
- allowed low-risk actions execute without micromanagement
- repeated failures do not cause silent loops
- blocked work becomes visible and handoff-ready

### Phase 8: End-To-End Validation

Purpose:
Prove the MVP agentic workflows work in real operation.

Validation set:

- text instruction -> task -> follow-up -> completion
- voice note instruction -> transcript -> task/reply
- image input -> analysis -> task/reply
- reminder request -> scheduled send
- conflicting claims -> clarification thread
- sensitive outbound request -> blocked or escalated
- tool failure -> retry or human handoff

Exit criteria:

- each workflow leaves coherent raw history, structured memory, task state, and decision logs
- prompt version, debug trace, and action history are reconstructable for failures

## 9. Data Model Strategy

Default rule:
extend existing tables before adding new tables.

Expected near-term schema work:

- extend `contacts` only where needed for identity and authority clarity
- extend `tasks` metadata for task charter and snapshot fields
- extend `scheduled_jobs` metadata for retry class, cooldown, and idempotency keys
- use `decision_logs` for structured decision records
- use `task_events` as the canonical execution timeline

Only add a new table if one of these becomes unavoidable:

- event dedupe cannot be handled safely from current message storage
- outreach permissions need separate policy history
- task participants need first-class modeling beyond one target number

## 10. Prompt And Instruction System

Prompt tuning is expected to be frequent.
This is not a side concern.
It must be built as an editable operating surface.

### 10.1 Prompt Design Principles

- prompts must be file-first and version-controlled in the repo
- the database should not be the authoring surface for everyday prompt tuning
- avoid one giant system prompt when smaller prompt parts are easier to tune
- separate stable policy from task-specific instructions
- prompt changes must not require full system redeploy
- every LLM call should declare which prompt pack and version it used
- prompt edits must be small and targeted so feedback can be applied quickly

### 10.2 Source Of Truth For Prompts

Use this two-layer model:

- filesystem prompt files are the authoring source of truth
- database prompt records are runtime snapshots, activation state, and audit support

Practical meaning:

- humans and future sessions edit prompt files in the repo
- the app loads and composes prompts from files
- if needed, compiled prompt snapshots can also be stored in Postgres for visibility and rollback

### 10.3 Hot-Swappable Prompt Requirement

Prompt changes are expected to happen often.
The system must support prompt hot swap without total app redeploy.

Required runtime behavior:

- prompt files can be edited in the repo while the app is running
- the prompt registry can reload prompt files without process restart
- prompt activation can happen per manifest or prompt key
- the next eligible LLM call uses the newly activated prompt version
- prior prompt versions remain traceable for rollback

Acceptable activation models:

- explicit admin endpoint to reload prompt files
- explicit CLI/script to sync and activate prompts
- optional file watcher for local development

Not acceptable:

- requiring a full rebuild and redeploy for a small prompt wording change
- silent prompt reload with no version trace
- editing runtime DB prompt content directly as the normal tuning path

### 10.4 Prompt File System Layout

Create and use a top-level `prompts/` folder in the repo.

Recommended layout:

```text
prompts/
  README.md
  shared/
    glossary.md
    style-rules.md
    safety-rules.md
    output-contracts/
      decision-schema.json
      reply-schema.json
  system/
    core-role.md
    autonomy-policy.md
    human-api-policy.md
    memory-policy.md
    task-policy.md
    outreach-policy.md
  classifiers/
    inbound-message-classifier.md
    task-promotion-classifier.md
    risk-classifier.md
  planners/
    inbound-decision.md
    scheduled-wakeup-decision.md
    clarification-decision.md
  responders/
    direct-reply.md
    clarification-question.md
    blocked-handoff.md
    reminder-message.md
  extractors/
    claim-fact-extractor.md
    contact-extractor.md
  manifests/
    inbound-decision.json
    scheduled-wakeup.json
    direct-reply.json
```

Rules:

- one file should have one clear responsibility
- prompts should stay readable in plain text or markdown
- output schemas should live beside prompts, not hidden in code strings
- manifests define which pieces are composed for a given call type

### 10.5 Prompt Composition Strategy

Do not hand-build giant prompt strings throughout the codebase.

Build a small prompt registry/composer that:

- loads prompt parts from `prompts/`
- assembles them in manifest order
- injects runtime context separately from static instructions
- returns prompt metadata:
  prompt key
  manifest name
  file list
  version hash

Static prompt parts:

- role
- safety
- memory rules
- task rules
- response style
- output schema

Runtime context:

- sender profile
- open tasks
- task charter
- task snapshot
- recent task events
- relevant facts
- current message or wake-up trigger

This split matters because frequent tuning should happen in prompt files, not inside serialized runtime context builders.

### 10.6 Prompt Activation And Rollback

The build must support explicit prompt activation state.

Minimum required behavior:

- compute a version hash from the manifest plus referenced files
- store prompt metadata for that version
- mark one active version per prompt key or manifest
- allow rollback to a previous known-good version
- expose the currently active prompt version in logs and admin surfaces

The activation flow should be:

1. edit one or more prompt files
2. reload or sync prompt registry
3. compute new manifest/version hash
4. preview or validate the prompt pack
5. activate the prompt version
6. subsequent calls use it immediately

### 10.7 Database Role In Prompt Management

The current `prompt_hub_versions` table is too narrow for the final prompt workflow.

The build should evolve it so the database can support:

- prompt key
- version
- compiled content or manifest snapshot
- active flag
- metadata:
  manifest name
  source files
  hash
  notes

But the repo files still remain the normal editing surface.

### 10.8 Prompt Tuning Workflow

This is the intended F1-style tuning loop:

1. observe a bad or weak behavior
2. identify which call type produced it
3. inspect the exact prompt manifest and prompt files used
4. edit only the relevant prompt part or schema
5. rerun the narrow workflow
6. compare behavior
7. promote the change as the new active version

This is why call logging must include prompt metadata.

### 10.9 Prompt Logging Requirements

Every planner or reply call should log:

- prompt key
- manifest name
- prompt version hash
- model/provider
- decision type
- success/failure

This makes prompt tuning traceable instead of guesswork.

### 10.10 What Must Not Happen

- no large hidden prompts embedded across many service files
- no runtime-only prompt edits that cannot be reproduced later
- no mixing policy text, output schemas, and business context in one long code string
- no silent prompt changes without version traceability

## 11. Tool Workflow Reliability

Modern LLM chat understanding is not the main risk area.
The main failure surface is complex task execution across multiple tools, state transitions, and retries.

The build must treat tool orchestration as a first-class engineering problem.

### 11.1 Main Risk Areas

- planner proposes the wrong tool sequence
- tool output shape does not match the next step's expectation
- partial success leaves task state inconsistent
- retries duplicate side effects
- one tool failure corrupts the overall task progression
- outbound action fires before the task state is safely recorded

### 11.2 Tool Contract Rules

Every executable tool must have a code-owned contract:

- stable tool name
- argument schema
- result schema
- declared side effects
- idempotency expectations
- retry class
- safe-to-autoretry or not

Prompt files may describe how to use a tool.
They do not define the tool contract.
The code defines the contract.

### 11.3 Action Catalog

The Agentic Core should expose a typed action catalog to the planner.

That catalog should be the only source for:

- allowed tool names
- argument schema validation
- risk tagging
- whether approval is required
- whether a tool can be chained after another

This prevents prompt tuning from drifting the system into invented actions or malformed payloads.

### 11.4 Execution Envelope

Each multi-step task run should execute inside a controlled envelope that records:

- task id
- run id
- trigger
- action sequence number
- action input
- action result
- progress marker
- failure marker

If a run fails midway, the system should know exactly which step succeeded and which did not.

### 11.5 Task Context Rule

Whenever the agent reasons about the next step of an existing task, it must not start from a blank operational frame.

It must read:

- task charter
- task snapshot
- recent task events
- necessary fresh external context

It may read the full task log when needed, but full-log replay should be fallback behavior, not the default reasoning surface.

### 11.6 Partial Failure Rules

The build must define how to handle:

- tool succeeded but state write failed
- state write succeeded but outbound send failed
- one tool in a chain returned invalid shape
- the planner asked for an action that policy later blocked

Default rule:

- never assume later steps are safe just because earlier planning succeeded
- validate and persist after each externally meaningful step

### 11.7 Multi-Tool Test Focus

Validation must focus more on complex task execution than on basic chat understanding.

Required validation scenarios should include:

- read tool output -> transform -> send outbound message
- create task -> schedule job -> execute reminder -> mark timeline
- search/query tool returns empty or malformed data
- first tool succeeds and second tool fails
- duplicate scheduler wake-up tries to repeat the same side effect
- planner proposes action args outside schema

### 11.8 Operator Safety Toggles

During tuning and early rollout, runtime controls must exist for fast containment.

Minimum toggles:

- `disable_autonomous_outbound`
- `disable_external_outbound`
- `planner_readonly_mode`
- `force_human_approval_for_all`
- `disable_specific_tool:<tool_name>`

These are operational safeguards.
They must work without prompt editing and without full redeploy.

## 12. Debug And Trace Layer

Early runs will require heavy debugging.
This is expected.

The Agentic Core must include a simple, effective debug layer that can be turned on or off without full redeploy.

### 12.1 Debug Layer Purpose

The debug layer exists to make failures observable when the agent is:

- solving a multi-step task
- chaining multiple tools
- calling external APIs
- handling partial failure
- resuming from scheduler wake-ups
- behaving unexpectedly after prompt or policy changes

The goal is not pretty observability.
The goal is fast diagnosis.

### 12.2 Debug Modes

The system should support at least these runtime modes:

- `debug_off`
- `debug_basic`
- `debug_verbose`
- `debug_trace`

Suggested behavior:

- `debug_off`: minimal production-safe logs
- `debug_basic`: high-level run, task, action, and failure markers
- `debug_verbose`: include tool inputs, tool outputs, policy decisions, and prompt metadata
- `debug_trace`: include step-by-step execution traces for difficult failures

These modes should be switchable at runtime without full redeploy.

### 12.3 Live Debug Persistence

For early development and tuning, the system is allowed to write useful debug material live into Postgres.

This is explicitly acceptable for this project.

Useful debug material includes:

- run id
- task id
- message external id
- scheduler job id
- planner input summary
- planner output summary
- prompt manifest and version hash
- action validation results
- tool call input
- tool call output
- external API response summary
- latency
- failure stack or failure summary
- retry decision
- final run outcome

The default principle is:

- if a debug record will help explain why the agent failed or drifted, it is worth storing

### 12.4 Debug Record Design

The debug layer should support structured records, not only free-form text.

Each debug record should be easy to query by:

- task id
- run id
- message external id
- tool name
- job id
- severity
- stage
- created_at

Recommended debug stages:

- `intake`
- `classification`
- `context_load`
- `planning`
- `policy_validation`
- `action_execution`
- `tool_call`
- `state_write`
- `outbound_send`
- `retry`
- `handoff`

### 12.5 Toggle Requirements

The debug layer should have runtime toggles for:

- global debug mode
- per-task debug enable
- per-tool debug enable
- prompt trace enable
- API payload trace enable

This matters because some failures will need deep tracing while normal flows should stay lighter.

### 12.6 Postgres Logging Is Allowed

For this project, writing debug records directly to Postgres is allowed and expected during early-stage hardening.

That includes live logging for:

- planner decisions
- tool execution envelopes
- partial failures
- scheduler retries
- policy blocks
- prompt activation events

We should prefer structured Postgres records over relying only on local console output.

### 12.7 Console Logs Are Not Enough

Console logs are useful, but they are not sufficient for agent debugging because:

- they are harder to query by task
- they are easy to lose across restarts
- they do not naturally preserve run history
- they are weak for correlating multi-step failures

Console output can remain as a secondary surface.
Postgres-backed structured debug records should be the primary diagnostic surface.

### 12.8 Retention And Safety

The debug layer should be generous in early runs, but still intentional.

Rules:

- default to storing structured summaries
- allow verbose payload logging only when debug mode requires it
- avoid storing secrets when they can be masked
- keep debug records linked to task/run/message context
- support later cleanup or retention tuning once the system stabilizes

### 12.9 Definition Of Useful Debug

A debug record is useful if it answers one of these:

- what exactly was the agent trying to do
- what inputs did the failing step receive
- what output did the previous step produce
- which policy blocked or allowed the action
- what changed in task state before failure
- whether the system should retry, block, or hand off

If a record does not help answer those questions, it is noise.

## 13. Code Strategy

Build by refactoring toward a clear seam, not by deleting working paths first.

Recommended approach:

- keep the current app boot and WhatsApp flow working
- add the new agentic core behind the current message handling seam
- migrate existing logic incrementally from `agent-service` and `agent/runner`
- delete obsolete paths only after replacement behavior is validated

Practical target areas:

- intake and normalization in `services` or a small new `agent/intake` slice
- planning and policy in `agent`
- prompt registry/composer in a small `prompts` or `agent/prompts` slice
- typed action catalog and validators in `agent` or `agent/tools`
- repository and state transition helpers in `database/repository`
- structured debug logging in `database/repository` plus agent execution seams
- scheduler orchestration in `services/scheduler-service`

## 14. Definition Of Done For The Agentic Core

The Agentic Core is considered built for v1 when:

- it only wakes for meaningful events
- it can promote messages into durable tasks correctly
- it preserves the original task intent and desired outcome across later wake-ups
- it can complete a reminder and follow-up workflow end to end
- it can ask the right human when blocked
- it can preserve provenance for facts, claims, tasks, and decisions
- it can block sensitive or unauthorized outreach
- it does not depend on stored chain-of-thought
- it does not spin in retry loops
- its prompts can be edited from the repo without hunting through service code
- each LLM call can be traced back to a prompt manifest and version
- prompt changes can be activated without full redeploy
- tool actions are schema-validated before execution
- partial tool failures do not leave task state ambiguous
- runtime safety toggles exist for fast containment
- debug mode can be enabled without full redeploy
- failed multi-step runs leave enough structured trace in Postgres to diagnose what broke
- it remains compatible with the current single-server MVP architecture

## 15. Things We Will Deliberately Defer

- generalized agent framework abstractions
- multi-agent coordination
- autonomous company-wide monitoring
- perfect org modeling before useful operations
- provider-specific search hardwiring in the core method
- advanced cost analytics beyond what already exists
- deep ERP workflows before WhatsApp agent behavior is stable

## 16. Immediate Build Start

Implementation should follow the phased delivery plan in Section 8.

Current active sequence:

1. Phase 1: Intake Stability
2. Phase 2: Identity Stability
3. Phase 3: Prompt Hot-Swap Foundation
4. Phase 4: Debug And Trace Foundation
5. Phase 5: Task Memory And Lifecycle
6. Phase 6: Planner And Action Contracts
7. Phase 7: Execution Policy, Scheduler, And Retry Hardening
8. Phase 8: End-To-End Validation

If implementation pauses between sessions, resume from the earliest incomplete phase instead of skipping ahead.

If later design choices conflict with this order, choose the simpler path that gets one real operational workflow working and auditable first.
