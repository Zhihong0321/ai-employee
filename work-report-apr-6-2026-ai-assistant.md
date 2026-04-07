DATE  : Apr 6, 2026
REPO NAME : AI-Assistant

- Added Baileys group metadata debug endpoints and refreshed project tracking docs for the new AI identity, participation, and memory workflow.
- Added live ability-boundary reasoning so the WhatsApp agent clearly rejects unsupported app-environment tasks, asks humans for internal ambiguity, and now receives group audience context in planning.
- Replaced the old inbound gate chain with a new step-1 LLM reaction-classifier workflow so PM/group handling now routes through reply-now, silent-review, or history-only decisions before planner execution.
- Updated the core architecture docs so the build plan and reasoning blueprint now reflect the live reaction-classifier runtime, Human API clarification priority, and group participation as a reasoning problem instead of a regex problem.
- Added an authority-aware safety layer with a localhost single-source-of-truth setting, blocked unauthorized “ignore this person” instructions at runtime, and cleaned the stale bad facts created by the earlier loophole from the local test database.

=====================
