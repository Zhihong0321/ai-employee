# Agentic AI Build Plan V2

Date: 2026-04-02

This document replaces the previous implementation posture for the Agentic Core.

It does not change the product vision.
It changes the build method.

The product remains:

- a WhatsApp AI employee
- company-aware
- memory-driven
- task-driven
- autonomy-limited but useful
- single-server
- Postgres-backed

What changes in V2:

- we stop designing core runtime mechanics from zero
- we reuse battle-tested methods from reference repos
- we split the system into internal mini-cores
- we keep one codebase, one runtime, one writable Postgres, one Railway deployment surface for v1

This is not a microservices plan.
This is an internal architecture plan.

## 1. Why V2 Exists

The previous build plan was directionally correct about the product, but still assumed too much greenfield runtime invention.

That is now deliberately changed.

We reviewed three battle-tested reference repos:

- `fastclaw`
- `gloamy`
- `nanobot`

The correct lesson is:

1. keep the product definition
2. borrow proven runtime patterns
3. stop designing infrastructure from zero where others already solved it
4. stay strict about the pieces that are unique to this product

## 2. Product Goal Remains Unchanged

We are still building a practical WhatsApp AI employee that can:

- receive inbound WhatsApp events
- understand text, voice, image, document, and URLs
- retain company knowledge over time
- distinguish raw history from structured memory
- create and manage real tasks
- schedule future follow-up work
- ask the right human when blocked
- act autonomously for low-risk work
- preserve provenance, traceability, and operational safety

This is still not:

- a research agent
- a generalized multi-agent platform
- a chain-of-thought archive
- a distributed microservice system

## 3. Deployment Stance For V1

V1 deployment target:

- Railway
- single codebase
- single backend runtime
- one managed Postgres
- one optional volume for WhatsApp auth/session state and temporary files

Recommended stack:

- TypeScript
- Node.js 22 LTS
- Fastify
- Baileys
- Railway Postgres
- `pg` or `kysely`
- `zod`

Not part of V1 by default:

- Rust rewrite
- Python rewrite
- Redis
- Kafka
- vector DB
- multiple deployable services

Important rule:

- internal mini-cores are module boundaries, not deployment boundaries

## 4. Source Of Truth Order

Implementation should follow this order:

1. `PROJECT-BLUEPRINT.md`
2. this file
3. `AI-AGENTIC-CORE-BLUEPRINT.md`
4. current repo code reality

Important note:

- the old `AGENTIC-AI-BUILDPLAN.md` remains useful as historical context
- this V2 plan supersedes it as the active implementation method

## 5. New Build Philosophy

V2 is based on five rules:

### 5.1 Product-Specific Logic Must Stay Product-Specific

We do not flatten the product into a generic assistant runtime.

The following remain first-class product concepts:

- Human APIs
- provenance-preserving facts and claims
- initiator anchor
- clarification threads
- task charter / snapshot / events
- controlled outreach rules
- company DB read-only access

### 5.2 Runtime Plumbing Should Reuse Proven Patterns

We do not reinvent:

- channel loop patterns
- scheduler failure patterns
- task persistence mechanics
- tool execution loop patterns
- provider routing seams
- policy gating patterns

unless our product truly requires something different.

### 5.3 One Runtime, Many Mini-Cores

We split the architecture into internal mini-cores with clear contracts.

Each mini-core should have:

- one responsibility
- one input shape
- one output shape
- one persistence boundary
- one failure model
- one test surface

### 5.4 Deterministic Before Generative

Before waking the LLM, the system should deterministically decide:

- whether the event matters
- whether it is duplicate or protocol noise
- whether it only updates raw history
- whether enough context is available to run the step-1 classifier

Important refinement:

- deterministic logic should only own objective preflight:
  - duplicate detection
  - protocol/noise skip
  - media/document normalization
  - PM vs group identification
  - sender and group metadata extraction
- social meaning must be decided by LLM reasoning, not brittle phrase gates
- the first LLM step should classify the required reaction before planner execution

Current implementation note:

- the live runtime now uses a step-1 `ReactionDecision` classifier after deterministic preflight
- the planner is no longer the first reasoning step for every actionable message

