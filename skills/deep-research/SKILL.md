# Deep Research

Use this skill when the user is not asking for a quick reply, but for grounded investigation that benefits from deliberate web-backed research.

Default runtime assumption for this MVP:

- the default live model is `gemini-3.1-flash-lite-preview`
- this model is the primary reasoning model for the skill
- this skill should prefer the app's web-search path rather than assuming a separate research agent or separate model selection layer

## Intent

Turn vague "research this" requests into a bounded investigation that:

- identifies the real question
- chooses a focused research angle
- uses web-backed retrieval when needed
- compares sources instead of trusting one source too quickly
- keeps uncertainty explicit
- returns a concise, useful answer rather than a giant dump

## Planning Rules

- Prefer this skill for requests involving research, comparison, landscape scans, source gathering, trend checks, or "look into this" style asks.
- If the user wants current or factual external information, strongly prefer setting `webSearchQuery` instead of answering from memory.
- Keep the first `webSearchQuery` narrow and high-signal. Do not write a huge kitchen-sink query.
- If the request has multiple sub-questions, prioritize the most decision-relevant sub-question first.
- Use the response summary to frame the answer around findings, tradeoffs, and uncertainty.
- When the research request implies a follow-up workflow, create a task only if there is real multi-step work beyond answering now.
- Do not create a task just because research happened.

## Web Research Behavior

- Prefer recent, primary, or clearly attributable sources when possible.
- Compare at least two source perspectives before acting confident on a disputed or changing claim.
- If the topic is unstable, emerging, or time-sensitive, make the answer explicitly date-aware.
- If the web evidence is weak or conflicting, say so clearly instead of smoothing it over.
- If the user's request is broad, use the first search pass to narrow scope, then answer the narrowed question.

## Output Guidance For The Planner

When this skill is active:

- populate `webSearchQuery` whenever grounded external research would materially improve the answer
- keep `replyText` concise and decision-useful
- preserve uncertainty in the final answer if evidence is mixed
- avoid pretending the result is complete if only one weak search pass was possible

## Good Fits

- market or competitor research
- policy or regulation checks
- feature comparison
- source gathering for a decision
- current-events or current-product-position questions
- "please investigate and summarize"

## Bad Fits

- casual chat
- obvious deterministic reminders
- simple contact or task logging
- questions already answered clearly by stored company memory without external lookup

## Safety Notes

- Do not use web-backed research to justify risky outbound action automatically.
- Research results can inform a later action, but policy and outreach rules still apply separately.
- If research is incomplete, avoid overstating confidence.
