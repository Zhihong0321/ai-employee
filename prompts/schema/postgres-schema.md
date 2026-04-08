# SDMO Descriptive Schema
## Agent Memory Map — Postgres Reference

> **Version:** 1.1  
> **Status:** Active  
> **Purpose:** This document is the agent's index of its own long-term memory. Every table the agent can query is described here: what it stores, what each column means, and how to write correct queries. Read this before forming any database query.

---

## How to Use This Document

You are an AI agent with access to a read-only Postgres database via the `query_database` tool.

**The mental model:**
- This document is your **table of contents**. It tells you *what exists* and *where to find it*.
- The database is your **long-term brain**. It holds everything that would overflow a prompt.
- You do **not** need to remember facts across sessions — you query for them when needed.

**Rules:**
1. Always `SELECT` only the columns you need. Never `SELECT *`.
2. Every query has a hard 50-row limit enforced by the database role. For aggregates (COUNT, SUM), this is not a concern.
3. Only `SELECT` is permitted. Any mutating statement will be rejected.
4. Use `ORDER BY created_at DESC` or `occurred_at DESC` unless you need chronological order.
5. When in doubt about what exists, query `memory_index` first — it is the surfaced summary layer.

---

## Memory Classification

Tables are organized into **seven memory categories**:

| Category | Tables | Prompt Tier | Description |
|---|---|---|---|
| **IDENTITY** | `contacts`, `system_settings` | Tier 1 (always hot) | Who people are, agent config |
| **KNOWLEDGE** | `facts`, `memory_index`, `knowledge_assets`, `claims` | Tier 1 / MCP on demand | What the agent knows |
| **WORK** | `tasks`, `task_events`, `scheduled_jobs` | Tier 2 (working memory) | What the agent is doing |
| **CONVERSATION** | `messages` | Tier 2 (recent slice only) | What was said |
| **FEEDBACK** | `memory_index` (typed), `facts` (tier 1), `task_events` (typed) | Tier 1 (promoted immediately) | Mistakes made, user corrections, angry feedback |
| **OPERATIONAL** | `llm_call_logs`, `debug_records`, `decision_logs`, `query_cache`, `clarification_threads` | MCP on demand / archive | How the agent is performing |
| **AGENT CONFIG** | `prompt_hub_versions`, `skill_hub_versions` | MCP on demand | What prompts and skills are active |

---

## Consolidated Enum Reference

Use these exact string values in queries. Casing matters.

### tasks.status
```
'TODO'        → Created, not yet started
'IN_PROGRESS' → Agent is actively working
'WAITING'     → Awaiting external response
'BLOCKED'     → Cannot proceed, needs human
'COMPLETED'   → Done
'CANCELLED'   → Abandoned
```

### task_events.event_type
```
'TASK_CREATED'        → Initial creation record
'STATUS_CHANGE'       → Status transition
'ACTION_TAKEN'        → Agent executed a tool
'MESSAGE_SENT'        → Agent sent a WhatsApp message
'MESSAGE_RECEIVED'    → Inbound message linked to task
'EXECUTION_DECISION'  → Agent reasoning snapshot
'CLARIFICATION_ASKED' → Agent asked for clarification
'TASK_SUMMARY'        → OPTIMIZER-GENERATED distillation (SDMO key event)
'USER_CORRECTION'     → Human explicitly corrected the agent (FEEDBACK)
'TOOL_RESULT'         → Result of a tool execution
'ERROR'               → Something went wrong
```

### messages.direction / messages.kind
```
direction: 'inbound' | 'outbound'
kind:      'text' | 'image' | 'audio' | 'document' | 'video' | 'unknown'
```

### memory_index.memory_type (canonical values)
```
'contact_insight'   → Something learned about a specific person
'task_outcome'      → How a task concluded
'policy_rule'       → A standing rule or behavioral constraint
'event_summary'     → A distilled record of events
'knowledge_asset'   → Reference to an ingested document/asset
'mistake_pattern'   → An error the agent made (FEEDBACK category)
'user_correction'   → A human explicitly corrected the agent (FEEDBACK category)
'negative_feedback' → User expressed dissatisfaction (FEEDBACK category)
```

### memory_index.scope_type → scope_id format
```
'global'  → scope_id = NULL      (applies everywhere)
'contact' → scope_id = whatsapp_number (e.g. "60123456789")
'task'    → scope_id = task id as TEXT (e.g. "42")
'domain'  → scope_id = domain string (e.g. "invoicing")
```

### facts.status
```
'working'    → Tentative, still being validated
'confirmed'  → Verified and trusted
'deprecated' → No longer true, do not use
'conflicted' → Contradicted by another fact, needs resolution
```

### scheduled_jobs.status
```
'pending'   → Waiting to run
'running'   → Scheduler is currently processing
'completed' → Successfully executed
'failed'    → Exhausted retries
'cancelled' → Intentionally stopped
```

### clarification_threads.status
```
'open'      → Awaiting answer
'resolved'  → Answer received
'abandoned' → No longer relevant
```

---

## Index Reference (Query Performance)

Only write queries that can use these indexes. Full table scans on large tables will be slow or time out.

