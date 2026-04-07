# Project Blueprint: WhatsApp AI Employee

Date: 2026-04-02

This document is the durable design source for this project.

Its purpose is to preserve the full intent of the project, the important decisions made during discussion, and the practical rules for how the system should behave.

If a future session starts fresh, this file should be treated as the main product and architecture brief.

## 1. Project Vision

We are building an AI agent assistant that behaves like a company employee and lives on WhatsApp.

This is not just a chatbot.

It is meant to:

- communicate with the project owner on WhatsApp
- communicate with other people on WhatsApp when instructed or when appropriate within its operating rules
- understand text, voice notes, images, documents, and public URLs
- retain company knowledge over time
- use tools and multiple LLM providers for different capabilities
- read company production Postgres in read-only mode
- write its own memory, logs, tasks, and schedules into its own Postgres
- schedule future work and wake itself up through an internal scheduler
- act autonomously for low-risk work

The system should feel like a useful junior employee or intern that can operate independently, not a fragile assistant that asks for permission at every tiny step.

## 2. Core Product Philosophy

The coding and delivery philosophy is extremely important:

- MVP first
- simple and working is more important than elegant
- do not over-engineer
- one real workflow working end-to-end is better than a flexible but unfinished architecture
- clarity is better than abstraction
- boring and reliable is better than clever

The first version should be:

- single server
- single writable Postgres
- one WhatsApp channel
- one internal scheduler
- a small number of well-defined tables
- a small number of clear services

Avoid in v1 unless clearly needed:

- microservices
- event buses
- extra vector databases before Postgres search is clearly insufficient
- multi-agent systems
- complex generic orchestration frameworks

## 3. What The Bot Is

The bot is a WhatsApp-based AI employee.

Important behavioral framing:

- it should behave like a person, not a rigid robot
- it should think operationally
- it should try to solve problems first
- it should ask the right human only when needed
- it should be communication-capable, not only knowledge-capable
- it should bridge gaps between people when useful

The bot is not meant to be a passive retrieval engine.

It should:

- receive work
- understand the intent
- store important context
- act
- follow up later
- ask clarifying questions when blocked
- message relevant people when appropriate

## 4. Communication Channel

Primary communication channel:

- WhatsApp via Baileys

In v1, “call someone” means:

- start a WhatsApp conversation
- or send a message / voice note

It does not mean:

- real phone call
- real WhatsApp voice call
- real WhatsApp video call

Supported media scope for v1:

- text
- image
- document
- voice note

## 5. Capability Stack

The project uses multiple model/tool capabilities.

### 5.1 LLM Router

The project must have an independent internal LLM router so the rest of the code does not depend directly on one provider.

Reason:

- we want to change provider later without rewriting business logic
- this app will use LLM APIs extensively
- model choice should be configurable

Current router providers supported:

- `uniapi-gemini`
- `uniapi-openai`
- `openai`

Current default provider:

- `uniapi-gemini`

Current default router model:

- `gemini-3.1-flash-lite-preview`

### 5.2 Capability Split

Current intended split:

- core reasoning and structured planning:
  - use internal LLM router
- voice note transcription:
  - `gpt-4o-transcribe`
- image understanding:
  - `gpt-5.4-mini`
- web-search-enabled reasoning:
  - currently OpenAI path

This split can evolve later, but the system should keep the architecture provider-independent where practical.

## 6. Data and Memory Philosophy

This is one of the most important parts of the project.

The AI must not treat “chat history” and “memory” as the same thing.

### 6.1 Raw Chat Is Not The Brain

All raw WhatsApp communication must be stored in Postgres for audit and review.

This includes:

- inbound messages
- outbound messages
- transcripts
- media references
- analysis results
- scheduled-job-triggered messages

But raw chat log is not the working memory by itself.

Raw chat is:

- audit trail
- replay source
- debugging source
- compliance/review record

### 6.2 Structured Memory Is A Second Layer

The real “brain” is a curated layer built on top of raw data.

This structured layer should store:

- contacts
- org structure
- Human APIs
- claims
- facts
- tasks
- scheduled jobs
- decision logs
- clarification threads
- reusable question-answer cache
- onboarding assets and extracted knowledge

### 6.3 AutoContext Influence

The repository `AutoContext` was used as a conceptual reference for memory structure.

We want the spirit of AutoContext, but implemented in Postgres rather than as literal vault files.

Useful AutoContext ideas adopted:

- stable company facts
- human directory
- recurring Q&A cache
- decision history
- raw intake buffer
- health/accountability of context
- human-in-the-loop clarification

