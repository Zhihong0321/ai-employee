# Open Source AI Agent Repositories - Research Report

## Executive Summary

This report analyzes three mature open-source AI agent implementations (fastclaw, gloamy, nanobot) to extract architectural patterns, design decisions, and implementation strategies for building a WhatsApp AI Employee. The analysis maps each repository's components to the 8-phase build plan, highlighting superior patterns that exceed the current plan's scope.

**Key Findings:**
- All three repositories implement ReAct-style agent loops with tool execution, but differ significantly in error handling, resumability, and safety mechanisms
- Memory systems consistently use a dual-layer approach (short-term conversation + long-term facts), with gloamy adding hybrid vector+FTS search
- Task lifecycle management varies from simple session persistence (nanobot) to full checkpoint/resumability (gloamy)
- Safety implementations range from simple policy files (fastclaw) to multi-level autonomy controls (gloamy)
- Scheduling patterns show convergence on timer-based awakening with deterministic next-run computation

**What They Do Better Than the Plan:**
- **Execution Checkpointing**: gloamy's checkpoint system enables resumable multi-step tasks with failure recovery
- **Failure Classification**: Structured categorization of tool failures (transient vs. permanent, retriable vs. fatal)
- **Hybrid Memory Search**: Vector embeddings combined with keyword FTS provides superior retrieval
- **Hook Systems**: Extensibility points throughout the agent loop without core modifications
- **Legal Boundary Detection**: Session slicing that preserves tool-call/result pairs to avoid provider errors

---

## 1. Repository Overview

### fastclaw (Go)
- **Language**: Go
- **Architecture**: Self-hosted AI agent runtime with plugin system
- **Key Strength**: Production-grade infrastructure with PostgreSQL/SQLite storage, hot reload, multi-channel support
- **Lines of Code**: ~20K+ Go
- **Status**: Mature, stable

### gloamy (Rust)
- **Language**: Rust
- **Architecture**: Trait-driven, secure-by-default agent framework
- **Key Strength**: Resumable task execution, SOP engine, advanced failure handling
- **Lines of Code**: ~30K+ Rust
- **Status**: Active development, WhatsApp support

### nanobot (Python)
- **Language**: Python
- **Architecture**: Ultra-lightweight agent with end-to-end streaming
- **Key Strength**: Simplicity, rapid iteration, 99% fewer lines than competitors
- **Lines of Code**: ~10K Python
- **Status**: Very active (daily releases)

---

## 2. Core Architecture Comparison

### 2.1 Agent Loop Architecture

#### fastclaw Pattern
```
Gateway → Message Bus → Agent Manager → ReAct Loop
                              ↓
                    [Memory | Tools | Sessions]
```

**Characteristics:**
- ReAct loop in `internal/agent/loop.go` (836 lines)
- Tool loop detection: 3 identical consecutive calls triggers warning injection
- Concurrent tool execution via SDK engine
- Hook system with 7 lifecycle points:
  - BeforeSystemPrompt, AfterSystemPrompt
  - BeforeModelCall, AfterModelCall
  - BeforeToolCall, AfterToolCall
  - PostTurn

**Code Example (Tool Loop Detection):**
```go
type toolCallSig struct {
    name string
    hash [32]byte
}

// Loop detection: check before executing
sig := toolCallSig{
    name: tc.Function.Name,
    hash: sha256.Sum256([]byte(tc.Function.Arguments)),
}
if sig.name == lastSig.name && sig.hash == lastSig.hash {
    consecutiveCount++
} else {
    consecutiveCount = 1
    lastSig = sig
}
if consecutiveCount >= 3 {
    slog.Warn("tool loop detected", "agent", a.name, "tool", tc.Function.Name)
    // inject warning message to session
}
```

**Strengths:**
- Production-ready message bus architecture
- Explicit loop detection prevents infinite tool cycles
- Hook system allows product customization without forking

**Weaknesses:**
- No task checkpoint/resume capability
- Session compaction is simple truncation, no semantic preservation

---

#### gloamy Pattern
```
Channel → Task Store → Agent Loop → Tool Execution
              ↓              ↓
        Checkpoints    Failure Classifier
              ↓              ↓
        Resume Logic   Recovery Hints
```

**Characteristics:**
- Execution checkpoint pattern with `ExecutionCheckpointItem` tracking
- Failure classification system with 8+ categories:
  - `unknown_tool`, `permission_or_policy`, `transient_or_rate_limit`
  - `semantic_misunderstanding`, `user_clarification_needed`, etc.
- Resumable history: strips tool call XML tags for clean continuation
- Task snapshots enable multi-session resumption

**Code Example (Failure Classification):**
```rust
fn classify_tool_failure(output: &str) -> &'static str {
    let lower = output.to_lowercase();
    if lower.contains("unknown tool") { return "unknown_tool"; }
    if lower.contains("permission denied") { return "permission_or_policy"; }
    if lower.contains("timeout") { return "transient_or_rate_limit"; }
    if lower.contains("api key") || lower.contains("authentication") {
        return "transient_or_rate_limit";
    }
    if lower.contains("not found") { return "resource_not_found"; }
    // ... more classifications
    "unclassified"
}

pub(crate) fn build_execution_checkpoint_note(
    items: &[ExecutionCheckpointItem]
) -> Option<String> {
    // Builds runtime checkpoint note for LLM with:
    // - Successes
    // - Failures with classifications
    // - Recovery hints
}
```

**Strengths:**
- Task resumability after crashes or timeouts
- Structured failure analysis guides LLM recovery
- Checkpoint notes provide explicit execution state to LLM

**Weaknesses:**
- Complexity cost (large codebase)
- Resumable history generation adds processing overhead

---

#### nanobot Pattern
```
Bus → CommandRouter (priority) → Session Lock → Agent Loop
                                       ↓
                               [AgentRunner (pure execution)]
                                       ↓
                               [Concurrent Tools]
```

**Characteristics:**
- Clean separation: `AgentRunner` handles pure LLM+tools execution, `AgentLoop` handles product concerns
- Per-session serial execution, cross-session concurrency
- Streaming support with delta relay and segment IDs
- Background task tracking for memory consolidation
- Legal tool-call boundary detection prevents orphan results

**Code Example (Legal Boundary Detection):**
```python
@staticmethod
def _find_legal_start(messages: list[dict[str, Any]]) -> int:
    """Find first index where every tool result has a matching assistant tool_call."""
    declared: set[str] = set()
    start = 0
    for i, msg in enumerate(messages):
        role = msg.get("role")
        if role == "assistant":
            for tc in msg.get("tool_calls") or []:
                if isinstance(tc, dict) and tc.get("id"):
                    declared.add(str(tc["id"]))
        elif role == "tool":
            tid = msg.get("tool_call_id")
            if tid and str(tid) not in declared:
                # Orphan tool result - restart from here
                start = i + 1
                declared.clear()
    return start
```

**Strengths:**
- Simplest architecture of the three
- Separation of concerns (execution vs. orchestration)
- Prevents provider errors from orphan tool results
- Concurrency control with optional semaphore

**Weaknesses:**
- No task checkpointing
- Limited failure recovery (just error messages)

---

### 2.2 Architectural Pattern Comparison

| Aspect | fastclaw | gloamy | nanobot |
|--------|----------|--------|---------|
| **Separation of Concerns** | Medium (loop + manager) | High (traits) | High (runner + loop) |
| **Resumability** | None | Full checkpoint | None |
| **Failure Handling** | Loop detection | Classification + hints | Error messages |
| **Extensibility** | Hooks | Traits | Hooks |
| **Concurrency** | SDK-based | async Rust | Semaphore-gated |
| **Message Bus** | Dedicated | Integrated | Simple queue |

**Best Pattern for Build Plan**: Hybrid of nanobot's clean separation + gloamy's checkpoint pattern

---

## 3. Memory & Knowledge Management

### 3.1 Dual-Layer Memory Pattern (All Three)

All repositories converge on a two-layer memory architecture:

**Layer 1: Short-term (Session/Conversation)**
- Append-only message history
- Rolling window (last N messages or tokens)
- Preserved for LLM cache efficiency

**Layer 2: Long-term (Persistent Facts)**
- Extracted facts stored in `MEMORY.md`
- Searchable history log in `HISTORY.md`
- LLM-driven consolidation