### 5.5 Task State Is The Execution Backbone

The system must stop relying on raw chat replay as the main operational state.

Durable work should be anchored in task structures:

- charter
- snapshot
- events

### 5.6 Local Time Awareness Is Mandatory

Company task execution, reminders, scheduling, and operational follow-up must be time-aware.

The system must treat user-local time as a first-class runtime concern, not a UI-only detail.

Required rules:

- the agent must not reason about `today`, `tomorrow`, `this afternoon`, deadlines, or reminder timing without an explicit resolved timezone context
- persisted execution times should remain UTC-backed even when the user-facing interpretation is local-time-based
- planner and reply prompts should receive explicit UTC plus resolved user-local time context whenever time-sensitive reasoning is involved

Accepted fallback:

- if the user has not explicitly provided a timezone, the system may infer a default timezone from the WhatsApp phone country code and store that on the contact record

Current implementation note:

- the contact book now auto-assigns timezone defaults for the active operating scope:
  - Malaysia `60...` -> `Asia/Kuala_Lumpur`
  - Singapore `65...` -> `Asia/Singapore`
  - China `86...` -> `Asia/Shanghai`

### 5.7 Participation Is A Reasoning Problem, Not A Regex Problem

PM vs group is not a value judgment about importance.

It is a participation-context signal.

The correct rule is:

- `PM` usually implies the agent is being addressed
- `group chat` does not automatically imply the agent should reply
- once a group message is selected for reasoning, its importance should depend on:
  - who said it
  - what they said
  - who could see it

Current implementation direction:

- inbound messages now carry:
  - `who wrote this`
  - `what was said`
  - `PM vs group`
  - optional group metadata from Baileys
- the live classifier decides:
  - `reply_now`
  - `silent_review`
  - `history_only`
  - `ignore`

### 5.8 Human Clarification Must Beat Hallucination For Internal Unknowns

When the system does not understand an internal acronym, unknown person, internal process, or ambiguous instruction, it should prefer:

1. existing memory
2. trusted human clarification
3. external search only if the question is genuinely public/external

This means:

- Human API is not only a contact system
- it is also a truth-seeking interface for internal ambiguity

The system should not:

- invent meaning for internal shorthand
- guess who a person is from weak context
- default to web search for private/company context

## 6. Mini-Core Architecture

V2 defines the system as ten internal mini-cores:

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

These are internal architecture slices inside one codebase.

## 7. Mini-Core Method Map

This section defines which repo contributes the best method for each core.

### 7.1 Channel Intake Core

Purpose:

- receive WhatsApp events
- normalize media types into one intake event
- store raw inbound history
- filter protocol noise and duplicates
- emit a clean internal event for downstream logic

Primary borrowed method:

- `nanobot`

Useful secondary reference:

- `gloamy`

Why:

- `nanobot` has the cleanest practical shape for channel -> normalized agent input
- `gloamy` adds stronger runtime discipline around cancellation and channel handling

What we copy in spirit:

- a common internal inbound message shape
- channel concerns separated from the agent loop
- multimodal normalization before deeper processing

What we do not copy:

- generic session-centric behavior as the main state model

Our product-specific adaptation:

- WhatsApp is first-class, not just one channel among many
- PN/LID mapping must be stable
- every inbound event is raw-audited before deeper reasoning

### 7.2 Identity Core

Purpose:

- resolve who the sender is
- stabilize PN/LID/contact identity
- separate contact identity from Human API authority
- represent outreach permission independently

Primary method:

- mostly our own product method

Useful secondary reference:

- `gloamy` for explicit boundary discipline

Why:

- none of the reference repos model people as domain authority objects the way this product needs

What we copy in spirit:

- explicit contracts instead of overloaded records

What stays unique:

- contact identity
- Human API profile
- outreach permission
- initiator anchor
- contact-local timezone as an operational field for scheduling and task reasoning

### 7.3 Decision Gate Core

Purpose:

- decide whether an event should:
  - be ignored
  - update raw history only
  - be silently reviewed for memory/task updates
  - trigger direct reply
  - create/update a task
  - schedule wake-up
  - open clarification

Primary method:

- our own product method