We are not copying it literally.

We are adapting it into a database-backed operational system.

## 7. Memory Categories

The system should classify information rather than treating everything as one blob.

### 7.1 Discussion

Casual conversation or exploratory talk.

Rules:

- store raw chat
- summarize only if the discussion contains reusable context
- do not automatically turn casual discussion into policy or official fact

### 7.2 Question

A request for information or explanation.

Rules:

- store the ask and response in raw history
- if the same question becomes recurrent, promote to reusable Q&A cache

### 7.3 Instruction

A clear directive to do something or change the system’s behavior.

Rules:

- only explicit directives become durable instruction by default
- not every owner message should be treated as permanent policy

Examples:

- “record this”
- “from now on”
- “remind them tomorrow”
- “treat this number as HR”

### 7.4 Information / Fact

A statement that may update company memory.

Example:

- “this number is our new HR”

Rules:

- store who said it
- store when they said it
- store confidence
- store source message
- promote into durable fact if appropriate

### 7.5 Task

A piece of work that the bot must perform, monitor, or follow up on.

Examples:

- remind branch members
- ask for report
- send follow-up
- notify someone

Tasks may create:

- immediate actions
- pending work items
- scheduled jobs

## 8. Human As API

This is a key project concept.

People in the organization should not be treated as random contacts only.

They should be modeled as `Human APIs`.

Meaning:

- each important person is a source of a certain kind of truth
- role matters because it tells the bot what kind of answer or authority that person represents

Examples:

- CEO API:
  - final company direction
  - strategic decisions
  - top-level intent
- IT Manager API:
  - bug reality
  - system operations
  - technical incident truth
- HR API:
  - staff changes
  - role assignments
  - personnel-related process

Each Human API record should ideally include:

- name
- role
- WhatsApp number
- branch
- authority level
- domain authority
- notes
- whether they are active
- preferred communication style if later needed

The point is not just hierarchy.

The point is domain-aware trust.

## 9. Conflict Handling Philosophy

Very important:

Conflicting information should not be resolved by blindly saying “higher authority wins.”

The system should think more like a person:

- different people may have different valid perspectives
- conflict may reflect partial context, not dishonesty
- the bot can create value by bridging communication

Therefore, when two trusted people disagree:

- keep both claims
- preserve provenance
- open a clarification thread
- identify the relevant Human APIs
- ask clarifying questions if needed
- help connect the right people if that resolves confusion

Goal:

- shared working truth through clarification

Not goal:

- silent overwrite
- flattening every disagreement into a power ranking

## 10. Autonomy Philosophy

The bot should be autonomous enough to be useful.

The user explicitly does not want a system that requires human involvement in every micro-step.

At the same time, the first operating phase is intentionally limited.

### 10.1 First 90 Days

The first 90-day phase should be treated like an internship period.

The bot should still be autonomous, but should not be trusted with the most sensitive work yet.

### 10.2 Autonomous In V1

Allowed by default:

- reminders
- follow-ups
- report requests
- meeting coordination
- low-risk internal nudges
- task clarification
- asking appropriate Human APIs when blocked

### 10.3 Sensitive Actions

Sensitive actions should not run fully autonomously by default in v1.

Examples:

- warnings
- disciplinary messages
- pressure/escalation wording
- HR-sensitive communication
- major company-wide statements

These should be gated unless policy later changes.

## 11. Problem-Solving Order

When the bot encounters a problem, it should follow this order:

1. think using current memory
2. use tools
3. ask the appropriate Human API

In short:

- `think -> tools -> Human API`

It should not immediately bounce every uncertainty back to the owner.

It should also avoid spamming humans too early.

## 12. Onboarding Lifecycle

The project has a clear onboarding sequence.

### 12.1 Setup Phase

Initial technical setup includes:

- install dependencies
- insert API keys
- set environment variables
- connect databases
- connect WhatsApp
- verify routing and model access

### 12.2 Full Health Test

Before real usage:

- all configured services should pass health checks
- LLM routing should work
- transcription should work
- image understanding should work
- DB access should work
- scheduler should work
- WhatsApp send/receive should work

### 12.3 Onboarding Stage

The owner will feed the system with:

- company profile
- brochure
- organization chart
- PDFs
- images
- URLs with public access

The bot should ingest them as trusted onboarding materials, with provenance.

These should help create:

- contact map
- org structure
- company facts
- Human API graph
- reusable context

### 12.4 Initiator Anchor

Important rule:

Do not hardcode “CEO first.”