---

### 3.2 fastclaw Memory Implementation

**Files:**
- `MEMORY.md`: Long-term facts about the agent/user
- `USER.md`: User-specific notes
- `HISTORY.md`: Append-only chronological log

**Consolidation Logic:**
```go
func AutoPersistMemory(ctx context.Context, mem *Memory, prov provider.Provider, 
                       model string, messages []provider.Message) {
    // Build summary of last 20 messages
    // Call LLM to extract facts: {"memory_facts": [...], "user_notes": [...]}
    // Append to MEMORY.md and USER.md with timestamps
}

func ReviewAndUpdateMemory(ctx context.Context, mem *Memory, prov provider.Provider, 
                           model string) {
    // Heartbeat: review recent HISTORY.md
    // Extract key facts
    // Update MEMORY.md
}
```

**Strengths:**
- Separate user vs. agent memory files
- Heartbeat-based periodic review
- Auto-persist every N turns

**Weaknesses:**
- No vector search
- No keyword search indexing
- Consolidation is append-only (no deduplication)

---

### 3.3 gloamy Memory Implementation

**Hybrid Search Architecture:**
- **Vector embeddings**: Semantic similarity search
- **FTS5 (Full-Text Search)**: Keyword-based search
- **Weighted fusion**: Combines both with RRF (Reciprocal Rank Fusion)

**Implementation (`src/memory/sqlite.rs`):**
```rust
pub(crate) struct HybridSearchResult {
    pub content: String,
    pub score: f64,
    pub source: SearchSource, // Vector | FTS | Hybrid
}

// Vector search with embedding cache (LRU eviction)
fn vector_search(&self, query_embedding: &[f32], limit: usize) -> Vec<HybridSearchResult>;

// FTS5 keyword search
fn fts_search(&self, query: &str, limit: usize) -> Vec<HybridSearchResult>;

// Weighted fusion of both
fn hybrid_search(&self, query: &str, embedding: &[f32], limit: usize) -> Vec<HybridSearchResult> {
    let vector_results = self.vector_search(embedding, limit);
    let fts_results = self.fts_search(query, limit);
    reciprocal_rank_fusion(vector_results, fts_results, weights)
}
```

**Safe Reindex Pattern:**
```rust
// Temp DB → seed → sync → swap
fn safe_reindex(&mut self) -> Result<()> {
    let temp_db = create_temp_database();
    seed_embeddings(temp_db);
    sync_incremental(temp_db, main_db);
    atomic_swap(temp_db, main_db);
}
```

**Strengths:**
- Best retrieval accuracy (semantic + keyword)
- LRU cache for embedding reuse
- Safe concurrent reindex
- No downtime during reindex

**Weaknesses:**
- Complexity (embedding generation)
- Dependency on embedding model

---

### 3.4 nanobot Memory Implementation

**Consolidation with Fallback:**
```python
class MemoryStore:
    _MAX_FAILURES_BEFORE_RAW_ARCHIVE = 3

    async def consolidate(self, messages, provider, model) -> bool:
        # Call LLM with save_memory tool
        # If fails, increment counter
        # After 3 failures, raw-archive to HISTORY.md
```

**Token-Based Consolidation:**
```python
async def maybe_consolidate_by_tokens(self, session: Session) -> None:
    """Loop: archive old messages until prompt fits within safe budget."""
    budget = context_window - max_completion - safety_buffer
    target = budget // 2
    
    while estimated_tokens > target:
        boundary = pick_consolidation_boundary(session, tokens_to_remove)
        chunk = session.messages[last_consolidated:boundary]
        await consolidate_messages(chunk)
        session.last_consolidated = boundary
```

**Strengths:**
- Graceful degradation (raw archive after failures)
- Token-aware consolidation prevents context overflow
- User-turn boundary alignment
- Consolidation runs in background (async)

**Weaknesses:**
- No vector search
- No FTS search
- Simple append to HISTORY.md

---

### 3.5 Memory Pattern Comparison

| Feature | fastclaw | gloamy | nanobot |
|---------|----------|--------|---------|
| **Dual-Layer** | ✓ | ✓ | ✓ |
| **Vector Search** | ✗ | ✓ | ✗ |
| **FTS Search** | ✓ (DB) | ✓ (hybrid) | ✗ |
| **Consolidation** | LLM extract | LLM extract | LLM + fallback |
| **Heartbeat Review** | ✓ | ? | ✗ |
| **Token-Aware** | ✗ | ? | ✓ |

**Best Pattern for Build Plan**: gloamy's hybrid search + nanobot's token-aware consolidation with fallback

---

## 4. Task & Action System

### 4.1 Task Lifecycle Management

#### fastclaw: Session-Only

**No explicit task model.** Sessions are stateful conversations with:
- JSONL message persistence
- Context compaction (simple truncation)
- Undo snapshot support

**Session Manager (`internal/session/manager.go`):**
```go
type Session struct {
    ID       string
    Messages []Message
    Metadata map[string]interface{}
}

func (m *Manager) SaveSession(sess *Session) error {
    // Write JSONL to file
}

func (m *Manager) CompactContext(sess *Session, maxTokens int) {
    // Truncate old messages
}
```

**Strengths:**
- Simple, predictable
- Fast persistence (JSONL append)

**Weaknesses:**
- No task resumability
- No multi-step tracking
- Compaction loses context

---

#### gloamy: Full Task Store

**Explicit task model** with checkpoints and resumability.

**Task Record (`src/agent/task_store.rs`):**
```rust
pub(crate) struct TaskRecord {
    pub task_id: String,
    pub thread_id: String,
    pub status: TaskStatus, // Running, Completed, Failed, Cancelled, TimedOut
    pub execution_history: Vec<ChatMessage>,
    pub resumable_history: Vec<ChatMessage>, // XML tags stripped
    pub checkpoints: Vec<TaskCheckpointRecord>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub(crate) enum TaskStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
    TimedOut,
}
```

**Checkpoint System:**
```rust
pub(crate) struct ExecutionCheckpointItem {
    pub tool_name: String,
    pub status: String, // "ok" | "error"
    pub detail: String,
}

fn save_checkpoint(task_id: &str, items: &[ExecutionCheckpointItem]) {
    // Persist checkpoint to SQLite
}

fn build_resumable_history(history: &[ChatMessage]) -> Vec<ChatMessage> {
    // Strip tool call XML tags for clean resume
    history.iter().map(|msg| {
        if msg.role == "assistant" {
            strip_tool_call_xml(msg.content)
        } else {
            msg.clone()
        }
    }).collect()
}
```

**Strengths:**
- Full resumability after crashes
- Explicit task status tracking
- Checkpoint-driven recovery
- Resumable history avoids tag pollution

**Weaknesses:**
- Increased storage (dual history)
- Complexity in checkpoint management

---

#### nanobot: Session with Legal Boundaries

**No explicit task model.** Sessions with smart boundary detection.

**Legal Boundary Detection:**
```python
def _find_legal_start(messages: list[dict]) -> int:
    """Find first index where every tool result has a matching tool_call."""
    declared: set[str] = set()
    start = 0
    for i, msg in enumerate(messages):
        if msg["role"] == "assistant":
            for tc in msg.get("tool_calls") or []:
                declared.add(tc["id"])
        elif msg["role"] == "tool":
            if msg["tool_call_id"] not in declared:
                start = i + 1  # Restart from orphan
                declared.clear()
    return start

def get_history(self, max_messages: int = 500) -> list[dict]:
    """Return messages aligned to legal tool-call boundary."""
    sliced = self.messages[-max_messages:]
    
    # Drop leading non-user messages
    for i, msg in enumerate(sliced):
        if msg["role"] == "user":
            sliced = sliced[i:]
            break
    
    # Find legal start
    start = self._find_legal_start(sliced)
    return sliced[start:]
```

**Strengths:**
- Prevents provider errors (orphan tool results)
- Automatic boundary alignment
- No manual checkpoint management

**Weaknesses:**
- No resumability
- No task status tracking

---

### 4.2 Task System Comparison