Useful secondary references:

- `nanobot` for practical loop simplicity
- `gloamy` for runtime discipline

Why:

- this is the operational front door for our company-assistant semantics
- none of the repos exactly match our classification matrix

What we copy in spirit:

- keep the gate small, explicit, and testable

What stays unique:

- reaction classification semantics for PM vs group participation
- discussion/question/instruction/information/task classification semantics
- conflict-to-clarification behavior
- Human API clarification preference for internal unknowns

### 7.4 Task Core

Purpose:

- create durable work objects
- preserve original intent across wake-ups
- track status, blockers, waits, and outcomes

Primary borrowed method:

- `gloamy`

Why:

- it has the best practical reference for durable task state and resumability

What we copy in spirit:

- persistent task state
- resumable execution history
- checkpoint thinking
- explicit terminal and non-terminal states

What we do not copy directly:

- generic runtime task semantics as the final product model

Our product-specific adaptation:

- every task uses:
  - task charter
  - task snapshot
  - task events

Required task statuses:

- `TODO`
- `IN_PROGRESS`
- `WAITING`
- `BLOCKED`
- `COMPLETED`
- `CANCELLED`

### 7.5 Execution Core

Purpose:

- run the planner/tool loop
- validate action requests
- return structured decision outputs
- stay provider-independent

Primary borrowed methods:

- `nanobot` for loop split
- `gloamy` for execution rigor

Why:

- `nanobot` clearly separates product loop from generic tool-capable runner
- `gloamy` takes failure handling much more seriously

What we copy in spirit:

- separate product-layer orchestration from generic LLM/tool runner
- keep tool loop reusable and bounded
- build structured outputs, not hidden prose reasoning

What we do not copy:

- generic memory/task semantics
- permissive tool improvisation

Our product-specific adaptation:

- planner emits structured decision objects:
  - classification
  - goal
  - task intent
  - actions
  - reply proposal
  - memory updates
  - clarification need
  - risk assessment

### 7.6 Policy Core

Purpose:

- decide if a proposed action is allowed
- enforce autonomy limits
- enforce outreach permission
- enforce sensitivity gates
- apply retry and handoff rules

Primary borrowed method:

- `gloamy`

Why:

- it has the strongest real execution-policy posture of the three

What we copy in spirit:

- read vs act distinction
- autonomy levels
- rate limits / action budgets
- approval-worthy risk classification
- filesystem and command safety thinking

What stays unique:

- internal vs external communication policy
- Human API-based outreach policy
- sensitive company communication rules

### 7.7 Memory Core

Purpose:

- maintain raw audit history
- maintain structured company memory
- preserve provenance
- support useful retrieval for execution

Primary borrowed methods:

- `nanobot` for consolidation mechanics
- `gloamy` for storage and backend discipline

Why:

- both repos are better than our current code at runtime memory mechanics
- neither provides our product memory ontology

What we copy in spirit:

- memory should not be naive full-history replay
- consolidation and retrieval need operational boundaries

What stays unique:

- facts
- claims
- contacts
- Human APIs
- decision logs
- clarification threads
- onboarding assets
- task-linked memory

### 7.8 Scheduler Core

Purpose:

- create future jobs
- claim due jobs safely
- wake tasks back up
- retry or hand off when blocked

Primary borrowed method:

- `gloamy`

Useful secondary reference:

- `nanobot`

Why:

- `gloamy` has the strongest scheduling rigor
- `nanobot` helps keep the design practically small

What we copy in spirit:

- explicit due-job processing
- run result recording
- retry/backoff thinking
- one-shot vs recurring job clarity

What we do not copy:

- file-backed scheduling as the primary store

Our product-specific adaptation:

- all core scheduling lives in Postgres
- scheduler wake-up reads task charter/snapshot/events before acting
- scheduler logic must preserve the timezone context used to interpret user-facing time expressions

### 7.9 Prompt Ops Core

Purpose:

- make prompts editable, reloadable, traceable, and rollback-safe

Primary borrowed method:

- mostly our own planned method

Useful secondary reference:

- `fastclaw` for operator-facing hot-reload mentality

Why:

- the reference repos help with prompt ergonomics, but our desired prompt governance is stricter

What we copy in spirit:

- prompt tuning is an operational surface, not a hidden code detail

What stays unique:

- repo-file-first prompt source of truth
- manifest composition
- prompt activation state
- prompt metadata logged per call

### 7.10 Debug and Trace Core

Purpose:

- make failures diagnosable
- preserve run history
- link prompt, task, tool, and scheduler behavior into one trace

Primary borrowed method:

- `gloamy`

Why:

- it has the best observability discipline

What we copy in spirit:

- structured traces
- correlation of execution stages
- runtime health visibility

What stays unique:

- Postgres as the primary structured debug store during hardening
- trace linkage to:
  - `run_id`
  - `task_id`
  - `message_external_id`
  - `scheduler_job_id`
  - `prompt_version_hash`

## 8. Core Contracts

Each mini-core must expose a clear contract.

These contracts are more important than file layout.

### 8.1 Channel Intake Core Contract

Input:

- raw WhatsApp/Baileys event

Output:

- normalized intake event with:
  - external id
  - chat id
  - sender identity hints
  - message kind
  - normalized text
  - media references
  - transcript / analysis
  - occurred at
  - contact identity sufficient to resolve local timezone context downstream

Failure rule:

- raw message is still stored even if downstream processing fails

### 8.2 Decision Gate Core Contract

Input:

- normalized intake event
- identity context
- open task context summary
- relevant prompt policy

Output:

- reaction decision:
  - `reply_now`
  - `silent_review`
  - `history_only`
  - `ignore`
- plus explicit semantics for:
  - addressed to agent or not
  - address scope
  - reaction type
  - memory/task relevance
  - whether human clarification is needed
  - whether web search is allowed

Failure rule:

- no side effects should occur before the reaction decision is known

### 8.3 Task Core Contract

Input:

- gate result or wake-up trigger

Output:

- stable task records:
  - charter
  - snapshot
  - event append

Failure rule:

- task state changes must be idempotent where practical

### 8.4 Execution Core Contract

Input:

- structured execution request
- runtime context
- allowed tools catalog
- prompt pack

Output:

- structured decision result
- validated action list
- reply candidate
- memory update candidate

Failure rule:

- no raw chain-of-thought is persisted as system state
- time-sensitive reasoning must not run on implicit or guessed timezone context alone

### 8.5 Policy Core Contract

Input:

- proposed action
- task autonomy level
- target identity
- outreach permission
- system safety toggles

Output:

- `allow`
- `allow_with_note`
- `deny`
- `handoff_required`

Failure rule:

- unsafe or ambiguous side effects must fail closed

### 8.6 Scheduler Core Contract

Input:

- due job
- linked task id
- linked task state

Output:

- job result
- retry / reschedule / complete / block / handoff state

Failure rule:

- duplicate wake-ups must not duplicate externally meaningful side effects

## 9. Data Model Direction

Postgres remains the state backbone.

V2 should reuse current schema where possible, but make the following concepts explicit.

### 9.1 Raw History Layer

Keep:

- raw inbound messages
- raw outbound messages
- transcripts
- media references
- message-linked analyses

Purpose:

- audit
- replay
- debugging
- provenance

### 9.2 Structured Memory Layer

Keep or extend:

- contacts
- human API profiles
- claims
- facts
- clarification threads
- decision logs
- onboarding assets
- contact timezone and timezone source

Important:

- structured memory is not just summarized chat

### 9.3 Task Layer

Tasks must explicitly hold three layers:

- charter
- snapshot
- events

Suggested direction:

- keep `tasks` as the anchor row
- use JSONB for charter and snapshot in v1 if needed
- keep `task_events` append-only

### 9.4 Scheduling Layer

`scheduled_jobs` should evolve to include:

- job type
- task link
- status
- retry metadata
- cooldown metadata
- idempotency key
- next run
- last result summary

### 9.5 Prompt Metadata Layer

Prompt metadata should support:

- prompt key
- manifest name
- version
- hash
- active flag
- source files

Prompt content should also be designed so time-sensitive runs can safely inject:

- current UTC time
- resolved user timezone
- current user-local time

