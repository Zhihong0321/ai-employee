export function renderAgentLabPage(input: {
  botName: string;
  provider: string;
  model: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Lab</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe8;
        --panel: rgba(255, 251, 245, 0.94);
        --panel-strong: #fffdf9;
        --ink: #1d1915;
        --muted: #6f665b;
        --accent: #176b87;
        --accent-2: #d9edf4;
        --accent-3: #c96d42;
        --ok: #2f7d4a;
        --warn: #9a5b1a;
        --border: #ddd1c2;
        --shadow: rgba(67, 47, 23, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
        background:
          radial-gradient(circle at top left, #fff8ee, transparent 28%),
          radial-gradient(circle at top right, #e2f1f6, transparent 26%),
          linear-gradient(180deg, #f8f4ee 0%, var(--bg) 100%);
      }
      a { color: var(--accent); }
      .wrap {
        max-width: 1440px;
        margin: 0 auto;
        padding: 28px 18px 42px;
      }
      .hero {
        margin-bottom: 22px;
      }
      .hero h1 {
        margin: 0 0 8px;
        font-size: 42px;
        line-height: 1.02;
      }
      .hero p,
      .meta,
      .helper,
      .empty {
        color: var(--muted);
      }
      .meta {
        font-size: 14px;
      }
      .top-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .top-links a {
        text-decoration: none;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.75);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(340px, 420px) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }
      .stack {
        display: grid;
        gap: 18px;
      }
      .main-grid {
        display: grid;
        gap: 18px;
      }
      .two-up {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: 0 16px 40px var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(8px);
      }
      .card-head {
        padding: 18px 18px 0;
      }
      .card-body {
        padding: 18px;
      }
      .card-title {
        margin: 0 0 6px;
        font-size: 25px;
      }
      .field {
        margin-top: 14px;
      }
      .field label {
        display: block;
        margin-bottom: 7px;
        font-size: 14px;
        font-weight: 700;
      }
      input,
      textarea,
      button {
        font: inherit;
      }
      input,
      textarea {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px 14px;
        color: var(--ink);
        background: #fff;
      }
      textarea {
        min-height: 180px;
        resize: vertical;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font-weight: 700;
        color: white;
        background: var(--accent);
        cursor: pointer;
      }
      button.secondary {
        background: #6f665b;
      }
      button:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .status {
        margin-top: 14px;
        min-height: 22px;
        color: var(--muted);
      }
      .reply {
        white-space: pre-wrap;
        background: var(--panel-strong);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        min-height: 120px;
      }
      .pill-row,
      .summary-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: #fff;
      }
      .summary-grid {
        margin-top: 12px;
      }
      .summary-box {
        min-width: 170px;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 12px 14px;
      }
      .summary-box strong {
        display: block;
        font-size: 22px;
        margin-top: 4px;
      }
      .list {
        display: grid;
        gap: 12px;
      }
      .item {
        background: var(--panel-strong);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
      }
      .item h3,
      .item h4 {
        margin: 0 0 6px;
        font-size: 18px;
      }
      .item p {
        margin: 0;
        white-space: pre-wrap;
      }
      .item .meta {
        margin-top: 8px;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        min-height: 80px;
        overflow-x: auto;
      }
      .mono {
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 13px;
      }
      .log-item {
        border-left: 4px solid var(--accent);
      }
      .log-item.warn {
        border-left-color: var(--warn);
      }
      .log-item.error {
        border-left-color: #a33d3d;
      }
      .chat-message {
        border-radius: 18px;
        padding: 12px 14px;
        border: 1px solid var(--border);
      }
      .chat-message.outbound {
        background: var(--accent-2);
      }
      .chat-message.inbound {
        background: #fff;
      }
      @media (max-width: 1120px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 820px) {
        .two-up,
        .row {
          grid-template-columns: 1fr;
        }
        .hero h1 {
          font-size: 34px;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <h1>Agent Lab</h1>
        <p>Type an instruction, run the local agent path, and inspect what the AI decided to do before anything touches WhatsApp.</p>
        <div class="meta">Bot name: ${escapeHtml(input.botName)} | Router: ${escapeHtml(input.provider)} / ${escapeHtml(input.model)}</div>
        <div class="top-links">
          <a href="/playground/gemini">Gemini Playground</a>
          <a href="/playground/llm/config">LLM Config</a>
          <a href="/health">Health</a>
          <a href="/health/full">Full Health</a>
        </div>
      </section>

      <div class="layout">
        <section class="stack">
          <article class="card">
            <div class="card-head">
              <h2 class="card-title">Run Local Instruction</h2>
              <div class="helper">This uses the planner and reply path only. No WhatsApp connection is needed, and outbound actions stay as previews.</div>
            </div>
            <div class="card-body">
              <form id="labForm">
                <div class="row">
                  <div class="field">
                    <label for="senderName">Sender Name</label>
                    <input id="senderName" value="Local Operator" />
                  </div>
                  <div class="field">
                    <label for="senderNumber">Sender Number Key</label>
                    <input id="senderNumber" value="601100000001" />
                  </div>
                </div>
                <div class="field">
                  <label for="instruction">Instruction</label>
                  <textarea id="instruction" placeholder="Tell the AI what to do...">Please remind the Seremban branch manager tomorrow at 9 AM to send the daily sales report, and tell me what follow-up task you would create.</textarea>
                </div>
                <div class="button-row">
                  <button id="runButton" type="submit">Run Agent</button>
                  <button id="refreshButton" class="secondary" type="button">Refresh Overview</button>
                </div>
                <div id="statusBox" class="status">Ready.</div>
              </form>
            </div>
          </article>

          <article class="card">
            <div class="card-head">
              <h2 class="card-title">Latest Reply</h2>
              <div class="helper">This is the direct response draft generated for your instruction.</div>
            </div>
            <div class="card-body">
              <div id="replyBox" class="reply">Run the agent to see the reply draft here.</div>
            </div>
          </article>

          <article class="card">
            <div class="card-head">
              <h2 class="card-title">Conversation Trace</h2>
              <div class="helper">Recent local messages for this simulated operator.</div>
            </div>
            <div class="card-body">
              <div id="messagesBox" class="list">
                <div class="empty">No local transcript yet.</div>
              </div>
            </div>
          </article>
        </section>

        <section class="main-grid">
          <article class="card">
            <div class="card-head">
              <h2 class="card-title">Run Snapshot</h2>
              <div class="helper">High-level outcome of the latest simulation run.</div>
            </div>
            <div class="card-body">
              <div id="snapshotPills" class="pill-row"></div>
              <div id="summaryGrid" class="summary-grid"></div>
            </div>
          </article>

          <div class="two-up">
            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Structured Plan</h2>
              </div>
              <div class="card-body">
                <pre id="planBox" class="mono">No run yet.</pre>
              </div>
            </article>

            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Recent Context</h2>
              </div>
              <div class="card-body">
                <pre id="contextBox" class="mono">No run yet.</pre>
              </div>
            </article>
          </div>

          <div class="two-up">
            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Selected Skills</h2>
                <div class="helper">Active Skill.md packs chosen for this planning run.</div>
              </div>
              <div class="card-body">
                <div id="selectedSkillsBox" class="list">
                  <div class="empty">No selected skills yet.</div>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Skill Selection Trace</h2>
                <div class="helper">Every active skill considered, with score and selection reason.</div>
              </div>
              <div class="card-body">
                <div id="consideredSkillsBox" class="list">
                  <div class="empty">No skill selection trace yet.</div>
                </div>
              </div>
            </article>
          </div>

          <div class="two-up">
            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Tasks Created</h2>
                <div class="helper">The task records and task events produced by the latest run.</div>
              </div>
              <div class="card-body">
                <div id="tasksBox" class="list">
                  <div class="empty">No tasks yet.</div>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Tool Output Preview</h2>
                <div class="helper">Any web search or company-query output that informed the reply.</div>
              </div>
              <div class="card-body">
                <pre id="toolOutputBox" class="mono">No tool calls yet.</pre>
              </div>
            </article>
          </div>

          <div class="two-up">
            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Decision Logs</h2>
              </div>
              <div class="card-body">
                <div id="decisionLogsBox" class="list">
                  <div class="empty">No decision logs yet.</div>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="card-head">
                <h2 class="card-title">Debug Trace</h2>
                <div class="helper">Forced run logs so you can inspect planner stages even when debug mode is otherwise off.</div>
              </div>
              <div class="card-body">
                <div id="debugLogsBox" class="list">
                  <div class="empty">No debug records yet.</div>
                </div>
              </div>
            </article>
          </div>

          <article class="card">
            <div class="card-head">
              <h2 class="card-title">Recent Global Overview</h2>
              <div class="helper">Quick view of the latest tasks, decision logs, and debug records across the local app state.</div>
            </div>
            <div class="card-body">
              <div class="two-up">
                <div>
                  <h3>Recent Tasks</h3>
                  <div id="recentTasksBox" class="list">
                    <div class="empty">Loading tasks...</div>
                  </div>
                </div>
                <div>
                  <h3>Recent Decision Logs</h3>
                  <div id="recentDecisionLogsBox" class="list">
                    <div class="empty">Loading decision logs...</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>

    <script>
      const form = document.getElementById("labForm");
      const senderNameInput = document.getElementById("senderName");
      const senderNumberInput = document.getElementById("senderNumber");
      const instructionInput = document.getElementById("instruction");
      const runButton = document.getElementById("runButton");
      const refreshButton = document.getElementById("refreshButton");
      const statusBox = document.getElementById("statusBox");
      const replyBox = document.getElementById("replyBox");
      const snapshotPills = document.getElementById("snapshotPills");
      const summaryGrid = document.getElementById("summaryGrid");
      const planBox = document.getElementById("planBox");
      const contextBox = document.getElementById("contextBox");
      const selectedSkillsBox = document.getElementById("selectedSkillsBox");
      const consideredSkillsBox = document.getElementById("consideredSkillsBox");
      const tasksBox = document.getElementById("tasksBox");
      const toolOutputBox = document.getElementById("toolOutputBox");
      const decisionLogsBox = document.getElementById("decisionLogsBox");
      const debugLogsBox = document.getElementById("debugLogsBox");
      const messagesBox = document.getElementById("messagesBox");
      const recentTasksBox = document.getElementById("recentTasksBox");
      const recentDecisionLogsBox = document.getElementById("recentDecisionLogsBox");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        runButton.disabled = true;
        statusBox.textContent = "Running agent...";

        try {
          const response = await fetch("/api/playground/agent-lab/run", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              senderName: senderNameInput.value,
              senderNumber: senderNumberInput.value,
              text: instructionInput.value
            })
          });

          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Agent run failed");
          }

          renderRun(body.result);
          statusBox.textContent = "Run completed.";
          await loadOverview();
        } catch (error) {
          statusBox.textContent = error.message || "Agent run failed";
        } finally {
          runButton.disabled = false;
        }
      });

      refreshButton.addEventListener("click", () => {
        void loadOverview();
      });

      async function loadOverview() {
        try {
          const response = await fetch("/api/playground/agent-lab/overview");
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Failed to load overview");
          }

          renderRecentTasks(body.tasks || []);
          renderRecentDecisionLogs(body.decisionLogs || []);
        } catch (error) {
          recentTasksBox.innerHTML = '<div class="empty">' + escapeHtml(error.message || "Failed to load tasks") + "</div>";
          recentDecisionLogsBox.innerHTML = '<div class="empty">' + escapeHtml(error.message || "Failed to load logs") + "</div>";
        }
      }

      function renderRun(result) {
        replyBox.textContent = result.finalReply || "(empty reply)";
        planBox.textContent = prettyJson(result.plan);
        contextBox.textContent = prettyJson({
          senderProfile: result.senderProfile,
          recentContext: result.recentContext
        });
        toolOutputBox.textContent = prettyJson(result.toolOutputs);

        snapshotPills.innerHTML = "";
        appendPill("Run ID", result.runId);
        appendPill("Message ID", result.messageExternalId);
        appendPill("Sender", result.senderNumber);
        appendPill("Category", result.plan?.category || "unknown");

        summaryGrid.innerHTML = "";
        appendSummary("Tasks", String((result.createdTasks || []).length));
        appendSummary("Decision Logs", String((result.decisionLogs || []).length));
        appendSummary("Debug Logs", String((result.debugRecords || []).length));
        appendSummary("Skills", String((result.selectedSkills || []).length));
        appendSummary("Outbound Preview", String((result.plan?.outboundMessages || []).length));

        renderSelectedSkills(result.selectedSkills || []);
        renderConsideredSkills(result.consideredSkills || []);
        renderTasks(result.createdTasks || []);
        renderDecisionLogs(result.decisionLogs || []);
        renderDebugLogs(result.debugRecords || []);
        renderMessages(result.messages || []);
      }

      function renderSelectedSkills(items) {
        if (!items.length) {
          selectedSkillsBox.innerHTML = '<div class="empty">No active skills matched this run.</div>';
          return;
        }

        selectedSkillsBox.innerHTML = items.map((item) => {
          const allowedTools = Array.isArray(item.allowedTools) && item.allowedTools.length
            ? item.allowedTools.join(", ")
            : "all current local tools";
          const body = item.instructions || prettyJson({
            tags: item.tags || [],
            domains: item.domains || [],
            triggers: item.triggers || []
          });

          return '<div class="item">' +
            '<h3>' + escapeHtml(item.name || item.skillId || "Skill") + '</h3>' +
            '<p>' + escapeHtml(item.description || "") + '</p>' +
            '<div class="meta">' +
              escapeHtml(item.skillId || "unknown-skill") +
              ' | mode: ' + escapeHtml(item.injectionMode || "full") +
              ' | allowed tools: ' + escapeHtml(allowedTools) +
            '</div>' +
            '<pre class="mono">' + escapeHtml(body) + '</pre>' +
          '</div>';
        }).join("");
      }

      function renderConsideredSkills(items) {
        if (!items.length) {
          consideredSkillsBox.innerHTML = '<div class="empty">No skill scoring details were recorded for this run.</div>';
          return;
        }

        consideredSkillsBox.innerHTML = items.map((item) => {
          const reasons = Array.isArray(item.reasons) && item.reasons.length ? item.reasons.join(", ") : "no matches";
          return '<div class="item">' +
            '<h4>' + escapeHtml(item.name || item.skillId || "Skill") + '</h4>' +
            '<p>' + escapeHtml(
              item.selected
                ? "Selected for planner context."
                : item.available
                  ? "Considered but not injected into planner context."
                  : "Skipped because required dependencies are missing."
            ) + '</p>' +
            '<div class="meta">' +
              'score: ' + escapeHtml(item.score) +
              ' | available: ' + escapeHtml(item.available) +
              ' | ' + escapeHtml(item.skillId || "unknown-skill") +
              ' | reasons: ' + escapeHtml(reasons) +
            '</div>' +
          '</div>';
        }).join("");
      }

      function renderTasks(items) {
        if (!items.length) {
          tasksBox.innerHTML = '<div class="empty">No tasks were created in this run.</div>';
          return;
        }

        tasksBox.innerHTML = items.map((item) => {
          const task = item.task || {};
          const events = Array.isArray(item.events) ? item.events : [];
          return '<div class="item">' +
            '<h3>' + escapeHtml(task.title || "Untitled task") + '</h3>' +
            '<p>' + escapeHtml(task.details || "") + '</p>' +
            '<div class="meta">Task #' + escapeHtml(task.id) + ' | status: ' + escapeHtml(task.status || "unknown") + ' | due: ' + escapeHtml(formatDate(task.due_at)) + '</div>' +
            '<pre class="mono">' + escapeHtml(prettyJson(events)) + '</pre>' +
          '</div>';
        }).join("");
      }

      function renderDecisionLogs(items) {
        if (!items.length) {
          decisionLogsBox.innerHTML = '<div class="empty">No decision logs were recorded for this run.</div>';
          return;
        }

        decisionLogsBox.innerHTML = items.map((item) => {
          return '<div class="item log-item">' +
            '<h4>' + escapeHtml(item.decision_type || "decision") + '</h4>' +
            '<p>' + escapeHtml(item.summary || "") + '</p>' +
            '<div class="meta">' + escapeHtml(formatDate(item.created_at)) + '</div>' +
            '<pre class="mono">' + escapeHtml(prettyJson(item.context)) + '</pre>' +
          '</div>';
        }).join("");
      }

      function renderDebugLogs(items) {
        if (!items.length) {
          debugLogsBox.innerHTML = '<div class="empty">No debug records were captured for this run.</div>';
          return;
        }

        debugLogsBox.innerHTML = items.map((item) => {
          const severityClass = item.severity === "error" ? "error" : item.severity === "warn" ? "warn" : "";
          return '<div class="item log-item ' + severityClass + '">' +
            '<h4>' + escapeHtml(item.stage || "stage") + '</h4>' +
            '<p>' + escapeHtml(item.summary || "") + '</p>' +
            '<div class="meta">' + escapeHtml(item.severity || "info") + ' | ' + escapeHtml(formatDate(item.created_at)) + '</div>' +
            '<pre class="mono">' + escapeHtml(prettyJson(item.payload)) + '</pre>' +
          '</div>';
        }).join("");
      }

      function renderMessages(items) {
        if (!items.length) {
          messagesBox.innerHTML = '<div class="empty">No local messages yet.</div>';
          return;
        }

        const sorted = [...items].reverse();
        messagesBox.innerHTML = sorted.map((item) => {
          const direction = item.direction === "outbound" ? "outbound" : "inbound";
          const content = item.text_content || item.transcript || item.analysis || "(empty message)";
          return '<div class="chat-message ' + direction + '">' +
            '<strong>' + escapeHtml(direction === "outbound" ? "${escapeHtml(input.botName)}" : (item.contact_name || senderNameInput.value || item.contact_number || "Local Operator")) + '</strong>' +
            '<div class="meta">' + escapeHtml(formatDate(item.occurred_at)) + ' | ' + escapeHtml(item.kind || "text") + '</div>' +
            '<p>' + escapeHtml(content) + '</p>' +
          '</div>';
        }).join("");
      }

      function renderRecentTasks(items) {
        if (!items.length) {
          recentTasksBox.innerHTML = '<div class="empty">No tasks recorded yet.</div>';
          return;
        }

        recentTasksBox.innerHTML = items.map((task) => {
          return '<div class="item">' +
            '<h4>' + escapeHtml(task.title || "Untitled task") + '</h4>' +
            '<p>' + escapeHtml(task.details || "") + '</p>' +
            '<div class="meta">Task #' + escapeHtml(task.id) + ' | ' + escapeHtml(task.status || "unknown") + ' | updated ' + escapeHtml(formatDate(task.updated_at)) + '</div>' +
          '</div>';
        }).join("");
      }

      function renderRecentDecisionLogs(items) {
        if (!items.length) {
          recentDecisionLogsBox.innerHTML = '<div class="empty">No decision logs recorded yet.</div>';
          return;
        }

        recentDecisionLogsBox.innerHTML = items.map((item) => {
          return '<div class="item">' +
            '<h4>' + escapeHtml(item.decision_type || "decision") + '</h4>' +
            '<p>' + escapeHtml(item.summary || "") + '</p>' +
            '<div class="meta">' + escapeHtml(formatDate(item.created_at)) + '</div>' +
          '</div>';
        }).join("");
      }

      function appendPill(label, value) {
        const node = document.createElement("div");
        node.className = "pill";
        node.innerHTML = "<strong>" + escapeHtml(label) + ":</strong> <span>" + escapeHtml(value || "-") + "</span>";
        snapshotPills.appendChild(node);
      }

      function appendSummary(label, value) {
        const node = document.createElement("div");
        node.className = "summary-box";
        node.innerHTML = "<div class=\\"helper\\">" + escapeHtml(label) + "</div><strong>" + escapeHtml(value || "0") + "</strong>";
        summaryGrid.appendChild(node);
      }

      function prettyJson(value) {
        return JSON.stringify(value == null ? {} : value, null, 2);
      }

      function formatDate(value) {
        if (!value) {
          return "-";
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
      }

      function escapeHtml(value) {
        return String(value == null ? "" : value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      void loadOverview();
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