| Feature | fastclaw | gloamy | nanobot |
|---------|----------|--------|---------|
| **Task Model** | None (session-only) | Full (TaskRecord) | None (session-only) |
| **Resumability** | ✗ | ✓ | ✗ |
| **Status Tracking** | ✗ | ✓ | ✗ |
| **Checkpoints** | ✗ | ✓ | ✗ |
| **Legal Boundaries** | ✗ | ✗ | ✓ |
| **Multi-Step** | Manual | Automatic | Manual |

**Best Pattern for Build Plan**: gloamy's task store + checkpoints + nanobot's legal boundary detection

---

## 5. Tool Use Patterns

### 5.1 Tool Registry Architecture

All three use similar patterns:

**Tool Schema:**
- OpenAI function calling format
- JSON schema for parameters
- Execute method with validation

**Common Pattern:**
```
ToolRegistry
  ├─ register(tool)
  ├─ get_definitions() → OpenAI format
  └─ execute(name, params) → result
```

---

### 5.2 fastclaw Tool System

**Registry (`internal/agent/tools/registry.go`):**
```go
type ToolFunc func(ctx context.Context, args json.RawMessage) (string, error)

type Tool struct {
    Name        string
    Description string
    Parameters  interface{} // JSON schema
    Func        ToolFunc
    Source      ToolSource  // Builtin | MCP | Plugin
}

func (r *Registry) Execute(ctx context.Context, name string, args json.RawMessage) (string, error) {
    tool := r.tools[name]
    if tool == nil {
        return "", fmt.Errorf("tool not found: %s", name)
    }
    return tool.Func(ctx, args)
}
```

**Strengths:**
- Source tracking (builtin vs. plugin)
- Context propagation
- Simple function signature

**Weaknesses:**
- No schema validation on execute
- No parameter type casting

---

### 5.3 gloamy Tool System

**Trait-based architecture** (exact implementation not fully visible, but inferred from patterns):
- Tool trait with execute method
- Schema generation from trait
- Policy integration (permission checks)

**Strengths:**
- Compile-time type safety
- Policy enforcement at tool level
- Trait composition

**Weaknesses:**
- Rust complexity for dynamic tools

---

### 5.4 nanobot Tool System

**Base Tool Class (`nanobot/agent/tools/base.py`):**
```python
class Tool:
    name: str
    description: str
    parameters: dict  # JSON schema
    
    def to_schema(self) -> dict:
        """Convert to OpenAI function format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }
    
    def cast_params(self, params: dict) -> dict:
        """Cast parameters to match schema types."""
        # Type coercion logic
    
    def validate_params(self, params: dict) -> list[str]:
        """Validate parameters against schema."""
        #Returns list of error messages
    
    async def execute(self, **kwargs) -> Any:
        """Execute the tool."""
        raise NotImplementedError
```

**Registry (`nanobot/agent/tools/registry.py`):**
```python
async def execute(self, name: str, params: dict) -> Any:
    tool = self._tools.get(name)
    if not tool:
        return f"Error: Tool '{name}' not found"
    
    try:
        params = tool.cast_params(params)
        errors = tool.validate_params(params)
        if errors:
            return f"Error: Invalid parameters: {'; '.join(errors)}"
        
        result = await tool.execute(**params)
        if isinstance(result, str) and result.startswith("Error"):
            return result + "\n\n[Analyze the error and try a different approach.]"
        return result
    except Exception as e:
        return f"Error executing {name}: {str(e)}\n\n[Analyze the error...]"
```

**Strengths:**
- Automatic parameter casting
- Schema validation before execution
- Error messages include recovery hints
- Clean async/await pattern

**Weaknesses:**
- No compile-time safety
- Dynamic validation overhead

---

### 5.5 Tool Execution Patterns

| Feature | fastclaw | gloamy | nanobot |
|---------|----------|--------|---------|
| **Validation** | Manual | Trait-based | Schema-based |
| **Type Casting** | ✗ | ✓ (compile-time) | ✓ (runtime) |
| **Error Hints** | ✗ | ✓ | ✓ |
| **Concurrency** | SDK parallel | async Rust | asyncio.gather |
| **Source Tracking** | ✓ | ? | ✗ |

**Best Pattern for Build Plan**: nanobot's schema validation + error hints + fastclaw's source tracking

---

## 6. Scheduling & Cron Systems

### 6.1 fastclaw Cron Scheduler

**Architecture (`internal/cron/scheduler.go`):**

**Job Types:**
- `Exact`: Run at specific HH:MM
- `Interval`: Run every N seconds/minutes/hours
- `Cron`: 5-field cron expression

**Storage:**
- PostgreSQL/SQLite with `cron_jobs` table
- Job locking for distributed scheduling

**Implementation:**
```go
type Job struct {
    ID          string
    Name        string
    Enabled     bool
    Schedule    Schedule
    Payload     Payload
    NextRunAt   time.Time
    LastRunAt   time.Time
}

func (s *Scheduler) tick() {
    jobs := s.getDueJobs()
    for _, job := range jobs {
        if s.tryLock(job.ID) {
            go s.executeJob(job)
        }
    }
}
```

**Strengths:**
- Distributed locking (multi-instance safe)
- Hot reload support
- Database persistence

**Weaknesses:**
- Polling-based (inefficient for sparse schedules)
- No timezone support (uses system time)

---

### 6.2 gloamy Cron Scheduler

**Architecture (`src/cron/scheduler.rs`):**

**Job Execution:**
- Concurrent processing with `buffer_unordered`
- Retry with exponential backoff + jitter
- Security policy checks before execution
- One-shot auto-delete jobs

**Implementation:**
```rust
async fn process_jobs_concurrently(&self, jobs: Vec<Job>) {
    futures::stream::iter(jobs)
        .map(|job| self.execute_with_retry(job))
        .buffer_unordered(MAX_CONCURRENT)
        .collect::<Vec<_>>()
        .await;
}

async fn execute_with_retry(&self, job: Job) -> Result<()> {
    let mut backoff = Duration::from_secs(1);
    for attempt in 0..MAX_RETRIES {
        // Policy check
        if !self.policy.check_job(&job) {
            return Err("Policy denied");
        }
        
        match self.execute(&job).await {
            Ok(_) => return Ok(()),
            Err(e) if is_transient(e) => {
                tokio::time::sleep(backoff + jitter()).await;
                backoff *= 2;
            }
            Err(e) => return Err(e),
        }
    }
}
```

**Strengths:**
- Concurrent job execution
- Retry with backoff
- Policy integration
- Auto-delete one-shot jobs

**Weaknesses:**
- More complex than needed for simple cases

---

### 6.3 nanobot Cron Service

**Architecture (`nanobot/cron/service.py`):**

**Timer-Based Awakening:**
- Compute next wake time across all jobs
- Single asyncio timer armed to earliest next-run
- Re-arm after each execution

**Schedule Types:**
- `at`: One-time at specific timestamp
- `every`: Interval-based (milliseconds)
- `cron`: Standard cron expression with timezone support

**Implementation:**
```python
def _compute_next_run(schedule: CronSchedule, now_ms: int) -> int | None:
    if schedule.kind == "at":
        return schedule.at_ms if schedule.at_ms > now_ms else None
    
    if schedule.kind == "every":
        return now_ms + schedule.every_ms
    
    if schedule.kind == "cron":
        from croniter import croniter
        from zoneinfo import ZoneInfo
        
        tz = ZoneInfo(schedule.tz) if schedule.tz else None
        base_dt = datetime.fromtimestamp(now_ms / 1000, tz=tz)
        cron = croniter(schedule.expr, base_dt)
        next_dt = cron.get_next(datetime)
        return int(next_dt.timestamp() * 1000)

def _arm_timer(self):
    next_wake = self._get_next_wake_ms()
    delay_s = (next_wake - now_ms()) / 1000
    
    async def tick():
        await asyncio.sleep(delay_s)
        await self._on_timer()
    
    self._timer_task = asyncio.create_task(tick)
```

**Job Execution:**
```python
async def _execute_job(self, job: CronJob):
    start_ms = now_ms()
    
    try:
        await self.on_job(job)
        job.state.last_status = "ok"
    except Exception as e:
        job.state.last_status = "error"
        job.state.last_error = str(e)
    
    end_ms = now_ms()
    
    # Record in history (max 20 records)
    job.state.run_history.append(CronRunRecord(
        run_at_ms=start_ms,
        status=job.state.last_status,
        duration_ms=end_ms - start_ms,
        error=job.state.last_error
    ))
    job.state.run_history = job.state.run_history[-20:]
    
    # Handle one-shot jobs
    if job.schedule.kind == "at":
        if job.delete_after_run:
            self._store.jobs.remove(job)
        else:
            job.enabled = False
    else:
        job.state.next_run_at_ms = _compute_next_run(job.schedule, now_ms())
```