## 10. Runtime Flow V2

### 10.1 Inbound Message Flow

1. WhatsApp event arrives.
2. Channel Intake Core normalizes it.
3. Raw message is stored.
4. Identity Core resolves sender/contact/Human API context.
   - this includes resolving contact-local timezone context where available
5. Deterministic preflight filters:
   - duplicate
   - protocol/noise
   - objective skip paths
6. Decision Gate Core runs a step-1 LLM reaction classifier.
7. If the classifier returns `history_only` or `ignore`:
   - persist state
   - stop without planner execution
8. If the classifier returns `reply_now` or `silent_review`:
   - Task Core loads or creates task state when relevant
   - Execution Core produces structured decision
   - Policy Core validates actions
   - allowed actions execute
   - Task Core appends events and updates snapshot
   - Memory Core promotes durable updates
   - direct reply occurs only for `reply_now`
9. Debug and Trace Core records the whole run

### 10.2 Scheduled Wake-Up Flow

1. Scheduler Core claims a due job.
2. Linked task charter, snapshot, and recent events are loaded.
   - timezone context used for the task should be available to the wake-up path
3. Decision Gate Core determines whether wake-up is deterministic or planner-required.
4. Execution Core runs only if needed.
5. Policy Core validates actions.
6. Task Core updates state.
7. Scheduler Core records outcome and chooses:
   - complete
   - reschedule
   - cooldown
   - block
   - handoff

### 10.3 Conflict and Clarification Flow

1. inbound information updates claims/facts
2. conflicting trusted claims are preserved, not overwritten
3. clarification thread is opened
4. relevant Human APIs are identified
5. system either asks a clarifying question or proposes handoff

## 11. Railway-Oriented Runtime Shape

Default V1 runtime:

- one Railway service running the backend app
- one Railway Postgres
- one Railway volume if needed for auth/session state

Internally the backend hosts:

- HTTP/admin endpoints
- WhatsApp connection
- scheduler loop
- agent execution loop

Potential V1.5 split, only if operationally needed:

- `app` service
- `worker` service

Important:

- this would still be one codebase
- still one product
- still not microservices in the business-logic sense

V1 default remains:

- one process model where practical

## 12. Build Sequence

V2 should be built in this order.

Each phase must leave the system in a working state.

### Phase 1: Channel Intake Core

Goal:

- stabilize inbound normalization and raw storage

Build items:

- normalize text/voice/image/document into one intake shape
- harden PN/LID mapping
- add duplicate and protocol-noise handling
- store raw inbound before planning
- preserve enough contact identity to resolve timezone defaults downstream

Done when:

- all inbound message kinds converge to one normalized event
- duplicate inbound events do not double-trigger reasoning

### Phase 2: Decision Gate Core

Goal:

- avoid waking the planner unnecessarily and move social participation judgment into a dedicated step-1 classifier

Build items:

- implement deterministic preflight only for objective skip conditions
- add LLM step-1 reaction classification
- define explicit `ReactionDecision` result types
- preserve escalation paths for time-sensitive requests when timezone confidence is missing
- add tests for:
  - deterministic preflight skip
  - `reply_now`
  - `silent_review`
  - `history_only`
  - `ignore`
  - multilingual/group participation behavior over time

Done when:

- planner is no longer the default first step for every message
- group participation does not depend on a growing library of hardcoded phrase rules

### Phase 3: Task Core

Goal:

- make durable tasks the execution backbone

Build items:

- introduce task charter
- introduce task snapshot
- append task events for meaningful transitions
- support task load/resume
- preserve the timezone context used when interpreting time-sensitive user intent

Done when:

- multi-step work survives beyond one conversation turn without relying on raw chat replay

### Phase 4: Execution Core

Goal:

- split product orchestration from generic planner/tool runner

Build items:

- define structured planner output schema
- remove dependence on persisted `thought`
- centralize tool runner
- validate action args against code-owned contracts
- inject UTC plus resolved user-local time context into time-sensitive planner/reply runs

Done when:

- reasoning outputs are structured, bounded, and independently testable

### Phase 5: Policy Core

Goal:

- enforce autonomy and outreach rules before side effects

Build items:

- add central action validator
- add risk and sensitivity classification
- add outreach permission checks
- add runtime safety toggles

Done when:

- unsafe outbound actions are blocked consistently

### Phase 6: Scheduler Core

Goal:

- make wake-ups reliable and safe

Build items:

- strengthen due-job claiming
- add retry metadata and cooldown rules
- add handoff-ready blocked state
- tie scheduler runs to task charter/snapshot/events
- preserve timezone context for reminder and follow-up interpretation

Done when:

- repeated failures do not create silent loops
- scheduled follow-up is reconstructable from DB state

### Phase 7: Memory Core

Goal:

- separate audit history from structured company memory

Build items:

- harden fact/claim provenance
- attach source references consistently
- add conflict detection path
- add clarification-thread linkage

Done when:

- structured memory is clearly no longer “chat log plus vibes”

### Phase 8: Prompt Ops Core

Goal:

- make prompt tuning safe and fast

Build items:

- finalize `prompts/` file layout
- add manifest composition
- add reload/activation flow
- log prompt metadata per call

Done when:

- prompt edits can be activated without full redeploy and traced in runtime records

### Phase 9: Debug and Trace Core

Goal:

- make multi-step failures diagnosable

Build items:

- structured Postgres trace records
- runtime debug toggles
- task/run/message/job correlation
- prompt and tool trace metadata

Done when:

- failed runs are reconstructable without relying on console logs alone

### Phase 10: End-to-End Validation

Goal:

- prove the operational workflows work as one system

Validation set:

- text instruction -> task -> follow-up -> completion
- reminder request -> scheduled job -> delayed reminder
- reminder request with local-time phrasing -> correct timezone-resolved execution
- voice note -> transcript -> task/reply
- image input -> analysis -> task/reply
- conflicting facts -> clarification thread
- blocked task -> correct human handoff
- policy-blocked outbound -> visible denial

Done when:

- each scenario leaves coherent raw history, structured memory, task state, scheduler records, and debug traces

## 13. Test Strategy

V2 must copy the attitude of the reference repos:

- test operational edges, not just sunny-day chat

Required test focus:

### 13.1 Intake tests

- duplicate message handling
- protocol noise handling
- media normalization
- PN/LID identity normalization

### 13.2 Decision Gate tests

- discussion vs instruction
- question vs task
- fact vs clarification-open
- planner-required vs deterministic path

### 13.3 Task tests

- task creation idempotency
- task resume from snapshot
- blocked state transitions
- wait state transitions

### 13.4 Execution tests

- planner emits malformed action
- tool arg schema violation
- one tool succeeds and next fails
- policy denial after planning

### 13.5 Scheduler tests

- duplicate wake-up claim
- retry with cooldown
- non-retryable failure
- handoff escalation after threshold
- local-time interpretation remains stable across wake-up execution

### 13.6 Memory tests

- provenance preserved on fact update
- conflicting claims do not overwrite silently
- clarification thread creation

## 14. What We Will Deliberately Not Build In V1

- multi-agent decomposition as a core architecture
- generic plugin marketplace architecture
- vector DB before Postgres is clearly insufficient
- event bus or queue platform
- company-wide autonomous monitoring loops
- full ERP-style automation engine
- perfect org graph before useful operation
- multiple deployable services by default

## 15. Immediate Next Document After V2

After this V2 build plan, the next supporting document should be:

- a mini-core implementation map

That document should list, for each mini-core:

- owner files in this repo
- candidate new files/modules
- exact repo methods being borrowed
- exact anti-patterns to avoid
- acceptance tests

## 16. Final Intent

V2 is a change in build method, not a change in mission.

We are still building:

- a practical WhatsApp AI employee
- not a flashy demo agent
- not a generalized framework
- not a research toy

The build must now reflect the mature lesson:

- unique product semantics stay ours
- solved runtime patterns are borrowed
- architecture is modular internally
- deployment remains simple externally

If future implementation choices conflict with this document, choose the path that:

- preserves product intent
- reduces runtime fragility
- avoids unnecessary invention
- preserves correct local-time behavior for task and scheduling flows
- keeps the MVP deployable on Railway with confidence
