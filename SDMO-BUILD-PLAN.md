# Schema Driven Memory Optimization (SDMO)
## Revised Build Plan And Workflow Fit

> **Status:** Revised after project-wide review on 2026-04-08; Phase 0 through Phase 5 complete  
> **Build posture:** Keep the SDMO direction, correct the drift, then finish the remaining phases  
> **Mission:** Help the WhatsApp AI Employee stay smart, efficient, auditable, and cheap to operate as memory grows

### Progress Tracker

- [x] Phase 0: Foundation alignment
- [x] Phase 1: Descriptive schema runtime integration
- [x] Phase 2: Optimizer hardening
- [x] Phase 3: Watcher validation
- [x] Phase 4: MCP hardening
- [x] Phase 5: ContextBudget assembler
- [ ] Phase 6: Validation and schema iteration

Latest completed milestone:

- **2026-04-08:** Actual-time reminder normalization completed
  - planner and tool-policy paths now interpret scheduled times as user-local wall clock before converting to UTC
  - runner execution context now carries the resolved timezone into tool validation
  - regression tests cover the Kuala Lumpur reminder case that previously fired 8 hours late

- **2026-04-08:** Phase 5 ContextBudget Assembler completed
  - added `src/lib/context-budget.ts` with explicit layer priorities and trimming rules
  - inbound and wake-up runner payloads now use budgeted context instead of raw context bundles
  - `SDMO_CONTEXT_BUDGET_TOKENS` is now configurable in app config
  - focused context-budget tests verify lower-priority trimming and `TASK_SUMMARY` preservation

- **2026-04-08:** Phase 4 MCP Hardening completed
  - the Postgres MCP now enforces explicit table exposure rules in code
  - the allowlist now matches the intended agent-memory tables more closely
  - focused MCP tests now cover non-SELECT rejection, multi-statement rejection, table exposure denial, and row-limit enforcement

- **2026-04-08:** Phase 3 Watcher Validation completed
  - focused watcher tests now cover threshold polling, optimizer triggering, skip logging, and overlapping-poll protection

- **2026-04-08:** Phase 2 Optimizer Hardening completed
  - `MemoryOptimizerService` now uses repository contracts instead of reaching into the repository pool directly
  - repository now exposes full-event-history and latest-summary helpers for SDMO internals
  - focused optimizer tests now cover cooldown skip behavior and successful summary/fact/index writeback

- **2026-04-08:** Phase 1 Descriptive Schema Runtime Integration completed
  - agent runner prompt manifests now attach `prompts/schema/postgres-schema.md` as a distinct runtime reference artifact
  - JSON output schema remains separate from the memory-map reference
  - prompt registry and LLM router now support a separate `referenceContext` channel for query-capable planner paths

- **2026-04-08:** Phase 0 Foundation Alignment completed
  - canonical SDMO task optimization fields now live on `tasks.last_optimized_at` and `tasks.sdmo_optimization_count`
  - runtime reads were aligned away from `tasks.metadata`
  - migration `015_sdmo_task_optimization_meta_backfill.sql` backfills old metadata-backed values into canonical task columns

---

## 0. Why This Revision Exists

The original SDMO document was directionally strong, but the repo had drifted into an in-between state:

- several SDMO components already existed in code
- some completed sections had drifted from the intended design
- the descriptive schema existed as a document before it was wired as a first-class runtime artifact
- the final context-budgeting layer was still missing

This revision does **not** change the product vision.

It changes the SDMO plan so it fits the whole project workflow:

- the **live reasoning loop** that handles inbound messages and wake-ups
- the **memory maintenance loop** that keeps context healthy over time
- the **validation loop** that proves the agent is behaving intelligently in real use

---

## 1. SDMO In The Whole System

SDMO is not the whole brain.

It is the **memory scaling and retrieval discipline** for the brain.

Within this project, the system has three operating loops:

### 1.1 Live Reasoning Loop

This is the user-facing loop:

1. deterministic preflight
2. identity and audience resolution
3. reaction classification
4. task load or task creation
5. context assembly
6. planning and bounded read-tool use
7. policy validation
8. side-effect execution
9. structured writeback

This loop must optimize for:

- correctness
- latency
- bounded prompt size
- safe side effects

### 1.2 Memory Maintenance Loop

This is the SDMO loop:

1. observe token growth and long-running task shape
2. distill raw task history into reusable summaries
3. promote durable Tier 1 rules and facts
4. archive cold history without destroying auditability
5. expose memory through safe on-demand retrieval
6. improve schema guidance based on query behavior

This loop must optimize for:

- long-term memory quality
- cost control
- prompt stability
- auditability

### 1.3 Validation Loop

This is the operator-confidence loop:

1. run real WhatsApp scenarios
2. inspect traces, task state, and memory writes
3. review what the agent loaded, what it ignored, and what it asked
4. tighten prompts, schema guidance, and policy rules

This loop must optimize for:

- trust
- behavior quality
- operational confidence

---

## 2. What SDMO Is

**Schema Driven Memory Optimization** means:

- Postgres is the durable long-term memory store
- the LLM should be told **where memory lives** and **how to query it**
- the runtime should stop dragging large raw memory blobs into every call
- old context should be compressed into explicit checkpoints, not silently discarded

The architecture still has three core pieces:

1. **Tiered memory model**
2. **Memory optimizer service**
3. **Read-only Postgres MCP plus descriptive schema**

That direction remains correct.

---

## 3. SDMO Goals

SDMO must make the agent:

- smarter over time, not worse over time
- cheaper as history grows
- more precise about what it loads into prompts
- more capable of retrieving exact history when needed
- easier to debug and audit

SDMO must **not** turn the product into:

- a generic RAG chatbot
- a vector-database-first architecture
- a hidden summarization system with no provenance
- a rewrite of the task model

The task model remains:

- `charter`
- `snapshot`
- `events`

SDMO exists to make that model scale.

---

## 4. The Problem SDMO Solves

Without SDMO, the runtime trends toward:

- larger prompt payloads
- more irrelevant context
- worse reasoning quality on older tasks
- rising token cost for the same user-visible outcome

The key failure mode is the same:

> raw history and loosely filtered context keep accumulating into prompts until the agent becomes slower, noisier, and less focused.

The intended shift remains:

> from "Here is all your memory"  
> to "Here is your memory map; fetch what you need."

That is still the correct mental model.

---

## 5. Current Repo Reality

This section is the truth source for what exists today.

### 5.1 Phase 0 Reality: Foundation Mostly Exists

Already present in code:

- migration `014_sdmo_schema.sql`
- migration `015_sdmo_task_optimization_meta_backfill.sql`
- `facts.memory_tier`
- `task_events.is_archived`
- task-event filtering that prefers `TASK_SUMMARY`
- active-only task filtering by default
- Tier 1-only fact injection in recent context

Conclusion:

- **Phase 0 is complete**

### 5.2 Phase 1 Reality: Schema Document And Runtime Wiring Exist

Already present in repo:

- `prompts/schema/postgres-schema.md`
- agent-runner prompt manifests attach the schema document as a separate runtime reference artifact
- JSON output schema remains separate from the descriptive memory-map reference

Conclusion:

- **Phase 1 is complete**

### 5.3 Phase 2 Reality: Optimizer Exists

Already present in code:

- `MemoryOptimizerService`
- `runForTask(taskId)`
- summary-event creation
- archiving logic
- Tier 1 fact promotion
- memory index writeback
- manual admin endpoints

Current drift:

- broader integration and watcher-driven validation still need improvement

Conclusion:

- **Phase 2 is complete**

### 5.4 Phase 3 Reality: Watcher Exists

Already present in code:

- `TokenThresholdWatcher`
- config for token threshold and cooldown
- source-task linkage in LLM call logs
- startup wiring
- manual watcher poll endpoint

Conclusion:

- **Phase 3 is complete**

### 5.5 Phase 4 Reality: MCP And ReAct Loop Exist And Are Hardened

Already present in code:

- `query_database` tool
- read-only tool shape in executor and policy
- minimal ReAct loop in the runner
- hard LIMIT injection
- SELECT-only and multi-statement guards

Current drift:

- deeper behavioral query validation still belongs to Phase 6

Conclusion:

- **Phase 4 is complete**

### 5.6 Phase 5 Reality: Context Budget Layer Exists

Current state:

- context assembly now runs through an explicit budget layer
- inbound and wake-up payloads are trimmed by priority before planner calls
- further tuning and validation still belong to Phase 6

Conclusion:

- **Phase 5 is complete**

### 5.7 Phase 6 Reality: Not Started As A Formal Loop

Missing:

- observed-query review discipline
- schema-guidance iteration loop
- explicit validation checklist for retrieval quality

Conclusion:

- **Phase 6 is not implemented**

---

## 6. Non-Negotiable Design Rules

These rules replace ambiguous or stale wording in the prior draft.

1. **SDMO must fit the whole agent workflow, not compete with it.**
   - live reasoning, memory maintenance, and validation must work together

2. **The live reasoning loop stays simple.**
   - optimizer and watcher remain off the critical path