| Table | Indexed Columns | Fast Query Pattern |
|---|---|---|
| `contacts` | `whatsapp_number` (unique), `whatsapp_lid` | `WHERE whatsapp_number = $1` |
| `messages` | `(contact_number, occurred_at DESC)`, `(sender_number, occurred_at DESC)`, `external_id` | `WHERE contact_number = $1 ORDER BY occurred_at DESC` |
| `tasks` | `(target_number, status)`, `(requested_by, status)` | Filter by number + status together |
| `task_events` | `(task_id, created_at DESC)` | Always filter by `task_id` first |
| `scheduled_jobs` | `(status, run_at)`, `idempotency_key` | `WHERE status = 'pending' AND run_at <= NOW()` |
| `debug_records` | `task_id`, `run_id`, `stage`, `message_external_id`, `created_at` | Filter by `task_id` or `run_id` |
| `memory_index` | `(scope_type, scope_id, updated_at DESC)`, `memory_type` | Always include `scope_type` in filter |
| `llm_call_logs` | `created_at DESC`, `(provider_name, model, created_at)` | Filter by `created_at` range |
| `facts` | `fact_key` (unique), `(subject, status)` | `WHERE fact_key = $1` or `WHERE subject = $1` |
| `prompt_hub_versions` | `(prompt_key, version_hash)` | `WHERE prompt_key = $1 AND is_active = TRUE` |
| `skill_hub_versions` | `(skill_id, version_hash)` | `WHERE skill_id = $1 AND is_active = TRUE` |

**WARNING:** Do NOT write these — they are full table scans:
```sql
-- SLOW: text search on messages without contact filter
WHERE text_content ILIKE '%keyword%'   ← only use with LIMIT and contact filter

-- SLOW: task_events without task_id
WHERE event_type = 'TASK_SUMMARY'      ← always add AND task_id = $1

-- SLOW: memory_index without scope
WHERE memory_type = 'user_correction'  ← add AND scope_type = 'contact'
```

---

## CATEGORY: IDENTITY

### TABLE: contacts

**Purpose:** The authoritative registry of every person or system the agent has ever communicated with. This is the agent's address book and behavioral rulebook combined. Before taking any action involving a person, check their contact record.

**Prompt Tier:** Tier 1 — the sender's own contact record is always injected.

```
COLUMNS:
  id                  → Internal primary key. Use whatsapp_number for lookups.
  whatsapp_number     → Primary human identifier. Used to link to tasks, messages, facts.
                        Format: international number string (e.g. "60123456789").
  whatsapp_lid        → Alternative WhatsApp LID identifier (some accounts use this).
                        May be NULL. Index exists for fast lookup.
  name                → Display name as known to the agent.
  role                → Job title or organizational role (e.g. "Sales Manager").
  branch              → Office or geographic branch (e.g. "KL HQ", "Penang").
  department          → Department within organization.
  authority_level     → Integer. Higher = more authority. Used for policy decisions.
                        NULL means authority not established.
  domains             → TEXT[]. Array of topic domains this person operates in.
                        (e.g. ["sales", "invoicing"])
  relation_type       → Nature of relationship (e.g. "client", "staff", "vendor").
  is_human_api        → TRUE if this is a real human. FALSE for automated systems.
  is_internal         → TRUE if this person is inside the organization.
  is_active           → FALSE = do not contact. Always check before sending messages.
  autonomous_outreach → TRUE = agent may initiate contact without being prompted.
                        FALSE = agent must only reply, never initiate.
  about_person        → Free-text notes about this person's personality, preferences,
                        communication style, or important context.
  notes               → General operational notes (distinct from about_person).
  timezone            → IANA timezone string (e.g. "Asia/Kuala_Lumpur"). NULL if unknown.
  timezone_source     → How timezone was determined ("manual", "inferred", etc.).
  source              → How this contact was created (e.g. "whatsapp_sync", "manual").
  created_at          → When this contact was first registered.
  updated_at          → Last modification timestamp.
```

**Common Queries:**
```sql
-- Look up a specific person
SELECT name, role, authority_level, about_person, autonomous_outreach, is_active
FROM contacts WHERE whatsapp_number = $1;

-- Find all active internal staff
SELECT name, role, department, whatsapp_number
FROM contacts WHERE is_internal = TRUE AND is_active = TRUE ORDER BY name;

-- Find contacts in a domain
SELECT name, whatsapp_number FROM contacts
WHERE $1 = ANY(domains) AND is_active = TRUE;
```

---

### TABLE: system_settings

**Purpose:** Agent-wide configuration and runtime settings. Key-value store for global tunable values. Not user-specific.

**Prompt Tier:** MCP on demand — rarely needed but authoritative when required.

```
COLUMNS:
  key         → Setting identifier (e.g. "agent_mode", "sdmo_token_threshold").
  value_json  → JSONB. The setting's value. Cast appropriately after retrieval.
  updated_at  → Last modified.
```

**Common Queries:**
```sql
-- Read a specific setting
SELECT value_json FROM system_settings WHERE key = 'agent_mode';

-- List all settings
SELECT key, value_json, updated_at FROM system_settings ORDER BY key;
```

---

## CATEGORY: KNOWLEDGE

### TABLE: facts

**Purpose:** Distilled, structured knowledge the agent has established about the world. Facts are the agent's long-term memory — curated, deduplicated truths extracted from conversations, observations, and optimizer runs. This is different from raw claims (unvalidated observations) — facts have been confirmed or promoted.

**Prompt Tier:**
- `memory_tier = 1` → Always injected into prompt (behavioral rules, permanent policies)
- `memory_tier = 2` → Working memory, injected when relevant
- `memory_tier = 3` → Archived. Never auto-injected. Query via MCP only.

**SDMO Note:** After `014_sdmo_schema.sql` migration, `memory_tier` column exists. Before that, all facts are implicitly tier 2.

```
COLUMNS:
  id                    → Primary key.
  fact_key              → UNIQUE slug identifying this fact. Prevents duplicates.
                          Format: "{subject}:{predicate}" (e.g. "peter:language")
  subject               → Who or what this fact is about (person, system, concept).
  predicate             → What aspect is described (e.g. "language", "working_hours").
  value                 → The fact itself (e.g. "only speaks Mandarin").
  status                → Lifecycle: 'working' | 'confirmed' | 'deprecated' | 'conflicted'
  confidence            → 0.000–1.000. How reliable this fact is.
  memory_tier           → 1=always hot | 2=working memory | 3=archive (post-migration).
  source_claim_id       → FK to claims table if this fact was promoted from a claim.
  source_contact_number → Which contact this fact originated from.
  metadata              → JSONB. Additional context, optimizer notes, etc.
  created_at            → When first established.
  updated_at            → Last updated (important for recency assessment).
```

