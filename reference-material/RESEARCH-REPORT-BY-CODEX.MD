# Agentic AI Reference Research Report

Date: 2026-04-02

Scope:
- Read `PROJECT-BLUEPRINT.md`
- Read `AGENTIC-AI-BUILDPLAN.md`
- Skipped milestone material on purpose
- Reviewed these local reference repos in `reference-material/`:
  - `fastclaw`
  - `gloamy`
  - `nanobot`

## Executive Summary

The important realization is correct: you should not reinvent the runtime patterns that open source agent projects have already paid to discover.

But there is also an equally important counterpoint:

Your product goal is still more specific than all three repos.

You are not building a generic AI chat agent.
You are building a WhatsApp AI employee with:

- durable company memory
- provenance-preserving facts and claims
- real task lifecycle
- scheduled follow-up
- controlled autonomy
- human authority routing (`Human APIs`)
- company DB read-only access
- operational behavior that feels like a junior employee, not a toy assistant

So the right conclusion is not "throw away the product idea and adopt a repo wholesale."

The right conclusion is:

1. keep your product definition
2. borrow proven runtime patterns
3. stop designing infrastructure from zero where others already solved it
4. stay strict about the pieces that are unique to your product

My high-level conclusion:

- `nanobot` is the closest reference for a lean, practical, multi-channel assistant runtime with WhatsApp already working.
- `gloamy` is the strongest reference for engineering discipline: security policy, task persistence, scheduler hardening, routing, observability, and test depth.
- `fastclaw` is the strongest reference for productized operator experience: onboarding, plugins, dashboard, hot reload, single-binary ergonomics.

If you try to copy only one repo, you will inherit the wrong compromises.
The best path is hybrid:

- take channel/runtime simplicity ideas from `nanobot`
- take task/scheduler/policy rigor from `gloamy`
- take operator UX and hot-reload ideas from `fastclaw`
- keep your own product-specific memory, Human API, and business workflow model

## 1. What You Actually Want To Build

From `PROJECT-BLUEPRINT.md` and `AGENTIC-AI-BUILDPLAN.md`, the real product is:

### Core identity

A WhatsApp-based AI employee that can:

- receive work from WhatsApp
- interpret text, voice, image, document, and URL inputs
- keep company knowledge over time
- message people when appropriate
- schedule follow-ups and wake itself up later
- ask the right person when blocked
- operate autonomously for low-risk work

### What makes it different from generic agent frameworks

Your product definition is not mainly about "tool use."
It is about operational company behavior.

The distinguishing ideas are:

- raw chat is audit trail, not the brain
- structured memory is separate from chat history
- facts and claims need provenance
- explicit instructions are different from casual discussion
- tasks are durable work objects, not just conversation turns
- people are modeled as domain authorities (`Human APIs`)
- conflicts should create clarification, not blind overwrite
- autonomy should be useful but policy-gated

### The runtime you want

The build plan is pushing toward:

- deterministic intake gate before LLM
- message classification before planning
- task promotion rules
- task charter + task snapshot + task events
- policy-gated action execution
- retry and no-progress detection
- scheduler-backed wake-ups
- prompt files as editable operating surface
- structured debug traces in Postgres

This is a very good product/runtime target.

The problem is not the target.
The problem is building all of the runtime mechanics from scratch when proven versions already exist elsewhere.

## 2. Quick Read On Your Current Repo

Your current codebase already has useful foundations:

- WhatsApp normalization with Baileys and media extraction in `src/services/whatsapp-service.ts`
- Postgres repository and structured tables in `src/database/repository.ts`
- scheduler claiming due jobs in `src/services/scheduler-service.ts`
- prompt registry seam in `src/agent/runner.ts`
- debug logging infrastructure already writing structured data

But relative to your build plan, the current implementation still looks early:

- `src/services/agent-service.ts` is still mostly a one-pass plan -> tools -> reply pipeline
- `src/agent/runner.ts` persists a `thought`, which conflicts with the build-plan move away from chain-of-thought persistence
- `src/agent/executor.ts` has a very small action catalog and limited policy gating
- `src/services/scheduler-service.ts` polls and executes, but does not yet embody the hardening level described in the build plan
- task context is still much thinner than the build-plan `task charter + snapshot + events` model