**Strengths:**
- Timer-based (efficient for sparse schedules)
- Timezone support
- One-shot with auto-delete
- Run history tracking (last 20)
- Hot reload (external file modification detection)

**Weaknesses:**
- No distributed locking (single-instance only)
- No concurrent job execution
- No retry logic

---

### 6.4 Scheduling Pattern Comparison

| Feature | fastclaw | gloamy | nanobot |
|---------|----------|--------|---------|
| **Trigger** | Polling | ? | Timer-based |
| **Distributed** | ✓ (locks) | ? | ✗ |
| **Timezone** | ✗ | ? | ✓ |
| **Retry** | ✗ | ✓ (backoff) | ✗ |
| **One-shot** | ? | ✓ (auto-delete) | ✓ (auto-delete) |
| **History** | ✗ | ? | ✓ (last 20) |
| **Hot Reload** | ✓ | ? | ✓ |

**Best Pattern for Build Plan**: Hybrid - nanobot's timer efficiency + gloamy's retry + fastclaw's distributed locks

---

## 7. Safety & Policy Mechanisms

### 7.1 fastclaw Policy Engine

**YAML-Based Policy (`internal/policy/engine.go`):**

```yaml
# policy.yaml
filesystem:
  deny_write:
    - "/etc/**"
    - "/usr/**"
    - "~/.ssh/**"
  allow_write:
    - "/workspace/**"
  deny_read:
    - "/etc/shadow"
    - "/etc/master.passwd"

network:
  allow_hosts:
    - "*.github.com"
    - "api.openai.com"
  deny_hosts:
    - "localhost"
    - "*.internal"

tools:
  deny:
    - "exec_shell"  # Disable shell execution
  require_approval:
    - "delete_file"
```

**Implementation:**
```go
func (e *Engine) CheckFilesystem(path string, write bool) error {
    fs := e.policy.Filesystem
    if write {
        for _, pattern := range fs.DenyWrite {
            if matchGlob(pattern, path) {
                return fmt.Errorf("policy: write denied to %s", path)
            }
        }
        for _, pattern := range fs.AllowWrite {
            if matchGlob(pattern, path) {
return nil
            }
        }
        return fmt.Errorf("policy: write not in allowlist")
    }
    // Similar for read
}

func (e *Engine) CheckNetwork(host string) error {
    for _, pattern := range e.policy.Network.DenyHosts {
        if matchPattern(pattern, host) {
            return fmt.Errorf("policy: host denied")
        }
    }
    for _, pattern := range e.policy.Network.AllowHosts {
        if matchPattern(pattern, host) {
            return nil
        }
    }
    return fmt.Errorf("policy: host not in allowlist")
}
```

**Strengths:**
- Human-readable YAML
- Glob pattern matching
- Explicit deny + allowlist
- Per-tool enable/disable

**Weaknesses:**
- No autonomy levels
- No rate limiting
- Static (no runtime updates)

---

### 7.2 gloamy Security Policy

**Multi-Level Autonomy (`src/security/policy.rs`):**

```rust
pub enum AutonomyLevel {
    ReadOnly,    // Observe but not act
    Supervised,  // Acts but requires approval for risky operations
    Full,        // Autonomous within policy bounds
}

pub struct ActionTracker {
    window: Duration,
    max_actions: usize,
    actions: VecDeque<Instant>,
}

impl ActionTracker {
    fn check_and_record(&mut self) -> Result<(), String> {
        let now = Instant::now();
        
        // Evict old actions outside window
        while let Some(&oldest) = self.actions.front() {
            if now.duration_since(oldest) > self.window {
                self.actions.pop_front();
            } else {
                break;
            }
        }
        
        // Check rate limit
        if self.actions.len() >= self.max_actions {
            return Err("Rate limit exceeded");
        }
        
        self.actions.push_back(now);
        Ok(())
    }
}
```

**Quote-Aware Shell Parsing:**
```rust
fn parse_shell_command_safe(cmd: &str) -> Vec<String> {
    // Proper quote handling to detect injection attempts
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut escape = false;
    
    for ch in cmd.chars() {
        if escape {
            current.push(ch);
            escape = false;
        } else if ch == '\\' {
            escape = true;
        } else if ch == '"' {
            in_quotes = !in_quotes;
        } else if ch == ' ' && !in_quotes {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
        } else {
            current.push(ch);
        }
    }
    
    if !current.is_empty() {
        tokens.push(current);
    }
    
    tokens
}
```

**Strengths:**
- Three-level autonomy model
- Rate limiting with sliding window
- Shell injection protection
- Quote-aware parsing

**Weaknesses:**
- Complex configuration
- Rust learning curve

---

### 7.3 nanobot Security

**SSRF Protection (`nanobot/security/network.py`):**

```python
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

def validate_url_target(url: str) -> tuple[bool, str]:
    """Validate URL is safe to fetch."""
    parsed = urlparse(url)
    
    if parsed.scheme not in ("http", "https"):
        return False, f"Only http/https allowed"
    
    hostname = parsed.hostname
    if not hostname:
        return False, "Missing hostname"
    
    # Resolve DNS
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False, f"Cannot resolve {hostname}"
    
    # Check all resolved IPs
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if any(addr in net for net in _BLOCKED_NETWORKS):
            return False, f"Blocked: {hostname} → {addr} (private)"
    
    return True, ""
```

**Workspace Restriction:**
```python
class WriteFileTool(Tool):
    def __init__(self, workspace: Path, allowed_dir: Path | None = None):
        self.workspace = workspace
        self.allowed_dir = allowed_dir or workspace
    
    async def execute(self, file_path: str, content: str) -> str:
        path = Path(file_path).resolve()
        
        # Check if path is within allowed directory
        try:
            path.relative_to(self.allowed_dir)
        except ValueError:
            return f"Error: Access denied - path outside allowed directory"
        
        # Write file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return f"File written: {path}"
```

**Strengths:**
- SSRF protection with IP blocklisting
- Cloud metadata blocking (169.254.0.0/16)
- Workspace containment
- DNS resolution validation

**Weaknesses:**
- No policy file
- No autonomy levels
- No rate limiting
- Basic compared to others

---

### 7.4 Safety Pattern Comparison

| Feature | fastclaw | gloamy | nanobot |
|---------|----------|--------|---------|
| **Policy File** | ✓ (YAML) | ✓ | ✗ |
| **Autonomy Levels** | ✗ | ✓ (3 levels) | ✗ |
| **Rate Limiting** | ✗ | ✓ (sliding window) | ✗ |
| **SSRF Protection** | ✗ | ? | ✓ |
| **Workspace Containment** | ✓ | ? | ✓ |
| **Shell Injection Protection** | ✗ | ✓ (quote-aware) | ✗ |

**Best Pattern for Build Plan**: gloamy's autonomy levels + rate limiting + nanobot's SSRF protection + fastclaw's YAML policy

---

## 8. What They Do BETTER Than the Build Plan

### 8.1 Execution Checkpointing (gloamy)

**Current Plan Gap:** Phase 5 (Task Memory And Lifecycle) defines task charter/snapshot/events but doesn't specify resumability after crashes.

**gloamy's Superior Pattern:**
- **Checkpoint records** capture execution state at each tool call
- **Resumable history** strips tool-call XML tags for clean continuation
- **Failure classification** guides LLM recovery with structured hints
- **Task status tracking** (Running, Completed, Failed, Cancelled, TimedOut)

**Recommendation:** Add checkpoint layer to Phase 5:
```
Task Lifecycle:
  ├─ Charter (what to do)
  ├─ Snapshot (current state)
  ├─ Events (what happened)
  └─ Checkpoints (resumable execution state) ← NEW
```

---

### 8.2 Failure Classification System (gloamy)

**Current Plan Gap:** Phase 7 (Execution Policy/Scheduler/Retry) mentions retry but doesn't classify failure types.