**Common Queries:**
```sql
-- Get all Tier 1 (always-hot) facts
SELECT subject, predicate, value FROM facts
WHERE memory_tier = 1 AND status != 'deprecated' ORDER BY subject;

-- Get behavioral rules for a specific person
SELECT predicate, value, confidence FROM facts
WHERE subject = $1 AND status != 'deprecated' ORDER BY confidence DESC;

-- Find recently updated facts
SELECT subject, predicate, value, updated_at FROM facts
WHERE updated_at >= NOW() - INTERVAL '7 days' ORDER BY updated_at DESC;

-- Check if a fact exists
SELECT id, value, status FROM facts WHERE fact_key = $1;
```

---

### TABLE: memory_index

**Purpose:** A surfaced summary layer over all agent memory. Each entry is a lightweight, queryable pointer to a piece of important information — with tags, entities, and scoring to enable relevance-based retrieval. Think of it as the agent's "search index" over its own knowledge.

**Prompt Tier:** Tier 2 — keyword-matched hits are injected. Full table queryable via MCP.

```
COLUMNS:
  id               → Primary key.
  memory_key       → UNIQUE identifier for this memory entry.
  memory_type      → Category of memory: 'contact_insight' | 'task_outcome' | 
                     'policy_rule' | 'event_summary' | 'knowledge_asset' | etc.
  scope_type       → Scope of relevance: 'global' | 'contact' | 'task' | 'domain'
  scope_id         → ID of the scoping entity (contact number, task ID, etc.).
                     NULL for global scope.
  title            → Short human-readable label for this memory.
  summary          → The actual content — what is known. This is the payload.
  source_table     → Which table the underlying data came from.
  source_ref       → Primary key or identifier from source_table.
  tags             → TEXT[]. Topic/keyword tags for retrieval.
  entities         → TEXT[]. Named entities (people, places, systems) referenced.
  importance_score → 0.000–1.000. How important/critical this memory is.
  freshness_score  → 0.000–1.000. How recently validated (decays over time).
  confidence       → 0.000–1.000. How reliable.
  last_used_at     → When this was last retrieved/used in a prompt.
  created_at       → When indexed.
  updated_at       → Last update.
```

**Common Queries:**
```sql
-- Find memories about a specific person
SELECT title, summary, memory_type, importance_score FROM memory_index
WHERE scope_type = 'contact' AND scope_id = $1
ORDER BY importance_score DESC, updated_at DESC LIMIT 20;

-- Find memories by tag
SELECT title, summary, source_table, source_ref FROM memory_index
WHERE $1 = ANY(tags) ORDER BY importance_score DESC LIMIT 20;

-- Find memories mentioning an entity
SELECT title, summary, memory_type FROM memory_index
WHERE $1 = ANY(entities) ORDER BY freshness_score DESC LIMIT 20;

-- Find globally important memories
SELECT title, summary, memory_type FROM memory_index
WHERE scope_type = 'global' AND importance_score > 0.7
ORDER BY importance_score DESC LIMIT 20;
```

---

### TABLE: knowledge_assets

**Purpose:** Stores rich content the agent has ingested — documents, summaries, uploaded files, reference material. Different from `facts` (which are atomic structured claims) — knowledge_assets hold longer-form content.

**Prompt Tier:** MCP on demand only.

```
COLUMNS:
  id           → Primary key.
  source_type  → Where it came from: 'upload' | 'url' | 'manual' | 'extract'.
  source_ref   → URL, filename, or reference identifier.
  title        → Human-readable name.
  mime_type    → Content type (e.g. "text/plain", "application/pdf").
  text_content → Extracted text content. May be long.
  summary      → Agent-generated summary of this asset. Query this first.
  metadata     → JSONB. Additional context.
  created_by   → Contact number or system that added this.
  created_at   → When ingested.
```

**Common Queries:**
```sql
-- Find assets by keyword in title or summary
SELECT id, title, summary, source_type FROM knowledge_assets
WHERE title ILIKE '%' || $1 || '%' OR summary ILIKE '%' || $1 || '%'
ORDER BY created_at DESC LIMIT 10;

-- Get a specific asset's content
SELECT title, text_content, summary FROM knowledge_assets WHERE id = $1;
```

---

### TABLE: claims

**Purpose:** Raw, unvalidated observations — what someone said or what was inferred, before promotion to a `fact`. Claims may be contradictory, uncertain, or superseded. Facts are the validated subset.

**Prompt Tier:** MCP on demand only. Use `facts` for decisions; use `claims` for audit or conflict investigation.

```
COLUMNS:
  id                          → Primary key.
  subject                     → Entity the claim is about.
  predicate                   → What aspect is claimed.
  value                       → The asserted value.
  status                      → 'pending' | 'accepted' | 'rejected' | 'superseded'
  confidence                  → 0.000–1.000.
  source_message_external_id  → Which message this claim came from.
  source_contact_number       → Who made the claim.
  metadata                    → JSONB. Additional context.
  created_at                  → When observed.
```

**Common Queries:**
```sql
-- Find pending claims awaiting validation
SELECT subject, predicate, value, confidence FROM claims
WHERE status = 'pending' ORDER BY confidence DESC LIMIT 20;

-- Find all claims for a subject
SELECT predicate, value, status, confidence FROM claims
WHERE subject = $1 ORDER BY created_at DESC;
```

---

## CATEGORY: WORK

### TABLE: tasks

**Purpose:** The primary work record. Every objective the agent owns — past, present, and future — lives here. This is the agent's to-do list and job history combined. Each task tracks its own intent (charter) and current reasoning state (snapshot).