So the repo is not in the wrong direction.
It is just missing battle-tested runtime patterns that the reference projects already implement.

## 3. Repo Deep Dive: FastClaw

## What it is

`fastclaw` is a self-hosted Go agent runtime built as a product shell:

- single binary
- provider abstraction
- channels via plugins
- tools
- memory
- cron
- web dashboard
- OpenAI-compatible API

Relevant code and docs:

- `reference-material/fastclaw/README.md`
- `reference-material/fastclaw/internal/agent/loop.go`
- `reference-material/fastclaw/internal/agent/memory.go`
- `reference-material/fastclaw/internal/cron/scheduler.go`
- `reference-material/fastclaw/internal/policy/engine.go`
- `reference-material/fastclaw/internal/store/database.go`

## How it is built

The main runtime shape is clean and pragmatic:

- ReAct loop in `internal/agent/loop.go`
- tool registry and concurrent tool execution
- session-based conversation state
- dual-layer memory using `MEMORY.md` and `HISTORY.md`
- cron scheduler and DB-backed cron rows
- coarse policy engine for filesystem/network/tool allow-deny rules
- plugin system over JSON-RPC subprocesses

The strongest product-level ideas:

- single deployable binary
- setup wizard + dashboard
- plugin-driven extensibility
- hot-reload/operator-centric posture

## Where FastClaw is better than your current build

### 1. Productization and operator UX

It is much more "ready to operate" than your current runtime:

- onboarding flow
- dashboard
- plugins
- management surfaces
- OpenAI-compatible API

Your repo currently has more backend intent, but FastClaw has a more complete operator shell.

### 2. Simpler provider independence

It already keeps the core loop provider-agnostic and wires tools/provider integration behind stable seams.

### 3. Single-runtime simplicity

It matches your "boring and reliable single-server" instinct better than big framework-style systems.

## Where FastClaw does not fit your product

### 1. Memory is too generic

Its memory model is useful for assistant memory, but not for your business memory model.

It stores:

- `MEMORY.md`
- `HISTORY.md`
- session logs

That is not enough for:

- fact provenance
- claim conflict handling
- Human API authority
- task intent durability
- structured clarification flows

### 2. Task model is weak for operational work

FastClaw has cron and agent sessions, but it does not appear to center the runtime on durable business tasks the way your build plan requires.

Your target needs:

- task charter
- task snapshot
- task events
- blockers
- waiting reasons
- handoff state

FastClaw is much closer to "agent conversation with tools" than "operational task engine."

### 3. Scheduler depth is not strong enough

Its scheduler works, but the DB-backed path is still simplistic.
In `internal/cron/scheduler.go`, DB jobs are polled and then updated with a simple next-run step, instead of a deeper retry/idempotency/handoff model.

### 4. Policy is coarse

`internal/policy/engine.go` is mostly allow/deny checks for:

- filesystem
- network
- tools

That is useful, but it is not the richer execution-policy model your build plan wants.

### 5. Battle-tested signal is mixed

FastClaw clearly has strong product packaging, but the checked tree shows effectively no Go tests in the repo snapshot I reviewed.

That does not make it bad.
It just means I would not trust it as the main reference for runtime correctness compared with `gloamy` or `nanobot`.

## Best things to steal from FastClaw

- setup/onboarding UX
- hot-reload mentality
- operator dashboard/admin surfaces
- plugin/subprocess extensibility patterns
- single-binary/single-runtime philosophy

## 4. Repo Deep Dive: Gloamy

## What it is

`gloamy` is a large Rust runtime with explicit subsystem contracts and unusually strong operational and security engineering.

Relevant code and docs:

- `reference-material/gloamy/README.md`
- `reference-material/gloamy/AGENTS.md`
- `reference-material/gloamy/src/agent/loop_.rs`
- `reference-material/gloamy/src/agent/task_store.rs`
- `reference-material/gloamy/src/channels/mod.rs`
- `reference-material/gloamy/src/cron/scheduler.rs`
- `reference-material/gloamy/src/security/policy.rs`
- `reference-material/gloamy/src/providers/router.rs`
- `reference-material/gloamy/src/memory/mod.rs`

