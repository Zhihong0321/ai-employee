# Implementation Status

Date: 2026-04-02
Last Updated: 2026-04-06

Purpose:

- give new AI sessions a fast, durable picture of actual implementation progress
- separate current execution reality from long-lived architecture documents
- record what is done, what is next, and what is blocked

This file is the repo-level progress ledger.

Read this after:

1. `PROJECT-BLUEPRINT.md`
2. `AGENTIC-AI-BUILDPLAN-V2.md`
3. `PARALLEL-DEVELOPMENT-STRATEGY.md`
4. `MINI-CORE-IMPLEMENTATION-MAP.md`

## 1. Current Delivery Posture

Current build phase:

- baseline live WhatsApp playtest validated; reaction-classifier runtime now validated through PM and multi-group traffic
- local-time awareness is now a hard product requirement for task, reminder, and scheduler work
- identity-aware group participation and scoped memory retrieval are now part of the live runtime path
- pre-prod hardening has aligned inbound, outbound, and scheduled reasoning with the same participation, identity, and memory-browsing stack
- inbound message handling now uses a multi-step reasoning path:
  - deterministic preflight for duplicate/noise/protocol skips
  - LLM step-1 reaction classification
  - planner only when reply-now or silent-review is required

Mini-core posture:

- Phase 2 Decision Gate Core is good enough for first MVP launch work
- the current simple live agent loop is now good enough to use as the baseline
- further gate/playtest rewiring should stay paused unless a real tester failure is discovered

Current recommended next implementation slice:

- preserve the current simple live loop:
  - one connected AI WhatsApp number
  - inbound text visible in localhost
  - PM vs group participation decided before reply
  - task, decision, debug, and memory traces visible in localhost
- validate the new memory/identity layer on top of that baseline:
  - agent identity configured from UI and stored in system settings
  - group-chat addressing based on agent name and aliases
  - scoped memory browsing before planning
  - scheduled wakeups using the same identity + memory stack as inbound messages
  - wider non-text capability validation when keys/config are ready

Why this slice is next:

- the simple real-world tester loop now works well enough to serve as a baseline
- the next highest-value work is no longer transport/playground access
- the biggest current value now comes from validating precision, not from adding another raw storage path
- the new memory browser and identity system need staged live validation before production rollout

## 2. What Already Exists

Based on the current repo and architecture docs, the project already has:

- TypeScript single-server backend
- Postgres migration system and core schema
- repository layer
- Baileys WhatsApp integration
- contact-book timezone inference for first-seen Malaysia, Singapore, and China numbers
- media capture
- PDF text extraction
- OpenAI transcription path
- OpenAI image understanding path
- OpenAI web search path
- internal scheduler
- admin endpoints
- agent identity settings UI and persistence
- health endpoints
- internal LLM router
- UniAPI Gemini provider
- UniAPI OpenAI-compatible provider
- OpenAI provider
- router used for core planning and reply generation

Already verified:

- TypeScript build passes
- UniAPI Gemini direct call works
- internal LLM router test with UniAPI Gemini works
- local `.env` loads successfully for app boot
- local agent DB and company DB are reachable
- migrations apply during app startup
- backend boots locally with WhatsApp disabled for baseline validation
- `GET /health` returns `ok` with baseline config
- `GET /health/full` returns degraded only because `OPENAI_API_KEY` is not set
- local HTTP Gemini playground request succeeds through the routed `uniapi-gemini` path
- contact timezone inference resolves:
  - `60...` -> `Asia/Kuala_Lumpur`
  - `65...` -> `Asia/Singapore`
  - `86...` -> `Asia/Shanghai`
- compact runtime `TimeContext` injection now exists for planner, reply, and scheduled-wakeup prompts
- live WhatsApp session is connected locally through Baileys
- inbound WhatsApp messages appear in the localhost thread dashboard again
- tester live mode now routes inbound text into the AI path instead of swallowing simple chat as history-only
- localhost thread view shows transcript plus task, decision-log, and debug-trace context for the active conversation
- current simple baseline is acceptable for:
  - store info
  - read info
  - reply chat
  - log task