**Prompt Tier:** Tier 2 — active tasks injected as snapshots. Completed tasks via MCP only.

```
COLUMNS:
  id                          → Primary key. Reference throughout task_events, scheduled_jobs.
  title                       → Short label (e.g. "Follow up with client Peter on invoice").
  details                     → Original task description as given by requester.
  status                      → See Enum Reference above for all valid values.
  requested_by                → WhatsApp number of who gave the instruction.
  target_number               → WhatsApp number of who the task is ABOUT/directed at.
                                (may differ from requested_by — e.g. boss asks agent
                                 to contact a client; boss=requested_by, client=target_number)
  due_at                      → Deadline. NULL if no deadline set.
  charter                     → JSONB. Original intent. READ to understand why task was created.
  snapshot                    → JSONB. Latest AI reasoning state. READ THIS FIRST before
                                querying task_events — it may already contain the answer.
  timezone                    → Timezone context for this task (from contact).
  timezone_source             → How timezone was determined.
  source_message_external_id  → The message that originally triggered this task.
  metadata                    → JSONB. Runtime flags, SDMO markers (last_optimized_at).
  created_at                  → When task was created.
  updated_at                  → Last state change.
  completed_at                → NULL if still active. Timestamp if done.
```

**JSONB Field Schemas:**
```
tasks.charter (JSONB):
  {
    originalIntent:            string   → The original instruction verbatim
    requesterNumber:           string   → Who asked (whatsapp_number)
    targetNumber:              string   → Who the task is about (whatsapp_number)
    constraints:               object   → Any conditions or limits set at creation
    sourceMessageExternalId:   string   → External ID of the triggering message
  }

tasks.snapshot (JSONB):
  {
    status:              string   → Current task status (mirrors tasks.status)
    currentSummary:      string   → Agent's latest narrative of where things stand
    nextStep:            string   → What the agent plans to do next
    waitingFor:          string   → What the agent is waiting on (when WAITING)
    blocker:             string   → What is blocking progress (when BLOCKED)
    latestKnownContext:  object   → Freeform context dict from last execution
  }

tasks.metadata (JSONB — SDMO fields added post-migration):
  {
    last_optimized_at:       ISO timestamp  → When optimizer last ran on this task
    sdmo_optimization_count: number         → How many times optimizer has run
  }
```

**Status Flow:**
```
TODO → IN_PROGRESS → WAITING → IN_PROGRESS (loop until resolved)
                  ↘ BLOCKED  → (human intervention) → IN_PROGRESS
                  ↘ COMPLETED
                  ↘ CANCELLED
```

**Common Queries:**
```sql
-- Get all active tasks for a person (SDMO default — excludes COMPLETED/CANCELLED)
SELECT id, title, status, snapshot, due_at FROM tasks
WHERE (target_number = $1 OR requested_by = $1)
  AND status NOT IN ('COMPLETED', 'CANCELLED')
ORDER BY updated_at DESC;

-- Get recently completed tasks for a person
SELECT id, title, completed_at, snapshot->>'currentSummary' AS outcome FROM tasks
WHERE target_number = $1 AND status = 'COMPLETED'
  AND completed_at >= NOW() - INTERVAL '30 days'
ORDER BY completed_at DESC;

-- Count task outcomes for reporting
SELECT status, COUNT(*) FROM tasks
WHERE requested_by = $1 GROUP BY status;

-- Find overdue tasks
SELECT id, title, due_at, target_number FROM tasks
WHERE status NOT IN ('COMPLETED', 'CANCELLED')
  AND due_at < NOW()
ORDER BY due_at ASC;

-- Get a task's current reasoning state (before reading event log)
SELECT snapshot FROM tasks WHERE id = $1;
```

---

### TABLE: task_events

**Purpose:** The full chronological log of everything that has happened on a task — every decision, message sent, tool call, status change, and optimizer-generated summary. This is the task's audit trail and memory.

**Prompt Tier:** Tier 2 — recent slice (TASK_SUMMARY + last 15 events) injected. Full log via MCP.

**CRITICAL RULE — TASK_SUMMARY First:**
> Before reading raw event history, check if a `TASK_SUMMARY` event exists. If it does, it is the optimizer's distillation of all prior events. Start there, then read only events created *after* it. The raw events before a TASK_SUMMARY are archived and represent already-digested history.

```
COLUMNS:
  id          → Primary key.
  task_id     → FK to tasks.id. Always filter by this.
  event_type  → What kind of event this is:
                 TASK_CREATED        = initial task creation record
                 STATUS_CHANGE       = task status transitioned
                 ACTION_TAKEN        = agent executed a tool/action
                 MESSAGE_SENT        = agent sent a WhatsApp message
                 MESSAGE_RECEIVED    = inbound message linked to this task
                 EXECUTION_DECISION  = agent reasoning snapshot
                 CLARIFICATION_ASKED = agent asked for clarification
                 TASK_SUMMARY        = OPTIMIZER-GENERATED summary of prior events
                                       (SDMO key event — all events before this are archived)
                 TOOL_RESULT         = result of a tool execution
                 ERROR               = something went wrong
  content     → JSONB. Event payload. Varies by event_type:
                 TASK_SUMMARY:       { summary, keyDecisions, factsExtracted, optimizedAt }
                 EXECUTION_DECISION: { reasoningSummary, classification, goal, actionCount }
                 MESSAGE_SENT:       { to, message, channel }
                 ACTION_TAKEN:       { toolName, parameters, result }
  is_archived → BOOLEAN. TRUE = this event was digested by the optimizer.
                An archived event should NOT be re-read without intent.
  created_at  → When this event occurred.
```