## How it is built

Gloamy is not just an agent loop.
It is a runtime platform with explicit contracts for:

- provider
- channel
- tool
- memory
- observer
- runtime adapter
- peripherals

This is backed by real implementation depth:

- routed provider abstraction
- multiple memory backends
- durable task store
- scheduler with retry and delivery logic
- strong security policy
- runtime trace / observer surfaces
- channel runtime with resumable state and cancellation

The biggest signal of maturity is not just features.
It is how much failure behavior is encoded into the codebase.

## Where Gloamy is better than your current build

### 1. It treats runtime failure as a first-class problem

This is the single biggest difference.

Your build plan talks about:

- partial failure rules
- retry classes
- no-progress detection
- blocked handoff
- execution envelopes

Gloamy already thinks this way in code.

Examples:

- durable task store in `src/agent/task_store.rs`
- persisted task snapshots and checkpoints
- cancellation/resume logic in `src/channels/mod.rs`
- retrying scheduler in `src/cron/scheduler.rs`
- strong policy enforcement in `src/security/policy.rs`

### 2. Task persistence is materially better than your current code

This is the closest thing in the references to your desired durable task engine.

What Gloamy has:

- `TaskRecord`
- `TaskSnapshot`
- checkpoint items
- resumable history
- persisted execution history
- cancellation / timeout / completed / failed statuses

This is much closer to your build plan than FastClaw or nanobot.

It is not the same as your desired `task charter + task snapshot + task events`, but it is the best practical reference.

### 3. Security policy is much more serious

Your build plan says tool use must be policy-gated.
Gloamy already enforces that like an actual runtime, not a TODO.

Its `SecurityPolicy` includes:

- autonomy levels
- read-vs-act distinction
- allowed commands
- forbidden paths
- workspace restriction
- approval requirements
- action rate budgets
- command risk classification

This is the closest match to the execution-policy layer your build plan describes.

### 4. Scheduler hardening is better

`src/cron/scheduler.rs` shows much more maturity than simple polling:

- retry behavior
- jittered backoff
- policy checks
- run persistence
- delivery handling
- job result recording
- one-shot auto-delete behavior
- tests for retry, blocking, timeout, malformed args, and persistence

This is exactly the kind of "battle-tested boring logic" you should avoid reinventing.

### 5. Channel runtime is stronger

`src/channels/mod.rs` is a serious runtime:

- per-sender history
- resumable task state
- cancellation of older in-flight work
- draft streaming
- message timeout scaling
- checkpoint persistence
- hook surfaces

That is much more robust than a simple inbound -> reply loop.

### 6. Test depth is massive

The repo snapshot shows roughly `3757` Rust test annotations.

Even allowing some inflation from inline/unit tests, the signal is clear:
Gloamy has spent a lot of energy hardening edge cases.

## Where Gloamy does not fit your product

### 1. It is too broad for your MVP if copied wholesale

Gloamy is a platform runtime.
Your product is narrower and more domain-specific.

If you adopt too much of it, you risk:

- bringing in broad generality you do not need
- slowing delivery
- inheriting complexity outside WhatsApp AI employee needs

### 2. Its task model is still generic runtime tasking, not company operations

It has durable task execution state, which is great.
But your product still needs unique layers Gloamy does not provide:

- Human API authority graph
- company fact/claim provenance model
- clarification thread model
- initiator-anchor onboarding logic
- company DB read-only workflow semantics

### 3. Prompt operating surface is not your exact model

Gloamy uses workspace/system prompt composition ideas, but not your planned manifest-driven prompt hub with explicit activation, rollback, and Postgres-traceable version metadata.

### 4. It does not define your business ontology

This matters.
Gloamy solves runtime plumbing better than you currently do.
It does not solve your actual company assistant ontology.

## Best things to steal from Gloamy

- durable task persistence patterns
- task checkpointing and resumability
- scheduler retry/idempotency thinking
- security/autonomy policy model
- channel cancellation and timeout handling
- routed provider abstraction
- test philosophy
- observability discipline

