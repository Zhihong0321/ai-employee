# Milestone: WhatsApp AI Employee MVP

Date: 2026-04-02
Last Updated: 2026-04-06

## Goal

Build a simple WhatsApp-based AI employee on a single TypeScript server with:

- Baileys for WhatsApp
- Postgres for raw history, memory, tasks, jobs, prompts, and debug traces
- internal LLM router for provider-independent reasoning
- OpenAI capabilities for transcription, vision, and web search
- MVP-first architecture with low operational complexity

## Source Of Truth

Use these documents in this order:

1. [PROJECT-BLUEPRINT.md](./PROJECT-BLUEPRINT.md)
2. [MILESTONE-2026-04-02.md](./MILESTONE-2026-04-02.md)
3. [AGENTIC-AI-BUILDPLAN-V2.md](./AGENTIC-AI-BUILDPLAN-V2.md)
4. [AI-AGENTIC-CORE-BLUEPRINT.md](./AI-AGENTIC-CORE-BLUEPRINT.md)

## Completed So Far

### App and data foundation

- Node.js + TypeScript single-server repo is in place
- local Docker Postgres setup works for both agent DB and company read-only DB
- migrations, repository layer, health endpoints, and admin endpoints exist
- raw WhatsApp inbound/outbound messages are stored in Postgres
- media capture exists for voice, image, and document flows

### WhatsApp and playground

- Baileys onboarding works locally
- no-AI WhatsApp playground works for real text-message testing
- stored message threads can be inspected in the browser
- media links can be opened from stored messages

### LLM and provider layer

- provider-independent LLM router is built
- UniAPI Gemini, UniAPI OpenAI-compatible, and OpenAI providers exist
- router call logging exists with tokens, latency, error state, and estimated MYR cost
- Gemini path has already been validated locally

### Agentic Core phases completed

- Phase 1: intake stability
  - deterministic intake classification exists
  - duplicates and common WhatsApp noise are skipped before agent wake-up
  - text, transcript, and analysis are normalized into one reasoning surface
- Phase 2: identity stability
  - phone-number JIDs and LID aliases reconcile to one stable contact
  - contacts now support `whatsapp_number`, optional `whatsapp_lid`, and `autonomous_outreach`
  - contacts now also support timezone capture as an operational identity field
  - first-contact timezone defaults are auto-inferred for active country scopes:
    - Malaysia `60...` -> `Asia/Kuala_Lumpur`
    - Singapore `65...` -> `Asia/Singapore`
    - China `86...` -> `Asia/Shanghai`
  - autonomous outbound messages are blocked unless contact policy allows them
- Phase 3: prompt hot-swap foundation
  - file-first prompt packs exist under `prompts/`
  - prompt versions are synced into Postgres with manifest name, version hash, source files, and activation metadata
  - planner/reply flows now use prompt manifests instead of scattered prompt bodies
  - prompt reload and activation can happen without full redeploy
- Phase 4: structured debug layer
  - runtime debug config now lives in Postgres
  - structured debug records now persist in Postgres
  - debug hooks exist across intake, planning, tool execution, policy blocks, outbound sends, and scheduler runs
  - admin endpoints now exist for reading/updating debug config and querying debug records
- Phase 5: first durable task/runtime slice
  - tasks now persist `charter`, `snapshot`, and timezone context
  - task status now normalizes to the V2 set:
    - `TODO`
    - `IN_PROGRESS`
    - `WAITING`
    - `BLOCKED`
    - `COMPLETED`
    - `CANCELLED`
  - scheduled wake-up execution now records structured execution decisions instead of task-state `thought`
  - tool execution now runs through a central policy validator
  - scheduled jobs now carry retry, cooldown, idempotency, handoff, and timezone metadata
- Phase 6: identity-aware participation and memory browsing
  - inbound messages now explicitly distinguish PM vs group chat
  - group participation now depends on whether the agent is actually addressed by name or alias
  - non-addressed group messages now default to silence unless the system decides silent review is useful
  - agent identity is now configurable from UI and stored in Postgres system settings
  - identity includes:
    - name
    - aliases
    - role description
  - planner and reply prompts now use live identity instead of env-only startup values
  - a `memory_index` now acts as a lightweight memory directory over facts, tasks, query-cache answers, and knowledge assets
  - inbound planning now uses a scoped memory evidence pack instead of relying only on flat recent history
  - scheduled wakeups now use the same memory-browsing and identity stack as inbound messages
- Phase 7: multi-step inbound reaction classification
  - deterministic preflight now handles only duplicate/noise/protocol fast paths
  - live inbound routing now uses an LLM step-1 `ReactionDecision` before planner execution
  - the classifier now decides whether a message is:
    - `reply_now`
    - `silent_review`
    - `history_only`
    - `ignore`
  - planner execution now runs only when the classifier says the message needs reply or silent review
  - this runtime replaced the older deterministic gate-chain as the main inbound decision path