3. **Structured memory must preserve provenance.**
   - summaries compress context, but must not silently destroy auditability

4. **The descriptive schema is a runtime artifact, not just documentation.**
   - it must be injectable, versioned, and testable

5. **Prompt size must become budgeted, not merely reduced.**
   - SDMO is not complete until a hard context budget exists

6. **Read-only retrieval rules must be true in code, not only true in prose.**

7. **Corrections beat momentum.**
   - if completed phases drift from the design, fix them before finishing later phases

---

## 7. Corrective Work Required Before Declaring SDMO Complete

This is the key change in the revised plan.

Before continuing the remaining phases, the already-built sections must be aligned.

### 7.1 Correct The Task Optimization Metadata Model

Required change:

- stop splitting the source of truth between dedicated task columns and `tasks.metadata`

Preferred rule:

- use `tasks.last_optimized_at` and `tasks.sdmo_optimization_count` as the canonical fields
- `metadata` may still hold auxiliary notes, but not canonical optimization counters/timestamps

Reason:

- cleaner schema
- easier reporting
- less drift
- less hidden state

### 7.2 Make The Descriptive Schema A Runtime Prompt Artifact

Required change:

- the agent’s planner path must be able to receive the SDMO schema document intentionally

Preferred rule:

- keep the action-output schema as the JSON output contract
- inject the descriptive schema as a distinct runtime reference artifact for query-capable runs
- do not confuse "JSON output schema" with "memory map"

Reason:

- these are different concerns
- the model needs both:
  - how to answer
  - how to retrieve

### 7.3 Enforce MCP Exposure Rules In Code

Required change:

- table exposure must be restricted by real validation, not only by connection-level intent

Minimum enforcement:

- SELECT only
- no multiple statements
- hard row cap
- explicit allowlist for exposed tables

Reason:

- defense in depth
- reduced accidental misuse
- alignment between documentation and runtime reality

### 7.4 Add Context Budgeting Before Calling SDMO Finished

Required change:

- replace manual raw context assembly with a budget-aware assembler

Reason:

- without this, SDMO reduces context growth but does not truly control it

### 7.5 Add Focused SDMO Validation

Required change:

- add focused tests for optimizer, watcher, MCP hardening, and budgeted context assembly

Reason:

- build passing is not enough
- this area changes behavior quality, not just plumbing

---

## 8. Revised Build Sequence

This replaces the previous "Phase 0-6 are mostly linear and already done" interpretation.

### Phase 0: Foundation Alignment

**Status:** Complete on 2026-04-08

**Goal:** Make the existing SDMO schema and runtime agree.

Build items:

- reconcile task optimization metadata to canonical task columns
- keep `getTaskEvents()` summary-aware and backward-compatible
- keep active-task filtering and Tier 1 fact injection behavior
- update inspection/admin surfaces to read the canonical fields

Done when:

- the database schema and runtime state model match
- optimization metadata has one canonical storage location

### Phase 1: Descriptive Schema Runtime Integration

**Status:** Complete on 2026-04-08

**Goal:** Turn the schema document into a real runtime memory-map artifact.

Build items:

- keep `prompts/schema/postgres-schema.md` as the durable document
- register it clearly in prompt/prompt-adjacent runtime flow
- decide how it is injected:
  - always for query-capable planner paths
  - or conditionally when read retrieval is available
- validate sample questions against the actual runtime path

Done when:

- the planner can meaningfully use the schema as a retrieval guide
- the schema document is versioned and intentionally wired

### Phase 2: Optimizer Hardening

**Status:** Complete on 2026-04-08

**Goal:** Keep the optimizer, but make it cleaner and more testable.

Build items:

- remove direct repository pool reach-through where practical
- expose repository methods for:
  - load full event history
  - retrieve latest summary event id
- preserve idempotent behavior
- add focused tests for:
  - cooldown
  - summary creation
  - event archiving
  - Tier 1 fact promotion

Done when:

- the optimizer is independently testable without hidden repository internals

### Phase 3: Watcher Validation

**Status:** Complete on 2026-04-08

**Goal:** Validate the watcher as the maintenance trigger, not merely as startup code.

Build items:

- confirm threshold lookup logic against real `llm_call_logs`
- confirm terminal tasks are excluded
- confirm repeated polls do not pile up
- confirm cooldown interaction works as intended
- add focused watcher tests

Done when:

- the optimizer fires when useful and stays quiet when not useful

### Phase 4: MCP Hardening

**Status:** Complete on 2026-04-08

**Goal:** Make on-demand retrieval safe, predictable, and aligned with the schema.

Build items:

- enforce actual table exposure rules
- preserve SELECT-only and row-cap behavior
- ensure formatted results are compact and useful for the planner
- validate aggregate queries and common retrieval scenarios
- verify the ReAct loop stops cleanly within bounded read cycles

Done when:

- the agent can safely retrieve exact memory without relying on oversized prompt injection

### Phase 5: ContextBudget Assembler

**Status:** Complete on 2026-04-08

**Goal:** Put a hard operational ceiling on prompt construction.

Build items:

- add a context-budget assembler module
- define layers in priority order:
  - Layer 1: agent identity and Tier 1 rules
  - Layer 2: current task snapshot and summary-aware recent events
  - Layer 3: sender profile and recent messages
  - Layer 4: memory evidence and optional retrieval guidance
- trim lower-priority layers first
- integrate into inbound and wake-up flows
- add config for budget size

Done when:

- prompt size becomes deliberate and deterministic

### Phase 6: Validation And Iteration Loop

**Goal:** Make SDMO behavior observable and improvable in operation.

Build items:

- define SDMO scenario tests:
  - long-running task with many events
  - historical fact lookup
  - completed-task retrospective query
  - user-correction promotion to Tier 1
  - blocked wake-up that needs archived history
- review MCP query patterns and empty-result cases
- improve schema wording where query behavior is weak
- update milestone and implementation docs to reflect the new reality

Done when:

- SDMO quality is verified through behavior, not just through component existence

---

## 9. Context Budget Model

This section is added because the project now clearly needs it.

### 9.1 Budget Priorities

The runtime should assemble context in this order:

1. **Identity and invariant rules**
   - bot identity
   - authority context
   - Tier 1 facts

2. **Current work state**
   - task charter summary if relevant
   - task snapshot
   - `TASK_SUMMARY`
   - most recent live task events

3. **Conversation-local context**
   - sender/contact profile
   - recent messages
   - audience context

4. **Retrieved support context**
   - memory browser hits
   - query results from read tools
   - schema guidance when appropriate

### 9.2 Budget Rule

When trimming is needed:

- trim retrieval support before trimming current task state
- trim current task detail before trimming invariant rules
- never discard the task snapshot in favor of raw event volume

### 9.3 Practical Intent

The model should see:

- who is involved
- what the current task state is
- what standing rules matter
- only the minimum extra history required to act safely

---

## 10. Validation Standard

SDMO is complete only if it improves real workflows.

Required validation scenarios:

1. **Long-running task compression**
   - a task with many events should load quickly through summary plus recent live slice

2. **Historical lookup**
   - the agent should be able to answer questions about older completed work using retrieval, not prompt stuffing

3. **User correction durability**
   - strong user correction should become persistent, high-priority memory

4. **Wake-up continuity**
   - scheduled wake-ups should still reason correctly after old task events are archived

5. **Prompt stability**
   - prompt size should stay inside the configured budget even as database history grows

6. **Auditability**
   - operators should still be able to reconstruct why a task was summarized, what was archived, and what was promoted

---

## 11. Open Questions That Still Matter

1. **Schema injection strategy**
   - always available to query-capable planner paths, or conditionally injected only when retrieval is likely?

2. **Optimizer model selection**
   - should the optimizer use the same runtime model or a stronger summarization-oriented model?

3. **Read-cycle configurability**
   - is `MAX_READ_CYCLES = 2` enough for the common retrieval tasks we care about?

4. **Tier 1 conflict handling**
   - when optimizer promotions disagree with existing Tier 1 facts, how should clarification be opened and surfaced?

5. **Result formatting**
   - what result shape helps the planner most: raw rows, compact summaries, or mixed formatting depending on query type?

---

## 12. Build Order Summary

The new order is:

```
Phase 0  -> Foundation alignment
Phase 1  -> Descriptive schema runtime integration
Phase 2  -> Optimizer hardening
Phase 3  -> Watcher validation
Phase 4  -> MCP hardening
Phase 5  -> ContextBudget assembler
Phase 6  -> Validation and schema iteration
```

Interpretation:

- do **not** rebuild SDMO from zero
- do **not** skip corrective alignment
- do **not** call SDMO complete before Phase 5 and Phase 6 are done

---

## 13. Final Intent

SDMO should make this project behave more like a capable employee and less like a context-bloated chatbot.

If implementation choices conflict with this document, choose the path that:

- preserves the original project vision
- keeps the live reasoning loop simple
- keeps long-term memory retrieval precise
- keeps prompt size bounded
- keeps side effects safe
- keeps behavior auditable

This revised SDMO plan is now the active source of truth for SDMO work in this repo.