## 5. Repo Deep Dive: nanobot

## What it is

`nanobot` is an ultra-lightweight Python assistant runtime inspired by OpenClaw.
It aims for simplicity while still shipping:

- multi-channel support
- WhatsApp bridge
- provider abstraction
- tools
- memory consolidation
- cron
- Python SDK
- OpenAI-compatible API

Relevant code and docs:

- `reference-material/nanobot/README.md`
- `reference-material/nanobot/nanobot/agent/loop.py`
- `reference-material/nanobot/nanobot/agent/runner.py`
- `reference-material/nanobot/nanobot/agent/memory.py`
- `reference-material/nanobot/nanobot/cron/service.py`
- `reference-material/nanobot/nanobot/channels/manager.py`
- `reference-material/nanobot/nanobot/channels/whatsapp.py`
- `reference-material/nanobot/nanobot/providers/registry.py`

## How it is built

nanobot separates the runtime cleanly:

- `AgentLoop` handles product-layer message processing
- `AgentRunner` handles the pure tool-capable LLM loop
- `ToolRegistry` owns tool definitions/execution
- `MemoryConsolidator` handles context-window pressure and long-term memory consolidation
- `CronService` handles job scheduling
- `ChannelManager` handles outbound dispatch/retry
- channels are pluggable
- WhatsApp is implemented through a Node bridge

It is a very practical architecture.
Probably the cleanest "small but real" reference of the three.

## Where nanobot is better than your current build

### 1. It has a very good separation between agent loop and generic execution loop

This is a big win.

`nanobot/agent/runner.py` is a shared execution loop:

- call provider
- execute tool calls
- collect results
- stop on final response

Then `nanobot/agent/loop.py` handles:

- sessions
- bus
- channel behavior
- memory consolidation
- progress streaming
- direct message processing

That split is something your runtime should borrow.

### 2. WhatsApp and multi-channel practicality is strong

For your project specifically, this matters a lot.

nanobot already has:

- a Node-based WhatsApp bridge
- channel manager with retry
- message dispatch
- QR login path
- media handling

This makes it highly relevant as a reference for your actual communication surface.

### 3. Memory consolidation is better than naive session replay

Its memory system is still generic assistant memory, but operationally it is solid:

- persistent `MEMORY.md`
- persistent `HISTORY.md`
- token-budget-aware consolidation
- fallback raw archive if consolidation fails repeatedly

That is much better than just replaying growing chat history forever.

### 4. Lightweight but still battle-hardened

The repo snapshot shows roughly `879` Python tests.

That is a strong signal for a small project.
It also ships a lot of practical channel/provider fixes in the README release history, which suggests real-world iteration.

### 5. Channel manager quality is good

`nanobot/channels/manager.py` has:

- outbound retry
- exponential backoff
- stream delta coalescing
- channel discovery
- explicit start/stop lifecycle

That is exactly the kind of glue code people underestimate when building from scratch.

## Where nanobot does not fit your product

### 1. Durable task model is still too light

nanobot is excellent as a lightweight assistant runtime.
It is not centered on durable operational work objects the way your build plan is.

It has sessions, tools, cron, and message loops.
It does not really give you:

- task charter
- task snapshot
- provenance-heavy task lifecycle
- clarification threads
- blocked-task handoff semantics

### 2. Memory is still assistant memory, not company operations memory

Like FastClaw, nanobot treats memory primarily as:

- long-term assistant context
- searchable history
- summarization/consolidation

That is helpful, but it does not implement your structured ontology of:

- claims
- facts
- authority
- task state
- Human API

### 3. Scheduler is practical but not ideal for your architecture

Its `CronService` is file-backed JSON scheduling.
That is elegant for a lightweight assistant, but your product wants Postgres-backed operational durability.

### 4. Safety model is lighter than Gloamy

nanobot has useful guardrails and tool validations, but not the same deep execution-policy layer as Gloamy.

## Best things to steal from nanobot