**gloamy's Superior Pattern:**
- Classify failures into categories:
  - `unknown_tool`: Tool doesn't exist (permanent)
  - `permission_or_policy`: Access denied (permanent unless policy changes)
  - `transient_or_rate_limit`: Retry after backoff
  - `semantic_misunderstanding`: LLM misused the tool
  - `user_clarification_needed`: Missing required info
  - `resource_not_found`: File/URL doesn't exist
  - `unclassified`: Unknown error

**Recommendation:** Add failure classifier to Phase 7:
```python
def classify_failure(error: str) -> FailureType:
    # Returns: TRANSIENT | PERMANENT | USER_INPUT | SEMANTIC
    # Enables smart retry logic
```

---

### 8.3 Hybrid Memory Search (gloamy)

**Current Plan Gap:** Phase 2 (Identity Stability) mentions memory but doesn't specify search mechanism.

**gloamy's Superior Pattern:**
- **Vector embeddings** for semantic similarity
- **FTS5 keyword search** for exact matches
- **Weighted fusion** combines both (Reciprocal Rank Fusion)
- **LRU embedding cache** for performance

**Recommendation:** Add to Phase 2:
```
Memory Architecture:
  ├─ MEMORY.md (long-term facts)
  ├─ HISTORY.md (searchable log)
  └─ Hybrid Index (vector + FTS5) ← NEW
```

---

### 8.4 Hook System (fastclaw)

**Current Plan Gap:** No extensibility points defined.

**fastclaw's Superior Pattern:**
- 7 lifecycle hooks allow customization without forking:
  - `BeforeSystemPrompt`, `AfterSystemPrompt`
  - `BeforeModelCall`, `AfterModelCall`
  - `BeforeToolCall`, `AfterToolCall`
  - `PostTurn`

**Recommendation:** Add hook layer throughout phases:
```
Phase 3 (Prompt Hot-Swap):
  └─ Add: before_prompt / after_prompt hooks

Phase 6 (Planner And Action):
  └─ Add: before_tool / after_tool hooks
```

---

### 8.5 Legal Boundary Detection (nanobot)

**Current Plan Gap:** Phase 5 doesn't address provider errors from orphan tool results.

**nanobot's Superior Pattern:**
- Detect orphan tool results (missing matching tool_call)
- Auto-align session slicing to legal boundaries
- Prevents provider rejection errors

**Recommendation:** Add to Phase 5:
```python
def get_task_context(task):
    messages = task.get_messages()
    
    # Align to legal boundary
    start = find_legal_start(messages)
    return messages[start:]
```

---

### 8.6 Token-Aware Consolidation (nanobot)

**Current Plan Gap:** Phase 5 doesn't specify when to consolidate.

**nanobot's Superior Pattern:**
- Estimate prompt tokens before each turn
- Consolidate when approaching context window limit
- Target 50% of budget to avoid thrashing
- Loop until prompt fits (multiple consolidation rounds)

**Recommendation:** Add to Phase 5:
```
Consolidation Trigger:
  if estimated_tokens > (context_window - max_completion - safety_buffer):
      consolidate_oldest_messages()
```

---

### 8.7 Graceful Degradation (nanobot)

**Current Plan Gap:** No fallback for LLM failures.

**nanobot's Superior Pattern:**
- Memory consolidation: after 3 LLM failures, raw-dump to HISTORY.md
- Ensures data never lost even if consolidation fails
- Degrades gracefully rather than blocking

**Recommendation:** Add to Phase 5:
```
Consolidation Fallback:
  try:
      llm_consolidate(messages)
  except Exception:
      failure_count++
      if failure_count >= 3:
          raw_archive(messages)  # Fallback
```

---

### 8.8 Streaming Support (nanobot)

**Current Plan Gap:** No real-time response streaming defined.

**nanobot's Superior Pattern:**
- Stream deltas to user during LLM generation
- Strip `<think>` tags from stream before sending
- Segment IDs for multi-phase responses (thought → tool → result)
- Resuming flag indicates more work follows

**Recommendation:** Add to Phase 8 (End-To-End Validation):
```
Streaming Protocol:
  ├─ on_stream(delta) → send to user
  ├─ on_stream_end(resuming) → signal phase complete
  └─ strip_think(delta) → hide internal reasoning
```

---

## 9. Component Mapping to Build Plan Phases

### Phase 1: Intake Stability

**Goal:** Reliably receive and queue messages from WhatsApp.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Message Bus** | Dedicated queue (`internal/gateway`) | Integrated | Simple asyncio.Queue |
| **Dedup** | In-memory 60s TTL | ? | None |
| **Priority Commands** | ? | ? | `/stop` bypasses queue |
| **Concurrency Control** | ? | ? | Semaphore (max 3 concurrent) |

**Best Patterns:**
- **Dedup gate** (fastclaw): Prevent duplicate processing
- **Priority commands** (nanobot): `/stop` bypasses normal queue
- **Concurrency limiter** (nanobot): Prevent resource exhaustion

**Recommendation:**
```
Phase 1 Components:
  ├─ WhatsApp Webhook → InboundMessage
  ├─ Dedup Gate (60s TTL, hash-based)
  ├─ Priority Command Router (/stop, /clear)
  ├─ Message Queue (asyncio.Queue)
  └─ Concurrency Gate (semaphore, configurable max)
```

---

### Phase 2: Identity Stability

**Goal:** Consistent identity, memory, and persona.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **System Prompt** | Single file | ? | ContextBuilder |
| **Bootstrap Files** | ? | ? | AGENTS.md, SOUL.md, USER.md, TOOLS.md |
| **Memory Files** | MEMORY.md, USER.md, HISTORY.md | ? | MEMORY.md, HISTORY.md |
| **Memory Search** | FTS5 (DB) | Hybrid (vector + FTS5) | None |

**Best Patterns:**
- **Bootstrap files** (nanobot): Modular identity components
- **Hybrid search** (gloamy): Vector + keyword fusion
- **Heartbeat review** (fastclaw): Periodic memory update

**Recommendation:**
```
Phase 2 Components:
  ├─ SOUL.md (core identity)
  ├─ MEMORY.md (long-term facts)
  ├─ HISTORY.md (searchable log with [YYYY-MM-DD HH:MM] timestamps)
  ├─ Hybrid Search Index (vector embeddings + FTS5)
  └─ Heartbeat Review (every 24 hours, consolidate HISTORY → MEMORY)
```

---

### Phase 3: Prompt Hot-Swap Foundation

**Goal:** Update prompts without restart.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Hot Reload** | Plugin reload | ? | File watcher for skills |
| **Hooks** | 7 lifecycle points | ? | CompositeHook |

**Best Patterns:**
- **Hook system** (fastclaw): Inject custom logic without core changes
- **File watcher** (nanobot): Auto-reload on external file changes

**Recommendation:**
```
Phase 3 Components:
  ├─ File Watcher (SOUL.md, MEMORY.md, policy.yaml)
  ├─ Hook Registry:
  │   ├─ before_prompt(context) → str
  │   ├─ after_prompt(context) → str
  │   ├─ before_model_call(messages) → messages
  │   └─ after_model_call(response) → response
  └─ Hot Reload: detect mtime changes, invalidate cache
```

---

### Phase 4: Debug And Trace Foundation

**Goal:** Full observability of agent execution.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Execution Log** | Memory logs (DB) | Task checkpoints | Tool events |
| **Tool Tracing** | ? | ExecutionCheckpointItem | CronRunRecord (last 20) |
| **Usage Tracking** | ? | ? | Per-turn token usage |

**Best Patterns:**
- **Execution checkpoints** (gloamy): Tool-by-tool execution trace
- **Tool events** (nanobot): {name, status, detail} compact format
- **Run history** (nanobot): Last 20 executions with timestamps

**Recommendation:**
```
Phase 4 Components:
  ├─ Execution Trace:
  │   ├─ turn_id, timestamp, user_message
  │   ├─ tool_calls: [{name, args, result, status, duration_ms}]
  │   └─ llm_usage: {prompt_tokens, completion_tokens, cached_tokens}
  ├─ Tool Event Log (rolling buffer, last 100)
  └─ Debug Endpoint: GET /trace/{turn_id} → full execution detail
```

---

### Phase 5: Task Memory And Lifecycle