- first durable task/runtime slice now exists:
  - tasks persist charter, snapshot, and timezone context
  - wake-up execution records structured decisions instead of task-state `THOUGHT`
  - tool execution now runs through a central policy validator
  - scheduled jobs now carry retry/idempotency/timezone metadata
- live runtime now distinguishes:
  - PM vs group chat
  - addressed vs non-addressed group messages
  - reply-now vs silent-review behavior
- live runtime now classifies inbound reactions through an explicit `ReactionDecision` contract:
  - `reply_now`
  - `silent_review`
  - `history_only`
  - `ignore`
- live runtime now applies an authority-aware guard before persisting planner side effects for sensitive authority-change requests
- live reasoning now receives a scoped memory evidence pack built from:
  - memory index entries
  - active tasks
  - recent messages
  - recent facts
- agent identity now includes:
  - name
  - aliases
  - role description
  - live UI editing through localhost settings
- outbound replies now retain correct PM vs group metadata in stored message history
- live agent mode now honors the real participation gate instead of bypassing it through a force-planner shortcut
- localhost identity updates now require explicit admin auth
- multi-group and direct-PM localhost testing now appears good from real operator playtests
- localhost authority policy settings now exist for configuring a single source of truth number for sensitive authority changes

Not yet fully validated:

- broader autonomous execution beyond the simple live reply/task/log loop
- end-to-end live behavior of UTC plus resolved contact-local time across real reminder/scheduler flows
- OpenAI-backed transcription, vision, and web-search paths with a real API key
- full end-to-end onboarding and reminder execution
- full live validation of the new group participation behavior against longer-running real group traffic
- full live validation of memory-index writeback and retrieval quality under longer-running threads
- full staging validation that inbound and scheduled task flows stay behaviorally consistent under the shared memory and identity stack
- multilingual reaction-classifier quality for Chinese and mixed-language group traffic

## 3. Phase Status

Phase 1: Channel Intake Core

- Status: substantially complete
- Completed so far:
  - added shared Baileys message normalization helpers for wrapped inbound payloads
  - intake now unwraps ephemeral, view-once, document-with-caption, edited, and device-sent wrappers before kind/text/mime detection
  - deterministic intake classification now sees wrapped protocol messages correctly
  - WhatsApp gateway now short-circuits same-process duplicate external ids before media download/transcription/image analysis
  - fast store-only protocol/noise checks now run before expensive media enrichment
  - gateway preflight logic is now extracted into a testable helper with duplicate-cache coverage
  - sender key distribution messages are now treated as deterministic protocol responses
- Acceptance target:
  - text, voice, image, and document inbound messages converge to one normalized event shape
  - duplicate inbound events do not double-trigger downstream reasoning

Phase 2: Decision Gate Core

- Status: upgraded from deterministic gate chain to step-1 LLM reaction classification; good enough for broader MVP validation
- Completed so far:
  - added local inbound gate result types in `src/agent/gate/inbound-message-gate.ts`
  - `src/services/whatsapp-intake-service.ts` now resolves explicit gate actions after classification
  - history-only vs planner-required paths now log through a distinct gate step
  - focused gate result tests added without changing shared contracts
  - service-level gate tests now cover duplicate skip, planner-unavailable, and downstream handoff paths
  - gate dispatch is now explicit at runtime via `history_only`, `planner_handoff`, and `planner_unavailable` paths
  - classification escalation is now explicit at runtime via deterministic-history-only vs LLM-classification-required paths
  - gate results now expose intent-level context so unsupported `reply_only` behavior is explicit instead of implied
  - knowledge-query paths now record deterministic-reply fallback reasons in logs and tests without widening runtime behavior
  - deterministic intake now keeps obvious casual chat off the classifier path
  - deterministic intake now promotes obvious knowledge questions and task requests without classifier help
  - structured WhatsApp button/list replies now stay on deterministic protocol-response paths
  - obvious correction and contradiction phrasing now stays on a deterministic clarification-review path
  - short low-signal acknowledgements now stay deterministic without collapsing plain `yes/no` into protocol handling
  - obvious fact-update statements now stay on a deterministic fact-review path without waking the classifier
  - behavior-changing instruction cues now stay on a deterministic instruction-review path without waking the classifier
  - contact shell creation and contact upsert now auto-fill timezone defaults for supported WhatsApp prefixes
  - old inbound gate-chain routing has now been replaced in the live intake path by `ReactionClassifier`
  - inbound intake now uses:
    - deterministic preflight for protocol/noise skips
    - sender/profile/recent-context preparation
    - LLM step-1 reaction classification
    - planner handoff only for `reply_now` and `silent_review`
  - downstream planning now receives `reactionDecision` as explicit message context
  - focused intake tests now validate the new reaction-classifier runtime path