- agent loop vs agent runner separation
- WhatsApp bridge and channel patterns
- lightweight multi-channel runtime design
- memory consolidation under token pressure
- simple but practical cron service shape
- strong channel manager behavior
- "small core, real features" mentality

## 6. Component-By-Component Comparison

## Inbound intake and normalization

### Your target

- deterministic intake gate before LLM
- normalize text/voice/image/document into one intake shape
- dedupe noise
- separate raw audit storage from agent wake-up

### FastClaw

- generic chat/message handling
- not obviously centered on deterministic pre-LLM intake classification

Assessment:
- useful generic loop
- weak match for your exact intake philosophy

### Gloamy

- strong channel runtime
- multimodal support
- per-channel handling
- cancellation and timeout discipline

Assessment:
- much stronger runtime plumbing than FastClaw
- still not specifically designed around your classification matrix

### nanobot

- closest practical fit
- multimodal inputs are normalized into one processing loop
- channels feed a common bus and common agent loop

Assessment:
- best reference for the intake shape

### Best takeaway

Borrow nanobot’s simple normalized loop shape, then add your own deterministic event gate before planner calls.

## WhatsApp channel

### Your target

- Baileys-based WhatsApp runtime
- PN/LID identity stability
- voice/image/document ingestion
- safe outbound

### FastClaw

- no strong built-in WhatsApp story in the checked code
- channels are plugin-oriented

Assessment:
- not the best primary reference here

### Gloamy

- WhatsApp support exists
- broader channel platform
- stronger runtime discipline

Assessment:
- valuable for multi-channel runtime patterns
- less obviously the leanest path for your WhatsApp-first MVP

### nanobot

- direct WhatsApp bridge implementation
- QR login path
- channel manager
- media handling

Assessment:
- strongest direct reference for your communication surface

### Best takeaway

For WhatsApp runtime decisions, nanobot is the most directly useful reference.

## Provider router

### Your target

- provider-independent core reasoning path
- capability split across different models/providers

### FastClaw

- provider abstraction exists
- practical, simple

### Gloamy

- best implementation depth
- routed provider abstraction in `src/providers/router.rs`
- model hint resolution
- strong provider ecosystem

### nanobot

- clean registry-based provider model
- pragmatic and easy to extend

### Best takeaway

Gloamy has the strongest router architecture.
nanobot has the cleanest lightweight pattern.
FastClaw is good enough but less interesting here.

## Prompt system

### Your target

- repo-file-first prompts
- manifest composition
- hot reload
- activation and rollback
- traceable prompt version metadata

### FastClaw

- closest in operator mindset
- hot-reload and editable persona/prompt surfaces are part of the product

### Gloamy

- prompt system exists, but not exactly your manifest/versioning target

### nanobot

- uses templates and context builders
- simpler, less governed

### Best takeaway

FastClaw is the best operator/UX reference.
None of the three fully implement the prompt governance model your build plan wants.

This is one area where your build plan is actually stronger than the references conceptually.

## Memory model

### Your target

- raw chat audit layer
- separate structured memory layer
- facts, claims, tasks, decisions, clarification threads, Human APIs
- provenance preserved

### FastClaw

- `MEMORY.md` + `HISTORY.md`
- session logs

### Gloamy

- multiple memory backends
- stronger storage abstraction
- still generic agent memory

### nanobot

- strong consolidation mechanics
- still generic assistant memory

### Best takeaway

All three are better at runtime memory mechanics than your current code.
None match your product memory ontology.

So:

- steal memory mechanics from nanobot/gloamy
- keep your own structured business memory model

## Durable task lifecycle

### Your target

- task charter
- task snapshot
- task events
- wake-up semantics
- waiting/blocking/handoff state

### FastClaw

- weak fit
- more session/agent/cron oriented than durable task oriented

### Gloamy

- best fit by far
- task store
- resumable task state
- checkpoints
- terminal states

### nanobot

- weak-to-moderate fit
- good loops, but not a strong task ontology

### Best takeaway

Use Gloamy as the primary reference for task lifecycle design.

## Scheduler and wake-up model

### Your target

- Postgres-backed scheduled jobs
- idempotent claiming
- retries
- no silent loops
- handoff when blocked