The first trusted human who boots up the AI becomes the initiator anchor.

That person provides:

- first trusted identity
- first org structure
- first contact graph
- first authority map

Without this, the bot should not pretend it knows who to message.

### 12.5 Warm-Up Stage

After onboarding, the bot enters warm-up.

The warm-up purpose is:

- establish basic communication context
- introduce itself to selected people
- begin receiving low-risk work
- validate that the Human API graph is usable

This should be structured and controlled, not random outreach.

## 13. Readiness / Go-Live Rules

The bot should not be considered “ready” only because documents were loaded.

Readiness should require:

- initiator identity known
- core org chart loaded
- initial contacts loaded
- first Human APIs seeded
- basic communication rules known
- supervised intro/outreach test passed

Only after that should it begin live tasking with real people.

## 14. Scheduling and Wake-Up Model

The bot must be able to create future jobs for itself.

Example:

- message Seremban branch members
- remind them tomorrow at 9 AM
- mention 10 AM Zoom meeting

The system should use an internal scheduler backed by Postgres jobs.

Wake-up triggers in v1:

- inbound WhatsApp events
- due scheduled jobs

Not in v1 by default:

- constant autonomous background thinking
- aggressive self-initiated monitoring loops

## 15. Database Access Rules

There are two database contexts:

### 15.1 Company Production Postgres

Rules:

- full read only
- no write access
- used to inspect real business data when needed

### 15.2 Agent Database

Rules:

- full read and write
- stores all agent-owned state

This includes:

- raw message history
- memory
- facts
- claims
- tasks
- schedules
- prompt hub
- logs
- clarification threads

## 16. Prompt And Instruction Hub

The project needs a prompt and instruction hub.

Purpose:

- central system prompt
- company instructions
- behavioral policies
- role instructions
- versioning

Important:

- prompts should not be scattered randomly in business logic
- prompt content should be versionable and manageable

## 17. Architecture Summary

Target architecture:

- one single backend app
- WhatsApp gateway via Baileys
- internal orchestration layer
- internal LLM router
- Postgres-backed memory and scheduler
- OpenAI capability adapters where needed
- UniAPI-backed general reasoning path

Main subsystems:

- WhatsApp Gateway
- Agent Orchestrator
- LLM Router
- OpenAI capability service
- Company DB read-only service
- Memory/Repository layer
- Scheduler
- Admin and health HTTP endpoints

## 18. Current Implementation Status

Already built in code:

- TypeScript single-server project
- Postgres migration system
- core schema
- repository layer
- Baileys WhatsApp integration
- media capture
- PDF text extraction
- OpenAI transcription path
- OpenAI image understanding path
- OpenAI web search path
- internal scheduler
- admin endpoints
- health endpoints
- internal LLM router
- UniAPI Gemini provider
- UniAPI OpenAI-compatible provider
- OpenAI provider
- router now used for core planning and reply generation

Verified already:

- TypeScript build passes
- UniAPI Gemini direct call works
- internal LLM router test with UniAPI Gemini works

Not yet fully validated:

- real `.env` integration
- real live Postgres connection in intended deployment
- real WhatsApp session login and live message flow
- full end-to-end onboarding and reminder execution

## 19. Non-Negotiable Design Rules

These rules should survive future sessions unless explicitly changed:

- do not over-engineer
- keep MVP simple
- raw chat is audit trail, not the whole memory system
- structured memory must preserve provenance
- explicit directives are different from casual discussion
- people are modeled as Human APIs
- conflict should lead to clarification, not blind overwrite
- do not hardcode CEO-first behavior
- the first trusted initiator seeds the graph
- autonomy should be useful, not fake
- sensitive actions are gated in early phase
- the LLM layer must remain provider-independent

## 20. Immediate Next Steps

The next execution steps should be:

1. create real `.env`
2. configure database connections
3. configure UniAPI and OpenAI keys
4. run health checks
5. run local app
6. scan WhatsApp QR
7. test text flow
8. test voice note flow
9. test image flow
10. test scheduling flow
11. seed initiator and first Human APIs
12. ingest onboarding assets

## 21. Final Intent

The final intention of this project is not to create a flashy bot.

It is to create a practical, durable WhatsApp AI employee that:

- knows the company over time
- communicates well
- can operate with low-friction autonomy
- can ask the right humans when needed
- can remember what matters
- can follow up reliably
- can grow into a real operational assistant

If future implementation choices conflict with that intent, choose the path that keeps the system simpler, more reliable, and more useful in real daily operations.