- Depends on: stable intake normalization

Phase 3: Task Core

- Status: first bounded slice completed
- Completed so far:
  - tasks now persist V2-style `charter` and `snapshot` JSON state alongside normalized status
  - task creation paths now write initial charter/snapshot records instead of thin rows only
  - reminder and wake-up paths now update task snapshot and append richer task events
- Depends on: decision gate contract clarity

Phase 4: Execution Core

- Status: first bounded slice completed
- Completed so far:
  - runner execution decisions now normalize into structured fields:
    - classification
    - goal
    - actions
    - reply proposal
    - memory updates
    - clarification need
    - risk level
    - task status
  - scheduled wake-up execution now records `EXECUTION_DECISION` task events instead of persisting raw task-state `THOUGHT`
  - action-schema contract now supports structured decision fields while staying backward-compatible with older `thought + actions` output

Phase 5: Policy Core

- Status: first bounded slice completed
- Completed so far:
  - added central tool policy validation before tool execution
  - tool policy now enforces required args, task existence checks, task-status normalization, outbound outreach permission, and ISO time validation for wake-ups
  - policy outcomes now explicitly distinguish allow, allow-with-note, deny, and handoff-required paths

Phase 6: Scheduler Core

- Status: first bounded slice completed
- Completed so far:
  - scheduled jobs now carry retry-limit, cooldown, idempotency-key, last-result-summary, handoff-required, and timezone-context metadata
  - due-job claiming now skips cooldown-delayed jobs
  - failed jobs now retry before final handoff-required failure
  - scheduler now appends task events for job completion and failure

Phase 7: Memory Core

- Status: first bounded slice completed; deeper consolidation still pending
- Completed so far:
  - added `memory_index` as a lightweight memory directory over durable memory and archived knowledge
  - added `MemoryBrowserService` so inbound planning retrieves scoped memory evidence instead of relying only on flat recent history
  - planner flow now receives `memoryEvidence` alongside `recentContext`
  - media-derived knowledge assets now write back into the memory index
  - facts, tasks, and timeless query-cache entries now write back into the memory index
  - scheduled wakeups now use the same memory browser path as inbound reasoning

Phase 7A: Participation and Identity Layer

- Status: first bounded slice completed
- Completed so far:
  - inbound messages now carry explicit `isGroupChat`
  - added agent participation gate for PM vs group behavior
  - added direct-address detection based on agent name and aliases
  - non-addressed group messages now default to history-only unless silent review is justified
  - added persisted agent identity service backed by `system_settings`
  - added localhost UI and API for editing name, aliases, and role description
  - planner and reply prompts now use live agent identity instead of env-only defaults
  - production-path forced planner bypass removed so live agent mode now honors participation gating
  - outbound replies now persist correct group metadata for later retrieval and thread inspection
  - identity writes now require admin auth on the localhost operator surface
  - real PM and group-chat testing indicates the current identity-aware participation behavior is working well enough for the next iteration

Phase 7B: Reaction Classification Layer

- Status: first bounded slice completed and playtested locally
- Completed so far:
  - added `ReactionDecision` as the explicit step-1 inbound reaction contract
  - added prompt-managed `reaction-classifier` LLM call before planner execution
  - direct PM, group silent-review, group history-only, and planner-unavailable routing now flow through the same reaction-classification step
  - planner execution now runs only after the classifier marks a message as `reply_now` or `silent_review`
  - real localhost playtests across multiple PM and group-chat messages now appear good from the operator report

Phase 7C: Authority and Organizational Truth Layer

