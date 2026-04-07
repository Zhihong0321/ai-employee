# AI Session Startup Instructions

Date: 2026-04-02

This is the first file a new AI coding session should read for this project.

If you are a new session, stop here and follow this file in order.

## 1. Mission

You are not here to redesign the product from scratch.

This project already has:

- a stable product vision
- a V2 architecture direction
- a parallel development coordination model

Your job is to work within that system unless explicitly told otherwise by the user.

## 2. Required Reading Order

Read these files in this exact order before proposing or implementing anything:

1. `PROJECT-BLUEPRINT.md`
2. `AGENTIC-AI-BUILDPLAN-V2.md`
3. `PARALLEL-DEVELOPMENT-STRATEGY.md`
4. `MINI-CORE-IMPLEMENTATION-MAP.md`
5. `IMPLEMENTATION-STATUS.md`
6. `PARALLEL-TASK-BOARD.md`

If the user asked you to read this file first, you should still continue by reading the files above in order.

Important:

- the first four files define product vision, architecture, and ownership rules
- `IMPLEMENTATION-STATUS.md` defines the latest durable execution progress
- `PARALLEL-TASK-BOARD.md` defines current live coordination state

Do not assume architecture docs alone tell you the latest progress.

## 3. Non-Negotiable Understanding

You must preserve these truths:

- the product is a WhatsApp AI employee
- this is not a generic agent framework project
- raw chat is audit trail, not the whole memory system
- structured memory must preserve provenance
- people are modeled as Human APIs
- conflicts should create clarification, not silent overwrite
- the build uses internal mini-cores, not microservices
- v1 stays as one codebase, one runtime, one Postgres

## 4. Before You Code

Before making changes, identify:

- which mini-core this task belongs to
- whether you are the lead session or a worker session
- which files you are allowed to edit
- which files are outside your scope

If those are not clear, do not start coding yet.

## 5. Stop Condition Rule

Mini-core development is not an endless loop.

If a mini-core is already good enough for current MVP needs, stop refining it.

Do not keep polishing one mini-core just because more improvements are possible.

If the repo has not yet completed first-run MVP validation, default to launch progress over further internal refinement.

Examples of “stop refining and move on”:

- the current mini-core already has working code plus focused tests
- the next proposed work is optimization rather than a blocker
- the next proposed work does not unlock first launch
- the app has not yet been run end-to-end in its intended environment

## 6. MVP-First Rule

Before the first real MVP run, priority order is:

1. make the app boot
2. make dependencies connect
3. run health checks
4. run the backend
5. connect WhatsApp
6. verify one real inbound/outbound flow
7. only then resume deeper mini-core optimization

If there is tension between:

- more mini-core polish
- first MVP launch / first real run

choose first MVP launch.

## 7. Lead Session vs Worker Session

### If you are the lead session

You may:

- define task boundaries
- define contracts
- review cross-core changes
- integrate worker branches

You should be careful about taking on large isolated implementation tasks at the same time.

### If you are a worker session

You must:

- stay inside assigned mini-core scope
- avoid changing shared contracts unless explicitly assigned
- avoid editing unrelated files
- escalate overlap instead of silently broadening scope

## 8. File Scope Rule

Never assume the whole repo is your write scope.

Use `MINI-CORE-IMPLEMENTATION-MAP.md` to determine:

- owned files
- shared files
- forbidden files

If the needed edit crosses into forbidden/shared high-risk files, pause and tell the user.

## 9. Contract Change Rule

Treat these as contract-affecting changes:

- shared TypeScript types used across mini-cores
- DB schema changes
- task state model changes
- scheduler job state changes
- prompt manifest structure changes

If your task requires one of these and you were not explicitly assigned contract work, stop and escalate.

## 10. Build Method Rule

This project intentionally borrows methods from proven repos.

Use these default references:

- `nanobot`:
  - channel/runtime simplicity
  - execution loop split
  - WhatsApp and channel handling patterns
- `gloamy`:
  - task persistence
  - scheduler hardening
  - policy rigor
  - observability discipline
- `fastclaw`:
  - operator ergonomics
  - hot-reload mentality
  - product shell thinking

Do not copy code blindly.
Adapt the method to this repo’s product.

## 11. What You Must Not Do

Do not:

- redesign the product into a generic AI framework
- introduce microservices for v1
- introduce a vector DB by default
- replace product-specific memory with generic chat memory
- persist chain-of-thought as trusted system state
- silently widen your task beyond assigned mini-core
- refactor unrelated files “while you are there”
- keep optimizing internal architecture when the MVP has never been run once
- treat “there are still more possible refinements” as a reason to stay in the same mini-core forever

## 12. What You Should Default To

Default to:

- small bounded changes
- clear contracts
- preserving product semantics
- simple deployability on Railway
- Postgres-backed state
- deterministic gates before LLM where appropriate
- halting mini-core refinement once it is sufficient for current MVP progress
- shifting to launch-readiness work as soon as refinement stops unlocking first run

## 13. If The User Gives You A New Task

When a new task arrives, do this:

1. identify the mini-core
2. identify whether it is safe for worker scope
3. read only the relevant files for that mini-core
4. avoid unrelated exploration
5. implement only the assigned slice

## 14. If The Task Is Too Broad

If the user asks for something too broad, you should narrow it into:

- one mini-core
- one contract
- one file scope

Example:

Bad:

- “improve the whole agent”

Better:

- “implement normalized inbound event shape in Channel Intake Core”

## 15. If Multiple AI Sessions Are Running

Assume other sessions may be editing different parts of the repo.

Therefore:

- do not revert changes you did not create
- do not claim ownership of shared files casually
- do not make surprise contract changes
- state your write scope clearly

## 16. Launch Bias Before First MVP Run

If the system has not yet completed a real first-run MVP validation, do not default to another internal mini-core hardening slice.

Instead default to:

- env/config audit
- database connection
- migrations
- health checks
- app boot
- WhatsApp auth/session
- first inbound/outbound smoke test

Only return to mini-core refinement after those have been attempted or explicitly deprioritized by the user.

## 17. Default Safe First Work

If the user wants to start parallel implementation and no other assignment is given, the safest first mini-cores are:

1. Channel Intake Core
2. Prompt Ops Core
3. Debug and Trace Core

When `IMPLEMENTATION-STATUS.md` and `PARALLEL-TASK-BOARD.md` together show that one mini-core is stable enough and worker scopes are clearly bounded:

- explicitly tell the user that parallel development is now safe for those assigned slices
- if the user has permitted parallel worker execution, prefer using Codex MCP worker sessions to speed up development
- keep one lead session responsible for integration and contract discipline
- do not launch workers for high-risk overlapping cores unless the task board records exact ownership first

## 18. Output Behavior

When you begin a task, explicitly state:

- your assigned mini-core
- your assumed file scope
- any contract assumptions

Keep that statement short and concrete.

## 19. Final Rule

If there is any conflict between:

- user request
- product vision
- V2 architecture
- mini-core ownership

then preserve the product vision and ask for clarification before making architecture-breaking changes.

If there is any conflict between:

- more mini-core refinement
- first MVP launch / first real run

then prefer first MVP launch unless the user explicitly asked for more refinement.