**Goal:** Track multi-step tasks with resumability.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Task Model** | None | TaskRecord (full) | None |
| **Checkpoints** | None | ExecutionCheckpointItem | None |
| **Resumability** | None | Strip XML for resume | Legal boundary detection |
| **Status** | None | Running/Completed/Failed/Cancelled/TimedOut | None |
| **Consolidation** | LLM extract | ? | Token-aware + fallback |

**Best Patterns:**
- **Task record** (gloamy): Explicit task lifecycle
- **Checkpoints** (gloamy): Resumable execution state
- **Legal boundaries** (nanobot): Avoid orphan tool results
- **Token-aware consolidation** (nanobot): Prevent context overflow
- **Fallback** (nanobot): Raw-archive after 3 failures

**Recommendation:**
```
Phase 5 Components:
  ├─ Task Store:
  │   ├─ task_id, thread_id, status
  │   ├─ charter (what to do)
  │   ├─ snapshot (current state)
  │   ├─ events (append-only log)
  │   └─ checkpoints (resumable state)
  ├─ Consolidation:
  │   ├─ Trigger: when estimated_tokens > safe_budget
  │   ├─ LLM extract → MEMORY.md + HISTORY.md
  │   ├─ Fallback: raw-archive after 3 failures
  │   └─ Loop: consolidate until prompt fits
  └─ Legal Boundary Detection:
      └─ Align session slices to avoid orphan tool results
```

---

### Phase 6: Planner And Action Contracts

**Goal:** Structured planning with tool contracts.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Tool Registry** | Source tracking | Trait-based | Schema validation |
| **Schema** | OpenAI format | Trait-generated | OpenAI format |
| **Validation** | Manual | Compile-time | Runtime (cast + validate) |
| **Error Hints** | None | Recovery hints | "[Analyze error...]" |

**Best Patterns:**
- **Schema validation** (nanobot): Validate before execute
- **Parameter casting** (nanobot): Auto-coerce types
- **Error hints** (gloamy + nanobot): Guide LLM recovery
- **Source tracking** (fastclaw): Builtin vs. MCP vs. Plugin

**Recommendation:**
```
Phase 6 Components:
  ├─ Tool Registry:
  │   ├─ register(tool, source="builtin|mcp|plugin")
  │   ├─ get_definitions() → OpenAI format
  │   ├─ execute(name, params):
  │   │   ├─ cast_params(params) → typed
  │   │   ├─ validate_params(params) → errors[]
  │   │   ├─ await tool.execute(**params)
  │   │   └─ if error: append "[Analyze error and retry]"
  │   └─ get_contract(name) → schema + examples
  └─ Failure Classification:
      └─ classify_tool_error(output) → TRANSIENT | PERMANENT | USER_INPUT
```

---

### Phase 7: Execution Policy/Scheduler/Retry

**Goal:** Safe execution with scheduling and retry.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Policy** | YAML (filesystem, network, tools) | Autonomy levels + rate limit | SSRF protection |
| **Scheduler** | Polling + distributed locks | Concurrent + backoff | Timer-based |
| **Retry** | None | Exponential backoff + jitter | None |
| **Rate Limit** | None | Sliding window | None |

**Best Patterns:**
- **YAML policy** (fastclaw): Human-readable configuration
- **Autonomy levels** (gloamy): ReadOnly/Supervised/Full
- **Rate limiting** (gloamy): Sliding window per action type
- **Timer-based scheduling** (nanobot): Efficient for sparse jobs
- **Retry with backoff** (gloamy): Transient failure recovery
- **SSRF protection** (nanobot): Block private IPs

**Recommendation:**
```
Phase 7 Components:
  ├─ Policy Engine (policy.yaml):
  │   ├─ autonomy_level: readonly | supervised | full
  │   ├─ filesystem: {allow_write, deny_write, allow_read, deny_read}
  │   ├─ network: {allow_hosts, deny_hosts, block_private_ips: true}
  │   ├─ tools: {deny, require_approval}
  │   └─ rate_limits: {max_actions_per_minute: 60, window_seconds: 60}
  ├─ Scheduler:
  │   ├─ Timer-based awakening (compute next-run across all jobs)
  │   ├─ Schedule types: at (timestamp) | every (interval) | cron (expr + tz)
  │   ├─ One-shot auto-delete
  │   ├─ Run history (last 20 executions)
  │   └─ Hot reload (external file modification)
  ├─ Retry Logic:
  │   ├─ classify_failure(error) → TRANSIENT | PERMANENT
  │   ├─ if TRANSIENT: retry with exponential backoff (1s, 2s, 4s, 8s) + jitter
  │   └─ max_retries: 3
  └─ SSRF Protection:
      └─ Block: 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16
```

---

### Phase 8: End-To-End Validation

**Goal:** Ensure system works reliably end-to-end.

| Component | fastclaw | gloamy | nanobot |
|-----------|----------|--------|---------|
| **Streaming** | ? | ? | Full (delta relay + segments) |
| **Think Tag Stripping** | ? | ? | Real-time from stream |
| **Multi-Channel** | ✓ (WhatsApp, Telegram, CLI) | ✓ (WhatsApp) | ✓ (WhatsApp, CLI) |
| **Session Isolation** | Per channel:chat_id | ? | Per-session locks |

**Best Patterns:**
- **Streaming** (nanobot): Real-time delta relay
- **Think stripping** (nanobot): Hide `<think>` from user
- **Session locks** (nanobot): Serial per-session, concurrent cross-session

**Recommendation:**
```
Phase 8 Components:
  ├─ Streaming Protocol:
  │   ├─ on_stream(delta) → strip_think(delta) → send to user
  │   ├─ on_stream_end(resuming) → signal phase complete
  │   └─ segment_id: {base_id}:{segment} for multi-phase responses
  ├─ Session Isolation:
  │   ├─ Lock per session_key (serial within session)
  │   └─ Concurrent across sessions (up to semaphore limit)
  ├─ Multi-Channel Support:
  │   ├─ WhatsApp (primary)
  │   ├─ CLI (development/testing)
  │   └─ Extensible channel interface
  └─ Integration Tests:
      ├─ End-to-end: user message → WhatsApp → agent → response
      ├─ Multi-step task with checkpoints
      ├─ Memory consolidation under token pressure
      ├─ Policy enforcement (deny, approve, rate limit)
      └─ Cron job execution + retry
```

---

## 10. Superior Patterns Summary

| Pattern | Source | Impact | Recommendation |
|---------|--------|--------|----------------|
| **Execution Checkpointing** | gloamy | High | Add to Phase 5: checkpoint layer for resumability |
| **Failure Classification** | gloamy | High | Add to Phase 7: structured error categorization |
| **Hybrid Memory Search** | gloamy | Medium | Add to Phase 2: vector + FTS5 fusion |
| **Hook System** | fastclaw | Medium | Add to Phases 3, 6: extensibility points |
| **Legal Boundary Detection** | nanobot | High | Add to Phase 5: avoid orphan tool results |
| **Token-Aware Consolidation** | nanobot | High | Add to Phase 5: prevent context overflow |
| **Graceful Degradation** | nanobot | Medium | Add to Phase 5: fallback on LLM failure |
| **Streaming Support** | nanobot | Medium | Add to Phase 8: real-time user feedback |
| **Tool Loop Detection** | fastclaw | Low | Add to Phase 6: prevent infinite cycles |
| **Autonomy Levels** | gloamy | High | Add to Phase 7: ReadOnly/Supervised/Full |
| **Rate Limiting** | gloamy | Medium | Add to Phase 7: sliding window protection |
| **SSRF Protection** | nanobot | High | Add to Phase 7: block private IPs |
| **Timer-Based Scheduling** | nanobot | Medium | Add to Phase 7: efficient job awakening |
| **Retry with Backoff** | gloamy | Medium | Add to Phase 7: exponential backoff + jitter |
| **Source Tracking** | fastclaw | Low | Add to Phase 6: builtin vs. MCP vs. plugin |

---

## 11. Recommendations for Build Plan Enhancements

### 11.1 Add Phase 5.5: Checkpoint And Resume

**Insert between Phase 5 and Phase 6:**

**Goal:** Enable resumable multi-step tasks with checkpoint/restore.