- Status: first bounded slice completed and locally verified
- Completed so far:
  - added persisted authority-policy settings backed by `system_settings`
  - added localhost UI/API for configuring a single source of truth number
  - planner prompts now receive explicit authority context for the sender
  - runtime now blocks unauthorized sensitive authority-change instructions such as:
    - ignore this person
    - don't listen to that user
    - change trust/authority behavior
  - local stale bad facts from the previously accepted ignore-directive were removed from the test database

Phase 8: Prompt Ops Core

- Status: bounded hardening slice completed
- Completed so far:
  - prompt registry now rejects duplicate `promptKey` values across manifests
  - prompt manifest loading now reports malformed JSON and missing referenced files with clearer manifest context
  - focused prompt registry tests cover duplicate prompt keys and missing files

Phase 9: Debug and Trace Core

- Status: bounded hardening slice completed
- Completed so far:
  - `DebugService` now exposes a testable `shouldLog` helper
  - debug stage labels now have a small human-readable formatting helper
  - focused debug tests now cover task/tool overrides plus stage-label behavior

Phase 10: End-to-End Validation

- Status: baseline live WhatsApp text playtest validated; deeper agentic-layer validation still pending

## 4. Completed Under This Tracking System

- Added repo-level progress tracking via `IMPLEMENTATION-STATUS.md`
- Added parallel coordination board via `PARALLEL-TASK-BOARD.md`
- Updated startup instructions so new sessions read architecture plus current progress before acting
- Completed first Channel Intake Core slice:
  - shared Baileys wrapper normalization added in `src/agent/intake/baileys-message.ts`
  - `src/services/whatsapp-service.ts` now uses the shared normalization helpers
  - `src/agent/intake.ts` now classifies wrapped protocol messages correctly
  - targeted intake normalization test coverage added
- Completed second Channel Intake Core slice:
  - `src/services/whatsapp-service.ts` now uses a cheap preflight message before optional media enrichment
  - same-process duplicate message ids skip redundant media download and AI enrichment work
  - fast store-only protocol/noise checks now short-circuit enrichment before intake handoff
  - intake fast-path coverage extended in `src/agent/intake/baileys-message.test.ts`
- Completed third Channel Intake Core slice:
  - extracted gateway preflight logic into `src/agent/intake/preflight.ts`
  - added focused duplicate-cache and gateway fast-path coverage in `src/agent/intake/preflight.test.ts`
  - added deterministic store-only handling for `senderKeyDistributionMessage`
- Started first Decision Gate Core slice:
  - added explicit local gate resolution in `src/agent/gate/inbound-message-gate.ts`
  - updated `src/services/whatsapp-intake-service.ts` to separate classification from gate action
  - added gate tests for history-only and planner-required routing
- Completed second Decision Gate Core slice:
  - added service-level tests for duplicate intake skip, planner-unavailable handling, and downstream handoff normalization
- Completed third Decision Gate Core slice:
  - added explicit runtime dispatch resolution in `src/agent/gate/inbound-gate-dispatch.ts`
  - updated `src/services/whatsapp-intake-service.ts` to log planner handoff vs planner unavailable as separate paths
  - added focused dispatch tests in `src/agent/gate/inbound-gate-dispatch.test.ts`
- Completed fourth Decision Gate Core slice:
  - added explicit classification-path resolution in `src/agent/gate/inbound-classification-path.ts`
  - updated `src/services/whatsapp-intake-service.ts` to log deterministic vs LLM classification escalation paths
  - added focused classification-path tests plus service coverage for deterministic history-only behavior
- Completed fifth Decision Gate Core slice:
  - extended `src/agent/gate/inbound-message-gate.ts` with gate intent and planner-requirement context
  - extended `src/agent/gate/inbound-gate-dispatch.ts` to expose runtime fallback metadata for unsupported deterministic paths
  - updated `src/services/whatsapp-intake-service.ts` decision logs so reply-only candidates clearly record planner fallback
  - added focused gate and service coverage for `KNOWLEDGE_QUERY` fallback while deterministic reply handling remains unsupported
- Completed sixth Decision Gate Core slice:
  - extended `src/agent/intake.ts` with bounded deterministic heuristics for obvious `CASUAL_CHAT`, `KNOWLEDGE_QUERY`, and `TASK_ACTION` messages
  - expanded `src/agent/intake/baileys-message.test.ts` coverage for deterministic casual-chat, question, and task detection
  - expanded `src/services/whatsapp-intake-service.test.ts` coverage to confirm deterministic actionable messages skip classifier escalation