- Phase 8: authority-aware instruction safety
  - planner prompts now receive explicit sender authority context
  - localhost now exposes an Authority Policy page for setting a single source of truth number
  - runtime now blocks unauthorized sensitive authority-change instructions such as:
    - ignore this user
    - don't listen to that person
    - change trust/authority behavior
  - local bad memory created by the earlier ignore-directive loophole has been cleaned from the test database

## Current Working State

- `npm run build` passes
- targeted tests for phone normalization, prompt registry, and debug service pass
- targeted tests for task-core, execution-decision normalization, and policy-core pass
- targeted tests for participation gating and memory browsing pass
- targeted timezone inference coverage now exists for Malaysia, Singapore, and China number prefixes
- prompt metadata is included in eligible LLM router call logs
- debug mode can now be changed without redeploy through admin endpoints
- structured debug traces are available in Postgres when enabled
- a first V2 backbone now exists for durable task state, scheduler retry metadata, and tool-policy validation
- a first memory-directory layer now exists for better retrieval precision
- live agent identity can now be edited from localhost UI and affects runtime behavior immediately
- production-path forced planner bypass has been removed so live agent mode now honors real intake and participation logic
- live inbound reasoning now uses a prompt-managed reaction-classifier step before planner execution
- live inbound reasoning now also uses an authority-aware guard before memory/task writeback
- live text-message storage is proven more than voice/image flows
- local time awareness is now an explicit product requirement for future task, reminder, and scheduling work
- production deployment has not happened
- production company DB has not been connected
- OpenAI-dependent local validation is still incomplete without `OPENAI_API_KEY`
- user-reported localhost testing across multiple direct PMs and group chats now seems good overall

## Highest Priority Next

### 1. Validate the current intake, identity, participation, reaction-classifier, and memory-browsing layers with real WhatsApp traffic

- validate text, image, and voice-note storage end to end
- confirm `kind`, `media_path`, `mime_type`, and contact linkage are correct
- confirm `@lid` and phone-number JID traffic collapse into one stable contact/thread
- confirm PM vs group behavior:
  - PM to agent replies normally
  - non-addressed group messages stay silent by default
  - addressed group messages reply naturally
  - important non-addressed group updates can still be silently reviewed
- confirm identity updates from UI immediately affect mention detection and prompt behavior
- confirm the new `ReactionDecision` step behaves well for:
  - casual PM greetings
  - group ambient chat
  - group-wide requests
  - fact/instruction updates that should be silently reviewed
  - multilingual or mixed-language group traffic
- confirm authority-sensitive instructions now fail closed unless the sender is authorized
- confirm prod-like admin protection is in place before allowing identity edits from UI
- enable debug mode during these runs so failures leave structured traces in Postgres

### 2. Validate the memory writeback and retrieval path

- validate that facts, tasks, query-cache answers, and knowledge assets are indexed into `memory_index`
- confirm inbound planning receives relevant scoped evidence from the memory browser
- confirm scheduled wakeups receive the same quality of context as inbound messages
- confirm outbound group replies preserve correct group metadata so later retrieval and thread inspection stay accurate
- confirm the classifier-plus-planner split improves task execution precision rather than just reply suppression
- confirm the authority layer prevents unauthorized org-truth changes without blocking legitimate owner instructions once the single source of truth is configured
- then extend into:
  - better ranking
  - rolling summaries
  - deeper memory consolidation

### 3. Resume AI reply-loop validation on top of the stabilized message layer

- text in -> plan -> reply out
- voice note in -> transcript -> reply
- image in -> analysis -> reply
- reminder request in -> scheduled follow-up -> later execution
- confirm the new persisted task/scheduler timezone context stays aligned with prompt-level time context
- expand this into human-clarification behavior so the agent asks trusted humans instead of guessing internal acronyms or unknown people

### 4. Finish end-to-end local time awareness

- use stored contact timezone in prompt context
- ensure reminder and deadline reasoning uses that resolved timezone
- validate that scheduled jobs preserve the same interpreted timezone through later wake-up execution
- keep persisted execution times UTC-backed while preserving the local-time interpretation path

## Useful Operator Surfaces

- `GET /health`
- `GET /health/full`
- `GET /admin/prompts`
- `POST /admin/prompts/reload`
- `POST /admin/prompts/activate`
- `GET /admin/debug/config`
- `PUT /admin/debug/config`
- `GET /admin/debug/records`
- `GET /admin/jobs`
- `GET /playground/agent-identity`
- `GET /api/playground/agent-identity`
- `PUT /api/playground/agent-identity`

## Recommended Next-Session Prompt

Use this milestone file as context and continue from the current MVP state.

Priority:

- keep working from the existing local environment and WhatsApp playground state
- validate real WhatsApp text/image/voice traffic against the current intake, identity, participation, reaction-classifier, and debug layers
- inspect debug records for any weak points that show up during live validation
- validate the new memory browser and memory-index writeback under real conversation load
- improve the new reaction-classifier prompts and human-clarification behavior rather than adding more brittle hardcoded gates
- validate that prod-like admin auth is present for identity editing before any public rollout
- validate the durable task/runtime slice through real follow-up and retry scenarios
- then continue memory and human-authority layering with local-time awareness treated as mandatory, not optional