**Components:**
- Checkpoint records at each tool execution
- Resumable history generation (strip tool-call tags)
- Task status tracking (Running/Completed/Failed/TimedOut)
- Failure classification for smart recovery

**Justification:** gloamy proves this is essential for reliability. Your current plan defines task events but not resumability.

---

### 11.2 Enhance Phase 7: Add Failure Classifier

**Current:** "Execution Policy/Scheduler/Retry"

**Enhanced:** "Execution Policy/Scheduler/Retry/Failure Recovery"

**Add:**
```python
class FailureClassifier:
    def classify(self, error: str) -> FailureType:
        # TRANSIENT: retry with backoff
        # PERMANENT: fail immediately
        # USER_INPUT: ask user for clarification
        # SEMANTIC: LLM misunderstood, rephrase
```

---

### 11.3 Enhance Phase 2: Add Hybrid Memory Search

**Current:** "Identity Stability" mentions memory but not search.

**Add:**
```
Memory Search:
  ├─ Vector Index (embeddings for semantic search)
  ├─ FTS5 Index (keyword search)
  └─ Fusion (Reciprocal Rank Fusion, configurable weights)
```

---

### 11.4 Enhance Phase 5: Add Token-Aware Consolidation

**Current:** "Task Memory And Lifecycle" doesn't specify when to consolidate.

**Add:**
```python
async def maybe_consolidate(session):
    budget = context_window - max_completion - safety_buffer
    target = budget // 2
    estimated = estimate_tokens(session)
    
    if estimated > budget:
        while estimated > target:
            chunk = pick_consolidation_boundary(session)
            await consolidate_with_fallback(chunk)
            estimated = estimate_tokens(session)
```

---

### 11.5 Add Phase 3.5: Hook System

**Insert between Phase 3 and Phase 4:**

**Goal:** Extensibility without forking core code.

**Hooks:**
- `before_prompt(context) → str`: Modify system prompt
- `after_prompt(context) → str`: Post-process prompt
- `before_tool(name, args) → (name, args)`: Intercept tool calls
- `after_tool(name, result) → result`: Post-process tool results
- `before_model_call(messages) → messages`: Modify messages before LLM
- `after_model_call(response) → response`: Post-process LLM output

---

## 12. Technology Stack Recommendations

### Language Choice

**For WhatsApp AI Employee:**

| Language | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Python** | Rapid iteration, rich ecosystem (LangChain, OpenAI SDK), nanobot proves it works | Performance, type safety | **RECOMMENDED** for MVP |
| **Go** | Production-grade, fastclaw proves scalability, compiled performance | Slower iteration, smaller AI ecosystem | Consider for production rewrite |
| **Rust** | Maximum safety, gloamy shows best patterns, zero-cost abstractions | Steep learning curve, slower development | Not recommended for first version |

**Recommendation:** Start with Python (nanobot-style), consider Go port after MVP validation.

---

### Database Choice

**For Task/Memory Storage:**

| Database | fastclaw | gloamy | nanobot | Verdict |
|----------|----------|--------|---------|---------|
| **SQLite** | ✓ | ✓ | ✗ (JSONL files) | **RECOMMENDED** for single-instance |
| **PostgreSQL** | ✓ | ✗ | ✗ | Use if distributed/multi-instance |
| **Files (JSONL)** | ✗ | ✗ | ✓ | Too simple for production |

**Recommendation:** SQLite for MVP (easy, no external deps), PostgreSQL for scale.

---

### Architecture Choice

**Recommended Hybrid:**

```
nanobot's simplicity (core loop)
  + gloamy's checkpoint pattern (resumability)
  + fastclaw's hook system (extensibility)
  + gloamy's hybrid memory search (retrieval)
  + nanobot's streaming (UX)
```

---

## 13. Implementation Priority

### Phase 1: Core Agent (Weeks 1-2)
1. ✓ Message intake from WhatsApp
2. ✓ Simple agent loop (nanobot pattern)
3. ✓ Basic tool registry
4. ✓ Session persistence (JSONL)

### Phase 2: Memory (Week 3)
1. Dual-layer memory (MEMORY.md + HISTORY.md)
2. Token-aware consolidation
3. Fallback to raw-archive

### Phase 3: Checkpoints (Week 4)
1. Task store (SQLite)
2. Execution checkpoints
3. Resumable history
4. Legal boundary detection

### Phase 4: Safety (Week 5)
1. Policy engine (YAML)
2. SSRF protection
3. Autonomy levels
4. Rate limiting

### Phase 5: Scheduling (Week 6)
1. Timer-based cron
2. One-shot jobs
3. Retry with backoff
4. Failure classification

### Phase 6: Search (Week 7)
1. Vector embeddings (OpenAI)
2. FTS5 index
3. Hybrid fusion

### Phase 7: Hooks & Streaming (Week 8)
1. Hook system
2. Streaming protocol
3. Think-tag stripping

---

## 14. Code Examples for Build Plan

### 14.1 Checkpoint Pattern (from gloamy)

```python
@dataclass
class ExecutionCheckpoint:
    tool_name: str
    status: str  # "ok" | "error"
    detail: str
    timestamp: int

@dataclass
class TaskRecord:
    task_id: str
    status: str  # "running" | "completed" | "failed"
    execution_history: list[dict]
    resumable_history: list[dict]  # XML-stripped
    checkpoints: list[ExecutionCheckpoint]

def build_checkpoint_note(checkpoints: list[ExecutionCheckpoint]) -> str:
    """Build LLM-readable checkpoint note."""
    lines = ["## Execution Checkpoint\n"]
    
    successes = [c for c in checkpoints if c.status == "ok"]
    failures = [c for c in checkpoints if c.status == "error"]
    
    if successes:
        lines.append("### Completed:")
        for c in successes:
            lines.append(f"- {c.tool_name}: {c.detail}")
    
    if failures:
        lines.append("\n### Failures:")
        for c in failures:
            failure_type = classify_failure(c.detail)
            hint = get_recovery_hint(failure_type)
            lines.append(f"- {c.tool_name}: {c.detail}")
            lines.append(f"  Recovery: {hint}")
    
    return "\n".join(lines)
```

---

### 14.2 Token-Aware Consolidation (from nanobot)

```python
async def maybe_consolidate_by_tokens(session: Session):
    budget = CONTEXT_WINDOW - MAX_COMPLETION - SAFETY_BUFFER
    target = budget // 2
    
    estimated = estimate_prompt_tokens(session)
    
    if estimated < budget:
        return  # No consolidation needed
    
    for round in range(MAX_CONSOLIDATION_ROUNDS):
        if estimated <= target:
            break
        
        # Pick user-turn boundary
        boundary = pick_consolidation_boundary(session, estimated - target)
        if not boundary:
            break
        
        chunk = session.messages[session.last_consolidated:boundary]
        
        # LLM consolidation with fallback
        if not await consolidate_with_fallback(chunk):
            break
        
        session.last_consolidated = boundary
        save_session(session)
        
        estimated = estimate_prompt_tokens(session)

async def consolidate_with_fallback(messages: list) -> bool:
    for attempt in range(3):
        try:
            result = await llm_consolidate(messages)
            append_to_memory(result.memory_update)
            append_to_history(result.history_entry)
            return True
        except Exception as e:
            logger.warning(f"Consolidation attempt {attempt+1} failed: {e}")
    
    # Fallback: raw-archive
    raw_archive_to_history(messages)
    return True
```

---

### 14.3 Legal Boundary Detection (from nanobot)

```python
def find_legal_start(messages: list[dict]) -> int:
    """Find first index where every tool result has a matching tool_call."""
    declared_ids: set[str] = set()
    start_index = 0
    
    for i, msg in enumerate(messages):
        role = msg.get("role")
        
        if role == "assistant":
            # Record all tool_call IDs
            for tc in msg.get("tool_calls") or []:
                if tc.get("id"):
                    declared_ids.add(tc["id"])
        
        elif role == "tool":
            # Check if tool_call_id was declared
            tc_id = msg.get("tool_call_id")
            if tc_id and tc_id not in declared_ids:
                # Orphan tool result - restart from next message
                start_index = i + 1
                declared_ids.clear()
                
                # Re-scan to rebuild declared_ids
                for prev_msg in messages[start_index:i+1]:
                    if prev_msg.get("role") == "assistant":
                        for tc in prev_msg.get("tool_calls") or []:
                            if tc.get("id"):
                                declared_ids.add(tc["id"])
    
    return start_index
```