- Completed seventh Decision Gate Core slice:
  - extended `src/agent/intake.ts` fast store-only checks so structured WhatsApp response payloads resolve to deterministic `PROTOCOL_RESPONSE`
  - expanded `src/agent/intake/baileys-message.test.ts` coverage for button and list response protocol handling
  - expanded `src/services/whatsapp-intake-service.test.ts` coverage to confirm structured response messages skip classifier and downstream planner handoff
- Completed eighth Decision Gate Core slice:
  - extended `src/agent/intake.ts` with bounded clarification-cue heuristics for obvious corrections and contradictions
  - updated `src/agent/gate/inbound-classification-path.ts` so clarification cues stay deterministic and skip classifier escalation
  - updated gate and dispatch helpers to expose explicit `clarification_review` intent and planner fallback metadata
  - expanded intake, gate, and service coverage for clarification-style inbound messages
- Completed ninth Decision Gate Core slice:
  - extended `src/agent/intake.ts` with bounded short-acknowledgement heuristics for low-signal confirmations such as `done`, `sent`, and `on it`
  - preserved plain free-text `yes`/`no` outside deterministic protocol handling so potentially meaningful binary replies still escalate
  - expanded intake and service coverage for acknowledgement-vs-protocol-response boundaries
- Completed tenth Decision Gate Core slice:
  - extended `src/agent/intake.ts` with bounded fact-update cue heuristics for statements such as `this number is...`, `remember that...`, and `is our new...`
  - updated gate classification and dispatch helpers so fact-update cues stay deterministic and reach planner handoff with explicit `fact_update_review` intent
  - expanded intake, gate, and service coverage for fact-update-style inbound messages
- Completed eleventh Decision Gate Core slice:
  - extended `src/agent/intake.ts` with bounded instruction-policy cue heuristics for directives such as `from now on...` and `treat ... as ...`
  - updated gate classification and dispatch helpers so instruction-policy cues stay deterministic and reach planner handoff with explicit `instruction_review` intent
  - expanded intake, gate, and service coverage for instruction-style inbound messages
- Completed first Prompt Ops Core worker slice via Codex MCP:
  - hardened `src/prompts/prompt-registry.ts` validation and manifest error reporting
  - expanded `src/prompts/prompt-registry.test.ts` coverage for duplicate keys and missing files
- Completed first Debug and Trace Core worker slice via Codex MCP:
  - added `shouldLog` and `formatDebugStageLabel` helpers in `src/debug/debug-service.ts`
  - expanded `src/debug/debug-service.test.ts` coverage for task/tool overrides and stage labels
- Completed first MVP launch-readiness slice:
  - verified local `.env` coverage and confirmed UniAPI key plus both DB URLs are present
  - confirmed Docker Postgres was healthy and local migrations run cleanly on startup
  - ran `npm run healthcheck` successfully
  - ran `npm run build` successfully
  - corrected local baseline config by setting `ENABLE_WHATSAPP=false` before first-run boot validation
  - booted the backend locally and confirmed `GET /health` plus `GET /health/full`
  - confirmed routed Gemini HTTP playground smoke test works through the live app
- Completed local no-WhatsApp Agent Lab slice:
  - added a browser page at `/playground/agent-lab` for local instruction testing
  - added a local simulation path that runs planner/reply logic without any WhatsApp side effects
  - local runs now persist inbound/outbound transcript records, task creation, task events, decision logs, and forced debug records for inspection
  - verified the live Agent Lab endpoint creates a reply draft, task record, decision log, and debug trace from a local instruction
- Completed baseline live WhatsApp tester loop slice:
  - connected one live AI WhatsApp account locally through Baileys and verified healthy runtime boot
  - restored localhost thread visibility for inbound WhatsApp messages after tester-playtest regressions
  - updated live intake behavior so simple inbound text in tester mode goes through the AI path instead of being stored as history-only
  - confirmed localhost now exposes the connected AI number plus thread-level messages, tasks, decision logs, and debug trace
  - user-validated the current simple baseline as acceptable for storing info, reading info, replying in chat, and logging tasks