### FastClaw

- useful baseline cron
- too simple for your target

### Gloamy

- strongest scheduler design
- retries, persistence, delivery, security checks, tests

### nanobot

- elegant lightweight scheduler
- file-backed and simpler than your target

### Best takeaway

Gloamy is the main reference.
nanobot is a good fallback reference for keeping the scheduler simple where possible.

## Tool contracts and action catalog

### Your target

- code-owned action catalog
- argument validation
- policy gating
- side-effect awareness
- retry/idempotency classes

### FastClaw

- tools registry exists
- policy checks are coarse

### Gloamy

- strongest model
- security policy and tool execution are treated as runtime engineering

### nanobot

- clean registry and execution loop
- less formal policy layer

### Best takeaway

Take the action-catalog simplicity from nanobot, but the policy rigor from Gloamy.

## Debug and trace

### Your target

- structured Postgres debug traces
- prompt metadata
- task/run correlation
- runtime toggles

### FastClaw

- hooks and dashboard surfaces
- less evidence of deep structured execution tracing

### Gloamy

- observer / runtime trace / health / audit posture is strongest

### nanobot

- practical logs and test coverage
- less formal observability system

### Best takeaway

Gloamy is the best reference for execution observability.
Your own build plan is stronger than all three in explicitly requiring Postgres-centered structured traces.

## Human API, authority, onboarding, company DB

### Your target

- Human API authority graph
- initiator anchor
- company read-only DB
- clarification between people
- operational onboarding

### FastClaw

- does not solve this

### Gloamy

- does not solve this

### nanobot

- does not solve this

### Best takeaway

This is your real product moat.
Do not give this up by blindly adopting a generic agent runtime.

## 7. Why They Do It Better

This is the most important section.

The three repos mostly do not beat your project on product thinking.
They beat it on runtime maturity.

The recurring ways they do it better are:

### 1. They turn boundaries into code, not aspirations

They define seams like:

- channel layer
- provider layer
- tool layer
- memory layer
- scheduler layer
- security layer

Your build plan describes many of these correctly, but the references have already embodied them.

### 2. They design for failure, not just success

Especially `gloamy` and `nanobot`.

They have explicit handling for:

- retries
- cancellation
- streaming edge cases
- malformed tool output
- channel send failures
- timeout behavior
- provider weirdness

This is what battle-tested really means in practice.

### 3. They separate generic agent loop from product behavior

This is especially clear in `nanobot`.

You should not let your WhatsApp employee business logic own the low-level LLM tool loop directly.
That lower loop should be a reusable runtime component.

### 4. They accept operational glue as real engineering

Things like:

- channel retries
- scheduler persistence
- tool schema weirdness
- reconnect logic
- partial failure
- stream coalescing

These are not "boring afterthoughts."
These are where real agent systems fail.

### 5. They test edge cases heavily

This is where `gloamy` and `nanobot` stand out most.
Your build plan should copy their attitude here, even if not their exact code.

## 8. Which Repo Is Best For Which Part

## Best overall runtime reference

`gloamy`

Why:

- strongest engineering maturity
- best task persistence reference
- best scheduler hardening reference
- best security policy reference
- best observability mindset

Risk:

- too broad and heavy to copy wholesale

## Best WhatsApp-first practical reference

`nanobot`

Why:

- closest to your runtime shape
- WhatsApp already practical
- lightweight core
- clean loop separation
- strong channel behavior

Risk:

- task model is too light for your product

## Best operator/product-shell reference

`fastclaw`

Why:

- onboarding
- dashboard
- plugins
- hot reload
- single-binary product feel

Risk:

- weaker correctness/runtime depth for your needs

## 9. Recommendation For Your Build Plan

## Do not restart from zero again

That would repeat the same mistake in a different form.

Do not restart from scratch.
Do not replace your product definition.

Instead, revise your implementation plan like this:

### Keep from your own plan

- the WhatsApp AI employee product definition
- Human API authority model
- structured provenance-heavy memory
- task charter/snapshot/events concept
- company DB read-only separation
- prompt governance requirement
- structured debug trace requirement

### Borrow from nanobot