**Common Queries:**
```sql
-- SDMO-aware: get TASK_SUMMARY + all events after it
SELECT event_type, content, created_at FROM task_events
WHERE task_id = $1
  AND (
    event_type = 'TASK_SUMMARY'
    OR created_at > (
      SELECT COALESCE(MAX(created_at), '1970-01-01')
      FROM task_events
      WHERE task_id = $1 AND event_type = 'TASK_SUMMARY'
    )
  )
ORDER BY created_at ASC;

-- Get the most recent optimizer summary for a task
SELECT content, created_at FROM task_events
WHERE task_id = $1 AND event_type = 'TASK_SUMMARY'
ORDER BY created_at DESC LIMIT 1;

-- Get recent timeline (last 20 events, non-archived)
SELECT event_type, content, created_at FROM task_events
WHERE task_id = $1 AND is_archived = FALSE
ORDER BY created_at DESC LIMIT 20;

-- Count events per type for a task
SELECT event_type, COUNT(*) FROM task_events
WHERE task_id = $1 GROUP BY event_type ORDER BY COUNT(*) DESC;
```

---

### TABLE: scheduled_jobs

**Purpose:** The agent's scheduler queue. Every future action the agent has committed to — follow-up messages, reminders, retries — lives here as a job. The scheduler worker polls this table and fires the agent's wakeup handler.

**Prompt Tier:** MCP on demand — agent rarely needs to query this directly, but it's useful for understanding what is already planned.

```
COLUMNS:
  id                  → Primary key.
  job_type            → Category: 'send_message' | 'wakeup_task' | 'retry' | etc.
  run_at              → When this job fires. Scheduler picks up WHERE run_at <= NOW().
  status              → See Enum Reference above.
  payload             → JSONB. Job parameters (structure varies by job_type — see below).
  attempts            → How many times tried.
  retry_limit         → Max attempts before marking failed (default: 3).
  last_error          → Error from most recent failure. NULL if successful.
  source_task_id      → FK to tasks.id. Which task spawned this job.
  created_by          → Contact number or system that created this job.
  locked_at           → Set by scheduler when processing (prevents double execution).
  executed_at         → When successfully executed.
  cooldown_until      → Don't retry before this time (backoff).
  handoff_required    → TRUE = human must review before job can complete.
  idempotency_key     → Unique constraint — prevents duplicate jobs.
  last_result_summary → Summary of what happened when executed.
  timezone_context    → JSONB. Timezone info for time-sensitive jobs.
  created_at          → When scheduled.
  updated_at          → Last state change.
```

**JSONB Field Schemas:**
```
scheduled_jobs.payload (JSONB — varies by job_type):
  job_type = 'send_message':
    { targetNumber: string, message: string, channel: "whatsapp" }

  job_type = 'wakeup_task':
    { taskId: number, reason: string }

  job_type = 'retry':
    { originalJobId: number, toolName: string, parameters: object }

scheduled_jobs.timezone_context (JSONB):
  { timezone: string, timezoneSource: string }
```

**Common Queries:**
```sql
-- What is planned for a task?
SELECT job_type, run_at, status, payload FROM scheduled_jobs
WHERE source_task_id = $1 AND status = 'pending'
ORDER BY run_at ASC;

-- What is overdue / backlogged?
SELECT id, job_type, run_at, attempts FROM scheduled_jobs
WHERE status = 'pending' AND run_at < NOW()
ORDER BY run_at ASC LIMIT 20;

-- Jobs scheduled for a person
SELECT job_type, run_at, status FROM scheduled_jobs
WHERE (payload->>'targetNumber' = $1 OR created_by = $1)
  AND status = 'pending'
ORDER BY run_at ASC;
```

---

## CATEGORY: CONVERSATION

### TABLE: messages

**Purpose:** The raw message log — every inbound and outbound WhatsApp message. The agent's conversational memory. Recent messages are pre-loaded into working memory; historical messages are available via MCP query.

**Prompt Tier:** Tier 2 — last 10 messages from the sender are pre-loaded. Older history via MCP.

**⚠ GROUP CHAT WARNING:** In group chats, `sender_number` is the **group's** ID, not the person's. Always use `contact_number` or `author_number` to identify the actual human who sent the message. Using `sender_number` alone in group chat contexts will return wrong results.

```
COLUMNS:
  id             → Primary key.
  external_id    → WhatsApp message ID (unique per message). Use for deduplication.
  chat_id        → WhatsApp chat identifier. Group ID for group chats, number for 1:1.
  sender_number  → The chat sender ID. For 1:1: the person's number. For groups: the group ID.
                   ⚠ Do NOT rely on this alone for person lookups in group contexts.
  contact_number → NORMALIZED contact number. Always the actual person's number,
                   even in group chats. USE THIS for contact-based filtering.
  contact_id     → FK to contacts.id. Fastest join path to contact record.
  author_number  → The actual message author's number (relevant in group chats).
  author_name    → Display name of the message author.
  sender_name    → Display name at time of send (may differ from contacts.name).
  is_from_me     → TRUE if sent by the agent (outbound). Redundant with direction='outbound'
                   but faster for filtering agent-sent messages.
  direction      → 'inbound' (received) | 'outbound' (sent by agent).
  kind           → Message type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'unknown'
  text_content   → Extracted text. For audio: transcription. For images: description/OCR.
  transcript     → Raw voice-to-text transcript (audio messages only).
  analysis       → Agent's analysis of this message (if performed).
  media_path     → Local file path to stored media (if applicable).
  mime_type      → Media content type (e.g. "audio/ogg", "image/jpeg").
  raw_payload    → JSONB. Complete raw WhatsApp webhook payload. Full detail.
  occurred_at    → When the message was actually sent/received (not DB insertion time).
  created_at     → When inserted into the database.
```