- Completed first local-time-awareness identity slice:
  - added contact timezone storage via `src/database/migrations/011_contact_timezone.sql`
  - added timezone inference helper in `src/lib/timezone.ts`
  - contact creation and contact upsert now auto-assign timezone defaults for `60`, `65`, and `86` prefixes
  - contact listing and recent-context queries now expose timezone and timezone source
  - added focused inference coverage in `src/lib/timezone.test.ts`
- Completed second local-time-awareness runtime slice:
  - added compact `TimeContext` builder in `src/lib/time-context.ts`
  - planner, reply, and scheduled-wakeup prompt calls now inject UTC plus resolved contact-local time without changing prompt-file hot-swap behavior
  - time-sensitive query-cache writes now skip relative-time questions to avoid stale cached answers
  - added focused coverage in `src/lib/time-context.test.ts`
- Completed first durable task/runtime slice:
  - added `src/database/migrations/012_task_runtime_v2.sql` to extend tasks with charter/snapshot/timezone state and scheduled jobs with retry/idempotency/timezone metadata
  - added `src/agent/task-core.ts` for V2 task status normalization plus charter/snapshot builders
  - added `src/agent/execution-decision.ts` to normalize runner output into structured decisions
  - added `src/agent/policy-core.ts` for central tool policy validation
  - updated `src/agent/executor.ts` so every tool call passes through policy validation before execution
  - updated `src/agent/runner.ts` so scheduled wakeups persist structured execution decisions instead of task-state `THOUGHT`
  - updated `src/services/agent-service.ts` so planner-backed task creation writes V2 charter/snapshot/timezone state
  - updated `src/services/scheduler-service.ts` so retries and scheduler task events are recorded consistently
  - added focused unit coverage for task core, execution-decision normalization, and policy validation
- Completed first memory-browsing and identity slice:
  - added `src/database/migrations/013_memory_index.sql`
  - added `src/services/memory-browser-service.ts` and focused test coverage
  - wired inbound planning to browse scoped memory before reasoning
  - wired scheduled wakeups to use the same memory browser and live identity as inbound messages
  - added `src/services/agent-identity-service.ts`
  - added localhost identity settings UI at `/playground/agent-identity`
  - updated group participation logic so name/alias mentions act like direct addressing
  - removed the live agent-mode forced planner shortcut that previously bypassed participation gating
  - corrected outbound reply persistence so group replies retain correct `isGroupChat` state
  - tightened localhost identity updates so `PUT /api/playground/agent-identity` now requires admin authorization
- Completed first reaction-classifier slice:
  - added `src/agent/reaction-classifier.ts`
  - added prompt-managed reaction-classifier manifest, system prompt, and output contract
  - rewired `src/services/whatsapp-intake-service.ts` so the old gate chain no longer drives the live inbound runtime
  - updated `src/services/agent-service.ts` so planner context receives `reactionDecision`
  - replaced intake-service tests with focused coverage for deterministic preflight plus classifier-driven `reply_now`, `silent_review`, and `history_only` behavior
- Completed first authority-policy slice:
  - added `src/services/authority-policy-service.ts`
  - added `src/lib/authority-guard.ts` plus focused coverage
  - updated `src/services/openai-service.ts` and `src/services/agent-service.ts` so authority-sensitive instructions receive both prompt-level authority context and runtime guard enforcement
  - added localhost authority-policy operator page and API

## 5. Active Work

- Lead session has completed baseline live WhatsApp tester validation
- No active worker session is currently running
- The next session should treat additional Agentic Core layering as the default follow-up, not another baseline playtest rewrite

## 6. Blockers And Risks

Current blockers:

- no code-level boot blocker is currently recorded for the baseline runtime path
- deterministic `reply_only` is still not safe in the current runtime because direct replies remain planner-backed
- end-to-end reminder/task persistence still needs deeper validation to confirm time context is carried cleanly through later execution
- full capability health remains degraded until `OPENAI_API_KEY` is provided
- production deployment should not proceed unless `ADMIN_API_TOKEN` is configured, because identity writes are now intentionally admin-protected
- production rollout should wait for a staging pass that verifies:
  - PM reply behavior
  - addressed vs non-addressed group behavior
  - silent-review behavior for fact/instruction updates
  - scheduled wakeup behavior with memory evidence
