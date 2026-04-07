# Parallel Development Strategy

Date: 2026-04-02

Purpose:

- define how parallel development works for this project
- support multiple Codex sessions and multiple AI coding IDE sessions
- keep the architecture coherent while speeding up implementation

This document is about execution coordination.
It does not replace product or architecture documents.

Primary upstream docs:

- `PROJECT-BLUEPRINT.md`
- `AGENTIC-AI-BUILDPLAN-V2.md`
- `MINI-CORE-IMPLEMENTATION-MAP.md`
- `AI-SESSION-STARTUP-INSTRUCTIONS.md`

## 1. Core Rule

Parallel development is allowed only when work is split by internal mini-core ownership.

We do not parallelize vague goals.

Good parallel work:

- one mini-core
- one bounded write scope
- one known contract
- one clear owner

Bad parallel work:

- broad architecture changes
- shared schema redesign by multiple sessions at once
- multiple sessions editing the same runtime flow without coordination

## 2. Deployment Rule

The project remains:

- one codebase
- one product
- one deployable runtime for v1
- one Postgres state backbone

Mini-cores are internal architecture boundaries only.

They are not:

- microservices
- separate databases
- separate products

## 3. Team Shape For Parallel Sessions

When multiple AI sessions are active, use this model:

### 3.1 Lead Session

Exactly one session should act as the lead session.

The lead session owns:

- architecture consistency
- contract changes
- integration decisions
- merge order
- final review of worker changes

The lead session should avoid large isolated implementation tasks while acting as lead.

### 3.2 Worker Sessions

Each worker session owns one mini-core or one tightly bounded sub-slice.

A worker session should:

- stay inside assigned files and contracts
- avoid editing shared contracts unless explicitly assigned
- report contract pressure rather than silently changing shared assumptions

## 4. Git Strategy

Use git worktrees for parallel development.

Reason:

- one repo
- multiple branches
- multiple folders
- multiple IDE sessions
- less branch switching pain
- cleaner ownership per task

### 4.1 Branch Naming

Default branch prefix:

- `codex/`

Suggested pattern:

- `codex/intake-core`
- `codex/task-core`
- `codex/policy-core`
- `codex/prompt-ops`
- `codex/debug-trace`

### 4.2 Worktree Naming

Suggested worktree naming:

- main workspace:
  - lead / review / integration
- worktree 1:
  - `wt-intake-core`
- worktree 2:
  - `wt-task-core`
- worktree 3:
  - `wt-policy-scheduler`

Names can vary, but they should clearly map to mini-core ownership.

## 5. Parallelization Rule

A mini-core may be worked in parallel only if all of the following are true:

1. its owned files are known
2. its public contract is known
3. its DB tables touched are known
4. merge order is known
5. overlapping files are minimal or explicitly assigned

If any of those are unclear, parallel development for that slice should pause.

## 6. Merge Rules

### 6.1 Lead-Reviewed Merge Only

Worker branches should not be merged blindly.

The lead session must review:

- contract compliance
- file ownership compliance
- schema overlap
- prompt/system behavior overlap

### 6.2 Merge Small, Merge Often

Prefer:

- small, bounded merges

Avoid:

- giant parallel branches that drift for too long

### 6.3 Contract Changes Are Special

If a worker branch changes:

- shared types
- DB schema used by other mini-cores
- prompt manifest structure
- task status model
- scheduler job state model

that branch must be treated as a contract-affecting branch and reviewed first by the lead session.

## 7. File Ownership Rule

Every parallel task must name:

- owned files
- allowed shared files
- forbidden files

If a worker needs to edit a forbidden file, they should stop and escalate to the lead session.

## 8. Schema Change Rule

Database changes are the highest-risk parallel surface.

Rules:

- only one session should own schema-heavy work at a time unless changes are fully disjoint
- schema changes must be documented before implementation
- shared table shape changes require lead review before merge

## 9. Safe First Parallel Targets

These are the best first candidates for parallel work:

- Channel Intake Core
- Prompt Ops Core
- Debug and Trace Core

Reason:

- clearer boundaries
- lower overlap
- lower risk of architecture drift

## 10. Medium-Risk Parallel Targets

- Identity Core
- Memory Core

These can run in parallel only after contracts are made explicit.

## 11. High-Risk Parallel Targets

- Task Core
- Execution Core
- Policy Core
- Scheduler Core

These are tightly coupled.

They may still run in parallel, but only if:

- contracts are already locked
- ownership is precise
- one lead session actively integrates

## 12. Required Inputs Before Any Worker Starts

Before a worker session starts coding, it must know:

- assigned mini-core
- owned files
- forbidden files
- allowed contract edits or no-contract-edits rule
- expected output
- branch/worktree name

If those are missing, the worker should not start coding.

## 13. Communication Protocol Between Sessions

If using multiple AI sessions:

- the lead session defines the task
- worker sessions implement only assigned scope
- worker sessions report pressure or blockers
- lead session resolves overlap and integrates

Important:

- worker sessions should not silently broaden scope

## 14. Definition Of A Good Parallel Task

A good parallel task has:

- one mini-core
- one bounded file set
- one clear acceptance target
- minimal schema overlap
- minimal prompt overlap

Examples:

- normalize WhatsApp inbound media into one intake shape
- add prompt manifest loader and version hash support
- add debug trace storage and admin toggles

## 15. Definition Of A Bad Parallel Task

A bad parallel task looks like:

- “improve agent”
- “work on memory”
- “make architecture better”
- “refactor everything around tasks”

These are too wide and will cause merge collisions.

## 16. Default Merge Order

Unless a task explicitly says otherwise, use this merge order:

1. Prompt Ops Core
2. Channel Intake Core
3. Debug and Trace Core
4. Identity Core
5. Task Core
6. Execution Core
7. Policy Core
8. Scheduler Core
9. Memory Core integration passes
10. End-to-end integration

This is not absolute, but it is the default safe order.

## 17. Non-Negotiable Parallel Safety Rules

- no worker edits outside assigned mini-core without escalation
- no silent contract changes
- no broad schema changes without lead review
- no giant long-lived drift branches
- no microservice splitting during v1
- no replacing product-specific concepts with generic agent abstractions

## 18. Final Intent

Parallel development is meant to increase speed without reducing architectural coherence.

If parallel work creates confusion, overlap, or integration instability, reduce concurrency and return to lead-guided sequential integration.