**Common Queries:**
```sql
-- Get conversation history with a person (works for both 1:1 and group chats)
SELECT direction, kind, text_content, author_name, occurred_at FROM messages
WHERE contact_number = $1
ORDER BY occurred_at DESC LIMIT 20;

-- Find most recent inbound message from a person
SELECT text_content, occurred_at, kind FROM messages
WHERE contact_number = $1 AND direction = 'inbound'
ORDER BY occurred_at DESC LIMIT 1;

-- Get all messages agent sent to a person
SELECT text_content, occurred_at FROM messages
WHERE contact_number = $1 AND is_from_me = TRUE
ORDER BY occurred_at DESC LIMIT 20;

-- Search message content for a specific contact (always scope to contact first)
SELECT text_content, occurred_at, direction FROM messages
WHERE contact_number = $1
  AND text_content ILIKE '%' || $2 || '%'
ORDER BY occurred_at DESC LIMIT 20;

-- Get messages in a date range
SELECT direction, text_content, occurred_at FROM messages
WHERE contact_number = $1
  AND occurred_at BETWEEN $2 AND $3
ORDER BY occurred_at ASC;

-- Join with contacts for full profile
SELECT m.text_content, m.occurred_at, c.name, c.role
FROM messages m
JOIN contacts c ON c.id = m.contact_id
WHERE m.contact_number = $1
ORDER BY m.occurred_at DESC LIMIT 20;
```

---

## CATEGORY: OPERATIONAL

### TABLE: llm_call_logs

**Purpose:** Record of every LLM API call made by the agent — token usage, cost, latency, success/failure. This is the primary input for the SDMO Token Threshold Watcher. Also useful for cost tracking and performance analysis.

**Prompt Tier:** MCP on demand — operational / diagnostic use only.

```
COLUMNS:
  id                       → Primary key.
  provider_name            → LLM provider (e.g. "anthropic", "google", "openai").
  model                    → Model name (e.g. "claude-3-5-sonnet-20241022").
  call_type                → Purpose of the call (e.g. "agent_inbound", "optimizer").
  success                  → TRUE if completed without error.
  input_tokens             → Prompt tokens consumed.
  output_tokens            → Completion tokens generated.
  total_tokens             → input + output tokens. SDMO watches this column.
  input_cost_myr           → Cost of input tokens in MYR.
  output_cost_myr          → Cost of output tokens in MYR.
  total_cost_myr           → Total call cost in MYR.
  latency_ms               → API response time in milliseconds.
  error_message            → Error details if success = FALSE.
  metadata                 → JSONB. See schema below.
  created_at               → When the call was made.
```

**JSONB Field Schema:**
```
llm_call_logs.metadata (JSONB):
  {
    sourceTaskId:   string  → task ID (as string) this call was made for.
                              CRITICAL: SDMO Token Threshold Watcher uses this.
                              Use metadata->>'sourceTaskId' to filter by task.
    promptKey:      string  → Which prompt was active (e.g. "agent-inbound-decision")
    promptVersion:  number  → Version number of the prompt
    manifestName:   string  → Prompt manifest name
  }
```

**Common Queries:**
```sql
-- Token usage trend (daily)
SELECT DATE(created_at) AS day, SUM(total_tokens) AS tokens, SUM(total_cost_myr) AS cost_myr
FROM llm_call_logs WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY day ORDER BY day DESC;

-- Find high-token calls (SDMO threshold monitoring)
SELECT id, call_type, total_tokens, metadata->>'sourceTaskId' AS task_id, created_at
FROM llm_call_logs
WHERE total_tokens > 15000 ORDER BY created_at DESC LIMIT 20;

-- Cost by model
SELECT model, COUNT(*) AS calls, SUM(total_tokens) AS tokens, SUM(total_cost_myr) AS cost
FROM llm_call_logs GROUP BY model ORDER BY cost DESC;

-- Failed calls
SELECT call_type, error_message, created_at FROM llm_call_logs
WHERE success = FALSE ORDER BY created_at DESC LIMIT 20;
```

---

### TABLE: debug_records

**Purpose:** Structured agent execution log. Every significant internal event — planning steps, tool calls, errors — is logged here with context. Use this to understand what the agent was doing and why it behaved a certain way.

**Prompt Tier:** MCP on demand — diagnostic use only.

```
COLUMNS:
  id                  → Primary key.
  run_id              → Groups all records from a single agent invocation.
  task_id             → FK to tasks.id. Links to specific task if applicable.
  message_external_id → WhatsApp message that triggered this run.
  scheduler_job_id    → FK to scheduled_jobs.id if triggered by scheduler.
  tool_name           → Which tool was being called (if a tool step).
  severity            → 'info' | 'warning' | 'error'
  stage               → Phase of execution: 'intake' | 'planning' | 'execution' | 'output'
  summary             → Human-readable description of what happened.
  payload             → JSONB. Full context and data at the time of this log.
  created_at          → When logged.
```

**Common Queries:**
```sql
-- Full execution trace for a task
SELECT stage, severity, summary, created_at FROM debug_records
WHERE task_id = $1 ORDER BY created_at ASC;

-- Recent errors
SELECT task_id, tool_name, summary, payload, created_at FROM debug_records
WHERE severity = 'error' ORDER BY created_at DESC LIMIT 20;

-- Trace a specific agent run
SELECT stage, tool_name, summary, payload FROM debug_records
WHERE run_id = $1 ORDER BY created_at ASC;
```

---

### TABLE: decision_logs

**Purpose:** High-level agent decision summaries — what the agent decided to do and why. Less granular than debug_records, more human-readable. Audit trail for agent reasoning.

**Prompt Tier:** MCP on demand.

```
COLUMNS:
  id                    → Primary key.
  message_external_id   → WhatsApp message that prompted this decision.
  decision_type         → Category: 'agent_reasoning' | 'agent_failure' | 'intake_decision'
  summary               → Plain description of the decision made.
  context               → JSONB. Full decision context including actions chosen.
  created_at            → When decision was made.
```