- the new reaction classifier improves flexibility, but its prompt quality now matters more than deterministic English-only heuristics
- authority levels and single-source-of-truth settings still need proper operator setup, otherwise sensitive authority changes will fail closed

Current risks:

- future sessions may drift if this file is not updated after each completed slice
- high-risk mini-cores should not start without explicit contract and file-scope assignment
- duplicate media optimization is strongest within the current process; cross-process duplicate cost reduction would need a broader persistence-aware check
- parallel worker use is safe only for bounded mini-cores with explicit ownership recorded first
- changing the now-working simple tester loop too aggressively could reintroduce regressions in visibility or live replies
- task and reminder behavior can still misread `today` / `tomorrow` style requests until the new persisted timezone context is validated through real reminder and wake-up scenarios
- memory index quality currently depends on writeback heuristics; there is not yet a summary/consolidation layer for long-running threads
- the system now stores and retrieves more context, but retrieval ranking is still lexical and scope-based, not embedding-based
- the runtime path is more coherent now, but still multi-step enough that staging should exercise PM, group, mention, and scheduled follow-up paths together before prod
- multilingual and human-clarification behavior still need more live coverage before production confidence is high
- broader org-chart workflows still need richer modeling than a single source-of-truth number plus contact authority fields

## 7. Contract Changes Logged

- `contacts` now includes `timezone` and `timezone_source`
- `ContactRecord` now supports `timezone` and `timezoneSource`
- contact-book identity logic now treats timezone as a first-class operational field
- `tasks` now includes `charter`, `snapshot`, `timezone`, and `timezone_source`
- task status normalization now maps legacy lower-case values onto the V2 status set
- `scheduled_jobs` now includes retry-limit, cooldown, idempotency-key, handoff-required, last-result-summary, and timezone-context metadata
- `InboundMessage` now includes:
  - `isGroupChat`
  - optional addressed/response participation fields used by runtime gating
- `InboundMessage` now also carries optional `reactionDecision`
- `ReactionDecision` now exists as the explicit inbound step-1 routing contract
- `authority_policy` now exists in `system_settings` for single-source-of-truth handling
- `system_settings` now stores durable `agent_identity`
- `memory_index` now exists as a directory layer over durable memory and archived knowledge

Use this section to record any completed change to:

- shared TypeScript contracts
- DB schema
- task status model
- scheduler job model
- prompt manifest structure

## 8. Recommended Next Step

Build the next Agentic Core layer on top of the validated simple loop:

- Milestone: simple live WhatsApp AI loop is acceptable; preserve it while expanding capability
- Role: lead session
- Owned files:
  - agent/task/policy/memory layer files needed for the next bounded slice
  - localhost operator surfaces if they are needed to observe the new layer
  - coordination docs
- Next slice:
  - keep the current simple live WhatsApp response loop stable
  - choose one next bounded agentic layer only
- prioritize staging validation of the new identity + participation + memory-browsing runtime
- continue improving the new reaction-classifier prompts and human-clarification behavior instead of adding more hardcoded phrase gates
- confirm admin-protected identity editing works correctly in the prod-like environment
- validate the durable task/runtime slice through real task creation, wake-up, and retry scenarios
  - extend memory handling toward:
    - rolling summaries
    - better memory-map quality
    - richer retrieval precision
  - validate new behavior through localhost thread inspection plus tester WhatsApp messages
- Forbidden default behavior:
  - do not destabilize the currently working simple live loop without a concrete blocker
- Contract assumption:
  - the repo now has a usable simple live baseline and first-layer timezone capture, so the next priority is time-aware execution layering

## 9. Session Update Rule

When a session completes a meaningful slice, update this file with:

- the phase touched
- the completed slice
- any contract changes
- any blockers discovered
- the next recommended step
- the new `Last Updated` date

Do not turn this file into a full diary.
Keep it short, current, and operational.

If this file and `PARALLEL-TASK-BOARD.md` show that one lead session plus bounded worker slices are safe:

- tell the user that safe parallel development is available
- if the user has permitted it, use Codex MCP worker sessions to accelerate the safe slices
- record the worker-owned files before starting them