---

### 14.4 Failure Classification (from gloamy)

```python
from enum import Enum

class FailureType(Enum):
    UNKNOWN_TOOL = "unknown_tool"
    PERMISSION = "permission_or_policy"
    TRANSIENT = "transient_or_rate_limit"
    SEMANTIC = "semantic_misunderstanding"
    USER_INPUT = "user_clarification_needed"
    NOT_FOUND = "resource_not_found"
    UNCLASSIFIED = "unclassified"

def classify_tool_failure(output: str) -> FailureType:
    lower = output.lower()
    
    if "unknown tool" in lower or "not found" in lower and "tool" in lower:
        return FailureType.UNKNOWN_TOOL
    
    if "permission denied" in lower or "access denied" in lower or "policy" in lower:
        return FailureType.PERMISSION
    
    if "timeout" in lower or "rate limit" in lower or "too many requests" in lower:
        return FailureType.TRANSIENT
    
    if "api key" in lower or"authentication" in lower or "unauthorized" in lower:
        return FailureType.TRANSIENT
    
    if "file not found" in lower or "no such file" in lower or "404" in lower:
        return FailureType.NOT_FOUND
    
    if "clarify" in lower or "which" in lower or "more information" in lower:
        return FailureType.USER_INPUT
    
    return FailureType.UNCLASSIFIED

def get_recovery_hint(failure_type: FailureType) -> str:
    hints = {
        FailureType.UNKNOWN_TOOL: "Tool doesn't exist. Check available tools.",
        FailureType.PERMISSION: "Access denied. Check policy or use different approach.",
        FailureType.TRANSIENT: "Temporary failure. Retry with exponential backoff.",
        FailureType.SEMANTIC: "Tool was misused. Re-read documentation and retry.",
        FailureType.USER_INPUT: "Missing required info. Ask user for clarification.",
        FailureType.NOT_FOUND: "Resource doesn't exist. Verify path/URL and retry.",
        FailureType.UNCLASSIFIED: "Unknown error. Analyze message and try different approach.",
    }
    return hints.get(failure_type, "Unknown failure type")
```

---

### 14.5 Hook System (from fastclaw)

```python
class AgentHook:
    async def before_system_prompt(self, context: dict) -> str | None:
        """Modify system prompt before building."""
        return None
    
    async def after_system_prompt(self, context: dict, prompt: str) -> str:
        """Post-process system prompt."""
        return prompt
    
    async def before_model_call(self, context: dict, messages: list) -> list:
        """Modify messages before LLM call."""
        return messages
    
    async def after_model_call(self, context: dict, response: dict) -> dict:
        """Post-process LLM response."""
        return response
    
    async def before_tool_call(self, context: dict, name: str, args: dict) -> tuple[str, dict]:
        """Intercept tool call."""
        return name, args
    
    async def after_tool_call(self, context: dict, name: str, result: Any) -> Any:
        """Post-process tool result."""
        return result
    
    async def post_turn(self, context: dict) -> None:
        """After complete turn (thought + tools + final response)."""
        pass

class HookRegistry:
    def __init__(self):
        self.hooks: list[AgentHook] = []
    
    def register(self, hook: AgentHook):
        self.hooks.append(hook)
    
    async def run_before_system_prompt(self, context: dict) -> str | None:
        for hook in self.hooks:
            result = await hook.before_system_prompt(context)
            if result:
                return result
        return None
    
    async def run_after_system_prompt(self, context: dict, prompt: str) -> str:
        for hook in self.hooks:
            prompt = await hook.after_system_prompt(context, prompt)
        return prompt
    
    # ... similar for other hooks
```

---

## 15. Conclusion

### Key Takeaways

1. **All three repositories converge on core patterns:**
   - ReAct agent loop
   - Dual-layer memory (short-term + long-term)
   - Tool registry with schema validation
   - Session persistence
   - Cron scheduling

2. **Each repository excels in different areas:**
   - **fastclaw**: Production infrastructure, hook system, distributed scheduling
   - **gloamy**: Resumability, failure classification, hybrid search, autonomy levels
   - **nanobot**: Simplicity, streaming, token-awareness, graceful degradation

3. **Superior patterns to adopt:**
   - Execution checkpointing (gloamy)
   - Failure classification (gloamy)
   - Legal boundary detection (nanobot)
   - Token-aware consolidation (nanobot)
   - Hybrid memory search (gloamy)
   - Hook system (fastclaw)
   - SSRF protection (nanobot)
   - Autonomy levels (gloamy)

4. **Build plan enhancements recommended:**
   - Add Phase 5.5: Checkpoint And Resume
   - Enhance Phase 2: Hybrid Memory Search
   - Enhance Phase 5: Token-Aware Consolidation + Legal Boundaries
   - Add Phase 3.5: Hook System
   - Enhance Phase 7: Failure Classification + Retry with Backoff

5. **Technology recommendation:**
   - **Language**: Python for MVP (nanobot pattern), Go for production scale
   - **Database**: SQLite for single-instance, PostgreSQL for distributed
   - **Architecture**: Hybrid of nanobot's simplicity + gloamy's robustness + fastclaw's extensibility

### Final Assessment

Your 8-phase build plan is **solid and comprehensive** but can be significantly strengthened by adopting the superior patterns identified in this research. The most critical additions are:

1. **Execution checkpointing** (Phase 5.5) - Enables resumability
2. **Failure classification** (Phase 7) - Smart retry logic
3. **Token-aware consolidation** (Phase 5) - Prevents context overflow
4. **Legal boundary detection** (Phase 5) - Avoids provider errors
5. **Hybrid memory search** (Phase 2) - Better retrieval

These enhancements will make your WhatsApp AI Employee more **reliable, resumable, and production-ready** than any of the three repositories individually.

---

## Appendices

### Appendix A: Repository Statistics

| Repository | Language | Stars | Commits | Contributors | Last Update |
|------------|----------|-------|---------|--------------|-------------|
| fastclaw | Go | Unknown | 500+ | 3+ | Active |
| gloamy | Rust | Unknown | 1000+ | 5+ | Active |
| nanobot | Python | Unknown | 300+ | 2+ | Very Active (daily) |

### Appendix B: File Structure Comparison

**fastclaw:**
```
internal/
  ├─ agent/
  │   ├─ loop.go (836 lines) - ReAct loop
  │   ├─ memory.go (290 lines) - Dual-layer memory
  │   └─ tools/registry.go (113 lines)
  ├─ cron/scheduler.go (355 lines)
  ├─ policy/engine.go (199 lines)
  ├─ session/manager.go (261 lines)
  └─ store/database.go (614 lines)
```

**gloamy:**
```
src/
  ├─ agent/
  │   ├─ loop_.rs (6486 lines) - ReAct with checkpoints
  │   └─ task_store.rs (906 lines)
  ├─ memory/sqlite.rs (1901 lines) - Hybrid search
  ├─ security/policy.rs (2350 lines) - Autonomy + rate limit
  ├─ cron/scheduler.rs (1018 lines)
  └─ sop/engine.rs (1632 lines) - SOP workflows
```

**nanobot:**
```
nanobot/
  ├─ agent/
  │   ├─ loop.py (676 lines) - Clean separation
  │   ├─ runner.py (235 lines) - Pure execution
  │   ├─ memory.py (367 lines) - Consolidation + fallback
  │   └─ context.py (201 lines) - Bootstrap + skills
  ├─ cron/service.py (410 lines) - Timer-based
  ├─ security/network.py (105 lines) - SSRF protection
  └─ session/manager.py (269 lines) - Legal boundaries
```

### Appendix C: External Dependencies

**fastclaw (Go):**
- PostgreSQL/SQLite drivers
- OpenAI SDK
- Cron parser

**gloamy (Rust):**
- tokio (async runtime)
- sqlx (database)
- serde (serialization)
- embedding model (?)

**nanobot (Python):**
- openai
- anthropic
- croniter
- loguru

---

**Report Generated:** 2026-04-02  
**Analyzed Repositories:** fastclaw, gloamy, nanobot  
**For Project:** WhatsApp AI Employee (8-Phase Build Plan)  
**Total Analysis Time:** ~4 hours