**Common Queries:**
```sql
-- Decisions triggered by a specific message
SELECT decision_type, summary, created_at FROM decision_logs
WHERE message_external_id = $1 ORDER BY created_at ASC;

-- Recent agent failures
SELECT summary, context, created_at FROM decision_logs
WHERE decision_type = 'agent_failure' ORDER BY created_at DESC LIMIT 10;
```

---

### TABLE: clarification_threads

**Purpose:** Tracks open questions that need resolution before the agent can proceed. When the agent needs clarification from a human, it opens a thread here. Prevents the agent from acting on ambiguous instructions.

**Prompt Tier:** MCP on demand.

```
COLUMNS:
  id                             → Primary key.
  topic                          → What is being clarified.
  status                         → 'open' | 'resolved' | 'abandoned'
  details                        → JSONB. The question, who to ask, and the answer (when resolved).
  opened_by_message_external_id  → What message triggered this clarification need.
  created_at                     → When opened.
  updated_at                     → When last updated (check for resolution).
```

**Common Queries:**
```sql
-- All open clarification threads
SELECT id, topic, details, created_at FROM clarification_threads
WHERE status = 'open' ORDER BY created_at ASC;

-- Find clarification for a topic
SELECT topic, status, details FROM clarification_threads
WHERE topic ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT 5;
```

---

### TABLE: query_cache

**Purpose:** Cache of previously resolved questions and their answers. Check here first before querying other tables for stable facts the agent has looked up before. Avoids redundant computation.

**Prompt Tier:** MCP on demand.

```
COLUMNS:
  id          → Primary key.
  question    → The question asked (UNIQUE — same question = same cache entry).
  answer      → The answer that was determined.
  source      → Where/how the answer was derived.
  verified_at → When the answer was last confirmed as still accurate. NULL = unverified old cache.
  created_at  → When first cached.
```

**Common Queries:**
```sql
-- Check cache for a known question
SELECT answer, source, verified_at FROM query_cache WHERE question = $1;

-- Find recently verified cache entries
SELECT question, answer, verified_at FROM query_cache
WHERE verified_at >= NOW() - INTERVAL '7 days' ORDER BY verified_at DESC LIMIT 20;
```

---

## CATEGORY: AGENT CONFIG

### TABLE: prompt_hub_versions

**Purpose:** Version history of every system prompt the agent uses. The active version is the one powering current behavior. Query this to understand what prompt is currently running a given agent role.

**Prompt Tier:** MCP on demand.

```
COLUMNS:
  id            → Primary key.
  prompt_key    → Identifier for this prompt role (e.g. "agent-inbound-decision").
  version       → Integer version number. Higher = newer.
  content       → Full text of the prompt.
  is_active     → TRUE = this version is currently in use for this prompt_key.
  manifest_name → Source manifest/file this was compiled from.
  version_hash  → Content hash (SHA of content). Unique per prompt_key.
  source_files  → JSONB. List of source files compiled into this version.
  metadata      → JSONB. Additional deployment context.
  activated_at  → When this version was activated.
  created_at    → When this version was created.
```

**Common Queries:**
```sql
-- What prompts are currently active?
SELECT prompt_key, version, activated_at FROM prompt_hub_versions
WHERE is_active = TRUE ORDER BY prompt_key;

-- Get the current active prompt for a role
SELECT content FROM prompt_hub_versions
WHERE prompt_key = $1 AND is_active = TRUE LIMIT 1;
```

---

### TABLE: skill_hub_versions

**Purpose:** Version history of agent skills — specialized instruction modules that augment the agent's capabilities for specific domains. Mirrors the structure of prompt_hub_versions but for skills.

**Prompt Tier:** MCP on demand.

```
COLUMNS:
  id            → Primary key.
  skill_id      → Identifier for this skill (e.g. "invoice-follow-up").
  version       → Integer version number.
  content       → Full skill text content.
  is_active     → TRUE = this skill version is currently active.
  manifest_name → Source manifest.
  version_hash  → Content hash.
  source_files  → JSONB. Source files that comprise this skill.
  metadata      → JSONB.
  activated_at  → When activated.
  created_at    → When created.
```

**Common Queries:**
```sql
-- List all active skills
SELECT skill_id, version, activated_at FROM skill_hub_versions
WHERE is_active = TRUE ORDER BY skill_id;
```

---

## Cross-Table Relationships

```
contacts ──────────────────────────────────────────────────────┐
  whatsapp_number                                              │
       │                                                       │
       ├── tasks.requested_by                                  │
       ├── tasks.target_number                                 │
       ├── facts.source_contact_number                         │
       ├── messages.contact_number  ← use this, not sender_number
       ├── messages.contact_id  (FK — fastest join)            │
       ├── scheduled_jobs.created_by                           │
       └── claims.source_contact_number                        │
                                                               │
tasks ────────────────────────────────────────────────────────┤
  id                                                           │
       │                                                       │
       ├── task_events.task_id  (full event log)               │
       ├── scheduled_jobs.source_task_id  (future actions)     │
       ├── debug_records.task_id  (execution trace)            │
       └── llm_call_logs.metadata->>'sourceTaskId'  (tokens)   │
                                                               │
claims ───────────────────────────────────────────────────────┘
  id
       │
       └── facts.source_claim_id  (validated claims become facts)

FEEDBACK flows:
  messages (angry response) → task_events (USER_CORRECTION event)
                            → facts (memory_tier=1, immediate promotion)
                            → memory_index (memory_type='user_correction')
```

---

## CATEGORY: FEEDBACK

**Purpose:** Records of things that went wrong — agent mistakes, user corrections, and expressions of anger or dissatisfaction. This is the agent's most important learning input. A correction from a human is the highest-confidence signal the agent can receive. It must never be lost in raw message history.