- split `AgentLoop` from `AgentRunner`
- normalize all channel inputs into one agent-input path
- keep channel manager concerns separate from reasoning loop
- keep cron simple unless complexity is necessary
- treat WhatsApp as a real first-class integration, not an adapter afterthought

### Borrow from Gloamy

- durable task store and checkpoint mindset
- cancellation/resume semantics
- policy-gated execution model
- scheduler retry/persistence patterns
- routed provider architecture
- strong timeout and failure handling
- heavy test focus on tool and channel edge cases

### Borrow from FastClaw

- onboarding/admin ergonomics
- hot-reload mindset
- plugin seam only where it creates real leverage

## 10. Suggested Architectural Direction From Here

If I were steering this repo after this research, I would not change the product goal.
I would change the implementation posture.

### Recommended runtime shape

1. `WhatsApp Intake Layer`
   - normalize inbound text/voice/image/document
   - dedupe/protocol filtering
   - store raw audit record first

2. `Deterministic Event Gate`
   - decide whether this is:
     - raw history only
     - memory promotion candidate
     - direct answer
     - task create/update
     - scheduled wake-up

3. `Task Engine`
   - durable task charter
   - durable task snapshot
   - append-only task events
   - wake-up and blocker semantics

4. `Agent Execution Loop`
   - pure structured planner + tool runner
   - provider-independent
   - no persisted chain-of-thought

5. `Execution Policy Layer`
   - validate every action before execution
   - outreach permission
   - sensitivity gating
   - retry and no-progress rules

6. `Memory Layer`
   - raw message archive
   - structured facts/claims/contacts/humans/tasks/clarifications

7. `Scheduler`
   - Postgres-backed job claiming
   - wake-up execution
   - retry / cooldown / handoff

This keeps your plan, but replaces "invent every runtime mechanism ourselves" with "compose proven patterns."

## 11. Final Bottom Line

Your product idea is more specific and more valuable than any of the three repos.

The open-source repos do not replace your product direction.
They replace the need to invent generic runtime plumbing from scratch.

Best single sentence summary:

Use `nanobot` as the closest practical runtime reference, use `gloamy` as the engineering-quality reference, use `fastclaw` as the operator-experience reference, and keep your own Human API + provenance-first operational memory model as the core differentiator.

## Appendix: Useful Files Reviewed

### Your repo

- `PROJECT-BLUEPRINT.md`
- `AGENTIC-AI-BUILDPLAN.md`
- `src/services/agent-service.ts`
- `src/agent/runner.ts`
- `src/agent/executor.ts`
- `src/database/repository.ts`
- `src/services/whatsapp-service.ts`
- `src/services/scheduler-service.ts`

### fastclaw

- `reference-material/fastclaw/README.md`
- `reference-material/fastclaw/internal/agent/loop.go`
- `reference-material/fastclaw/internal/agent/memory.go`
- `reference-material/fastclaw/internal/cron/scheduler.go`
- `reference-material/fastclaw/internal/policy/engine.go`
- `reference-material/fastclaw/internal/store/database.go`

### gloamy

- `reference-material/gloamy/README.md`
- `reference-material/gloamy/AGENTS.md`
- `reference-material/gloamy/src/agent/loop_.rs`
- `reference-material/gloamy/src/agent/task_store.rs`
- `reference-material/gloamy/src/channels/mod.rs`
- `reference-material/gloamy/src/cron/scheduler.rs`
- `reference-material/gloamy/src/security/policy.rs`
- `reference-material/gloamy/src/providers/router.rs`
- `reference-material/gloamy/src/memory/mod.rs`

### nanobot

- `reference-material/nanobot/README.md`
- `reference-material/nanobot/nanobot/agent/loop.py`
- `reference-material/nanobot/nanobot/agent/runner.py`
- `reference-material/nanobot/nanobot/agent/memory.py`
- `reference-material/nanobot/nanobot/cron/service.py`
- `reference-material/nanobot/nanobot/channels/manager.py`
- `reference-material/nanobot/nanobot/channels/whatsapp.py`
- `reference-material/nanobot/nanobot/providers/registry.py`