**Prompt Tier:** Tier 1 — feedback facts are immediately promoted to Tier 1, never archived.

**This is not a separate table.** Feedback is captured using existing structures in a specific pattern:

### Pattern 1: task_events — Record the correction event
```
event_type: 'USER_CORRECTION'
content: {
  originalAction:     string  → What the agent did that was wrong
  userFeedback:       string  → Exact or paraphrased correction from the user
  severity:           'mild_objection' | 'strong_objection' | 'angry'
  contactNumber:      string  → Who gave the correction
  lessonExtracted:    string  → Plain English: what rule was learned
  promotedToFactKey:  string  → The fact_key this was promoted to (if promoted)
}
```

### Pattern 2: facts — Immediately promote to Tier 1
```sql
-- A USER_CORRECTION MUST create or update a fact at memory_tier = 1
-- Example:
--   User: "Don't ever message me after 9pm again!"
--   → facts: { fact_key: "60123456789:contact_hours",
--              subject: "60123456789",
--              predicate: "contact_hours",
--              value: "never after 9pm — user explicitly objected",
--              memory_tier: 1, confidence: 1.0 }
```

### Pattern 3: memory_index — Make it searchable
```
memory_type: 'user_correction'   → human corrected the agent
memory_type: 'mistake_pattern'   → agent made a systematic error
memory_type: 'negative_feedback' → user expressed dissatisfaction
scope_type:  'contact'           → always scope to the person involved
importance_score: 0.900+         → always set high
```

**Queries:**
```sql
-- What mistakes has the agent made with this person?
SELECT title, summary, memory_type, importance_score, created_at
FROM memory_index
WHERE scope_type = 'contact' AND scope_id = $1
  AND memory_type IN ('user_correction', 'mistake_pattern', 'negative_feedback')
ORDER BY importance_score DESC;

-- Get all Tier 1 behavioral rules for a person (includes corrections)
SELECT predicate, value, updated_at FROM facts
WHERE subject = $1 AND memory_tier = 1 AND status != 'deprecated'
ORDER BY updated_at DESC;

-- Find recent corrections across all contacts
SELECT scope_id AS contact, title, summary, created_at FROM memory_index
WHERE scope_type = 'contact'
  AND memory_type IN ('user_correction', 'negative_feedback')
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC LIMIT 20;

-- Find USER_CORRECTION events for a task
SELECT content, created_at FROM task_events
WHERE task_id = $1 AND event_type = 'USER_CORRECTION'
ORDER BY created_at DESC;
```

---

## Cross-Table Relationships

```
contacts ──────────────────────────────────────────────────────┐
  whatsapp_number                                              │
       │                                                       │
       ├── tasks.requested_by                                  │
       ├── tasks.target_number                                 │
       ├── facts.source_contact_number                         │
       ├── messages.contact_number  ← use this, not sender_number
       ├── messages.contact_id  (FK — fastest join)            │
       ├── scheduled_jobs.created_by                           │
       └── claims.source_contact_number                        │
                                                               │
tasks ────────────────────────────────────────────────────────┤
  id                                                           │
       │                                                       │
       ├── task_events.task_id  (full event log)               │
       ├── scheduled_jobs.source_task_id  (future actions)     │
       ├── debug_records.task_id  (execution trace)            │
       └── llm_call_logs.metadata->>'sourceTaskId'  (tokens)   │
                                                               │
claims ───────────────────────────────────────────────────────┘
  id
       │
       └── facts.source_claim_id  (validated claims become facts)

FEEDBACK flows:
  messages (angry response) → task_events (USER_CORRECTION event)
                            → facts (memory_tier=1, immediate promotion)
                            → memory_index (memory_type='user_correction')
```

---

## Quick Decision Guide

**"Who is this person?"**
→ `contacts` WHERE `whatsapp_number = $1`

**"What do we know about this person?"**
→ `facts` WHERE `subject = $1 AND status != 'deprecated'`
→ `memory_index` WHERE `scope_type = 'contact' AND scope_id = $1`

**"Has the agent made mistakes with this person before?"**
→ `memory_index` WHERE `scope_type = 'contact' AND scope_id = $1 AND memory_type IN ('user_correction', 'mistake_pattern', 'negative_feedback')`
→ `facts` WHERE `subject = $1 AND memory_tier = 1` (Tier 1 rules include promotions from corrections)

**"What tasks are active for this person?"**
→ `tasks` WHERE `(target_number = $1 OR requested_by = $1) AND status NOT IN ('COMPLETED', 'CANCELLED')`

**"What happened on task X?"**
→ First: `tasks.snapshot` WHERE `id = $1` (read snapshot before touching events)
→ Then: `task_events` SDMO-aware query (TASK_SUMMARY + events created after it)

**"What has the agent done recently?"**
→ `debug_records` WHERE `created_at >= NOW() - INTERVAL '24 hours'`
→ `decision_logs` WHERE `created_at >= NOW() - INTERVAL '24 hours'`

**"How much is this costing?"**
→ `llm_call_logs` — aggregate by `DATE(created_at)`, `model`, `call_type`

**"What is scheduled / planned?"**
→ `scheduled_jobs` WHERE `status = 'pending' ORDER BY run_at ASC`

**"Is there an open question blocking something?"**
→ `clarification_threads` WHERE `status = 'open'`

**"What reference material exists?"**
→ `knowledge_assets` — search `title ILIKE` or `summary ILIKE`
→ `memory_index` — search by `tags` array or `entities` array

**"Which query column should I use for messages?"**
→ Always use `contact_number` (NOT `sender_number`) — works correctly for both 1:1 and group chats

---

*Schema version 1.1 — Added: messages group chat columns, JSONB field schemas, consolidated enum reference, index hint table, FEEDBACK category. Next update: after 014_sdmo_schema.sql migration adds memory_tier and is_archived columns.*
