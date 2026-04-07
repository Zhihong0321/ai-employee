import express from "express";
import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";
import { LlmRouter } from "../llm/llm-router.js";
import { LlmModelPricingEntry, LlmProviderName } from "../llm/types.js";
import { normalizePhoneNumber, normalizeWhatsAppIdentityUser } from "../lib/phone.js";
import { renderLlmConfigPage } from "./render-llm-config-page.js";
import { renderAgentLabPage } from "./render-agent-lab-page.js";
import { renderAgentIdentityPage } from "./render-agent-identity-page.js";
import { renderAuthorityPolicyPage } from "./render-authority-policy-page.js";
import { renderCompanyDbConfigPage } from "./render-company-db-config-page.js";
import { renderDashboardPage } from "./render-dashboard-page.js";
import { BootstrapService } from "../services/bootstrap-service.js";
import { HealthService } from "../services/health-service.js";
import { WhatsAppOnboardingService } from "../services/whatsapp-onboarding-service.js";
import { WhatsAppPlaygroundService } from "../services/whatsapp-playground-service.js";
import { PromptRegistry } from "../prompts/prompt-registry.js";
import { DebugService } from "../debug/debug-service.js";
import { DebugConfig } from "../debug/types.js";
import { AgentService } from "../services/agent-service.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { AgentIdentityService } from "../services/agent-identity-service.js";
import { AuthorityPolicyService } from "../services/authority-policy-service.js";
import { CompanyDbService } from "../services/company-db-service.js";
import { CompanyDbConfigService } from "../services/company-db-config-service.js";

export function createApp(input: {
  config: AppConfig;
  repository: Repository;
  llmRouter: LlmRouter;
  agentService: AgentService;
  bootstrapService: BootstrapService;
  healthService: HealthService;
  whatsappOnboardingService: WhatsAppOnboardingService;
  whatsappPlaygroundService: WhatsAppPlaygroundService;
  promptRegistry: PromptRegistry;
  skillRegistry: SkillRegistry;
  debugService: DebugService;
  agentIdentityService: AgentIdentityService;
  authorityPolicyService: AuthorityPolicyService;
  companyDbService: CompanyDbService;
  companyDbConfigService: CompanyDbConfigService;
  activateWhatsAppSession?: () => Promise<void>;
  getOwnWhatsappNumber?: () => string | null;
  getWhatsAppRuntimeDiagnostics?: () => Record<string, unknown>;
  listWhatsAppGroups?: () => Promise<any[]>;
  getWhatsAppGroupMetadata?: (chatId: string) => Promise<any>;
}) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const playgroundHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gemini Playground</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe4;
        --panel: #fffaf2;
        --ink: #1e1b16;
        --muted: #6a6257;
        --accent: #b85c38;
        --accent-2: #ecdcc2;
        --border: #dccfb8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, #fff8ec, transparent 35%),
          linear-gradient(180deg, #f9f3e8 0%, var(--bg) 100%);
        color: var(--ink);
      }
      .wrap {
        max-width: 900px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .card {
        background: rgba(255, 250, 242, 0.92);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 12px 40px rgba(71, 52, 24, 0.08);
        backdrop-filter: blur(8px);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 34px;
      }
      p, .meta {
        color: var(--muted);
      }
      .meta {
        margin-bottom: 18px;
        font-size: 14px;
      }
      label {
        display: block;
        margin: 16px 0 8px;
        font-weight: 600;
      }
      textarea, input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
        background: white;
        color: var(--ink);
      }
      textarea {
        min-height: 140px;
        resize: vertical;
      }
      button {
        margin-top: 16px;
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        color: white;
        background: var(--accent);
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--accent-2);
        padding: 16px;
        border-radius: 12px;
        border: 1px solid var(--border);
        min-height: 120px;
      }
      .row {
        display: grid;
        gap: 16px;
      }
      @media (min-width: 760px) {
        .row {
          grid-template-columns: 1fr 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Gemini Playground</h1>
        <div class="meta">Provider: ${input.config.llmRouterProvider} | Model: ${input.config.llmRouterModel}</div>
        <p>This page is for local validation of the LLM router and Gemini path.</p>
        <form id="playground-form">
          <label for="systemPrompt">System prompt</label>
          <textarea id="systemPrompt">You are a concise, helpful assistant used for local LLM testing.</textarea>

          <label for="prompt">Prompt</label>
          <textarea id="prompt" placeholder="Ask Gemini anything...">Reply with a short confirmation that the local Gemini playground is working.</textarea>

          <button id="submitButton" type="submit">Send To Gemini</button>
        </form>

        <div class="row">
          <div>
            <label for="responseBox">Response</label>
            <pre id="responseBox">Waiting for your first prompt...</pre>
          </div>
          <div>
            <label for="statusBox">Status</label>
            <pre id="statusBox">Ready.</pre>
          </div>
        </div>
      </div>
    </div>

    <script>
      const form = document.getElementById("playground-form");
      const systemPrompt = document.getElementById("systemPrompt");
      const prompt = document.getElementById("prompt");
      const responseBox = document.getElementById("responseBox");
      const statusBox = document.getElementById("statusBox");
      const submitButton = document.getElementById("submitButton");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        responseBox.textContent = "";
        statusBox.textContent = "Calling Gemini...";

        try {
          const response = await fetch("/api/playground/gemini", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              systemPrompt: systemPrompt.value,
              prompt: prompt.value
            })
          });

          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Playground request failed");
          }

          responseBox.textContent = body.output || "(empty response)";
          statusBox.textContent = "Success.";
        } catch (error) {
          responseBox.textContent = "";
          statusBox.textContent = error.message || "Unknown error";
        } finally {
          submitButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

  const whatsappOnboardingHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp Onboarding</title>
    <style>
      :root {
        --bg: #eef8f1;
        --panel: #fbfefc;
        --ink: #152118;
        --muted: #56635a;
        --accent: #1f8f55;
        --border: #cfe3d4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top right, #f7fff7, transparent 30%),
          linear-gradient(180deg, #f5fbf6 0%, var(--bg) 100%);
        color: var(--ink);
      }
      .wrap {
        max-width: 900px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .card {
        background: rgba(251, 254, 252, 0.94);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 12px 40px rgba(31, 73, 44, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 34px;
      }
      p, .meta {
        color: var(--muted);
      }
      .meta {
        margin-bottom: 18px;
        font-size: 14px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        color: white;
        background: var(--accent);
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      pre {
        white-space: pre;
        overflow-x: auto;
        background: #f4fbf5;
        padding: 16px;
        border-radius: 12px;
        border: 1px solid var(--border);
        min-height: 160px;
      }
      dl {
        margin: 0;
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 10px 14px;
      }
      dt {
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>WhatsApp Onboarding</h1>
        <div class="meta">Auth directory: ${input.config.whatsappAuthDir}</div>
        <p>Use this page to start a Baileys onboarding session and scan the QR code from your phone.</p>
        <p>If the main WhatsApp gateway is already running elsewhere, stop it first so this onboarding session can own the auth flow cleanly.</p>
        <button id="startButton">Start Onboarding</button>
        <button id="resetButton" style="margin-left:10px;background:#5f6d63;">Reset Session</button>
        <button id="activateButton" style="margin-left:10px;background:#226f5d;">Use for AI Agent</button>

        <div style="height:16px"></div>

        <dl>
          <dt>Status</dt>
          <dd id="statusValue">idle</dd>
          <dt>Detail</dt>
          <dd id="detailValue">Not started</dd>
          <dt>User</dt>
          <dd id="userValue">-</dd>
          <dt>Updated</dt>
          <dd id="updatedValue">-</dd>
        </dl>

        <label style="display:block;margin:18px 0 8px;font-weight:700;">QR</label>
        <pre id="qrBox">Press "Start Onboarding" to begin.</pre>
      </div>
    </div>

    <script>
      const startButton = document.getElementById("startButton");
      const statusValue = document.getElementById("statusValue");
      const detailValue = document.getElementById("detailValue");
      const userValue = document.getElementById("userValue");
      const updatedValue = document.getElementById("updatedValue");
      const qrBox = document.getElementById("qrBox");
      const resetButton = document.getElementById("resetButton");
      const activateButton = document.getElementById("activateButton");

      async function refreshStatus() {
        const response = await fetch("/api/playground/whatsapp/status");
        const state = await response.json();
        statusValue.textContent = state.status || "unknown";
        detailValue.textContent = state.detail || "-";
        userValue.textContent = state.userName || state.userId ? [state.userName, state.userId].filter(Boolean).join(" | ") : "-";
        updatedValue.textContent = state.updatedAt || "-";
        qrBox.textContent = state.qrText || (state.status === "connected" ? "Connected. No QR needed anymore." : "Waiting for QR...");
      }

      startButton.addEventListener("click", async () => {
        startButton.disabled = true;
        qrBox.textContent = "Starting onboarding...";
        try {
          const response = await fetch("/api/playground/whatsapp/start", {
            method: "POST"
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Failed to start onboarding");
          }
        } catch (error) {
          qrBox.textContent = error.message || "Failed to start onboarding";
        } finally {
          startButton.disabled = false;
          await refreshStatus();
        }
      });

      resetButton.addEventListener("click", async () => {
        resetButton.disabled = true;
        qrBox.textContent = "Resetting local auth state...";
        try {
          const response = await fetch("/api/playground/whatsapp/reset", {
            method: "POST"
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Failed to reset onboarding");
          }
        } catch (error) {
          qrBox.textContent = error.message || "Failed to reset onboarding";
        } finally {
          resetButton.disabled = false;
          await refreshStatus();
        }
      });

      activateButton.addEventListener("click", async () => {
        activateButton.disabled = true;
        qrBox.textContent = "Promoting this account to the AI Agent...";
        try {
          const response = await fetch("/api/playground/whatsapp/activate", {
            method: "POST"
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Failed to activate WhatsApp session");
          }
        } catch (error) {
          qrBox.textContent = error.message || "Failed to activate WhatsApp session";
        } finally {
          activateButton.disabled = false;
          await refreshStatus();
        }
      });

      void refreshStatus();
      setInterval(() => {
        void refreshStatus();
      }, 2000);
    </script>
  </body>
</html>`;

  const whatsappMessagesHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp Message Playground</title>
    <style>
      :root {
        --bg: #f1f6f0;
        --panel: #fdfefd;
        --ink: #122218;
        --muted: #5d6d63;
        --accent: #1f8f55;
        --border: #d4e2d3;
        --bubble-in: #ffffff;
        --bubble-out: #daf3df;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background: linear-gradient(180deg, #f7fbf6 0%, var(--bg) 100%);
      }
      .wrap {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px 18px 36px;
      }
      .header {
        margin-bottom: 16px;
      }
      .header p {
        color: var(--muted);
      }
      .layout {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr) 380px;
        gap: 18px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 10px 34px rgba(20, 38, 25, 0.06);
        overflow: hidden;
      }
      .panel-inner {
        padding: 16px;
      }
      .contact {
        padding: 12px 14px;
        border-top: 1px solid var(--border);
        cursor: pointer;
      }
      .contact:hover, .contact.active {
        background: #f5faf6;
      }
      .contact-title {
        font-weight: 700;
      }
      .contact-meta {
        color: var(--muted);
        font-size: 13px;
        margin-top: 4px;
      }
      .messages {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 520px;
        overflow: auto;
        padding: 16px;
        background: #f7fbf6;
      }
      .message {
        max-width: 78%;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 12px 14px;
        background: var(--bubble-in);
      }
      .message.outbound {
        align-self: flex-end;
        background: var(--bubble-out);
      }
      .meta {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .composer {
        border-top: 1px solid var(--border);
        padding: 16px;
      }
      textarea, input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
      }
      textarea {
        min-height: 110px;
        resize: vertical;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        color: white;
        background: var(--accent);
        cursor: pointer;
      }
      .toolbar {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-top: 12px;
      }
      .note {
        color: var(--muted);
        font-size: 13px;
      }
      @media (max-width: 1180px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="header">
        <h1>WhatsApp Message Playground</h1>
        <p>Live AI mode is active. Inbound WhatsApp messages can be stored, planned, and replied to automatically, and this page shows the thread plus its task and log context.</p>
        <p><a href="/playground/agent-identity">Open Agent Identity settings</a> to change the AI teammate name, aliases, and role used during reasoning.</p>
        <p><a href="/playground/authority-policy">Open Authority Policy settings</a> to set the single source of truth for sensitive authority changes.</p>
      </div>

      <div class="panel" style="margin-bottom:18px;">
        <div class="panel-inner">
          <strong>Live Test Status</strong>
          <div style="height:12px"></div>
          <div class="note">Connected AI number: <span id="ownNumberValue">Loading...</span></div>
          <div class="note" style="margin-top:6px;">Tester filter: <span id="activeTesterValue">Loading...</span></div>
          <div class="note" id="testerStatus" style="margin-top:10px;">Loading live WhatsApp status...</div>
        </div>
      </div>

      <div class="layout">
        <div class="panel">
          <div class="panel-inner">
            <strong>New Contact Test</strong>
            <div style="height:10px"></div>
            <input id="manualNumber" placeholder="60123456789" />
            <div class="toolbar">
              <button id="openManualButton" type="button">Open Thread</button>
              <span class="note">Use digits only or include +.</span>
            </div>
          </div>
          <div id="contacts"></div>
        </div>

        <div class="panel">
          <div class="panel-inner">
            <strong id="threadTitle">Select a contact</strong>
            <div class="note" id="threadMeta">Waiting for a thread.</div>
          </div>
          <div class="messages" id="messages">
            <div class="note">No thread selected yet.</div>
          </div>
          <div class="composer">
            <textarea id="composer" placeholder="Send a plain text WhatsApp message from localhost..."></textarea>
            <div class="toolbar">
              <button id="sendButton" type="button">Send Message</button>
              <button id="refreshButton" type="button" style="background:#5e6d62;">Refresh</button>
              <span class="note" id="sendStatus">Ready.</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-inner">
            <strong>Execution Inspector</strong>
            <div class="note" id="inspectorMeta">Select a thread to inspect tasks and logs.</div>
          </div>
          <div class="panel-inner" style="border-top:1px solid var(--border);">
            <strong>Tasks</strong>
            <div id="tasksInspector" class="note" style="margin-top:10px;">No thread selected yet.</div>
          </div>
          <div class="panel-inner" style="border-top:1px solid var(--border);">
            <strong>Decision Logs</strong>
            <div id="decisionLogsInspector" class="note" style="margin-top:10px;">No thread selected yet.</div>
          </div>
          <div class="panel-inner" style="border-top:1px solid var(--border);">
            <strong>Debug Trace</strong>
            <div id="debugInspector" class="note" style="margin-top:10px;">No thread selected yet.</div>
          </div>
        </div>
      </div>
    </div>

    <script>
      const contactsEl = document.getElementById("contacts");
      const messagesEl = document.getElementById("messages");
      const threadTitle = document.getElementById("threadTitle");
      const threadMeta = document.getElementById("threadMeta");
      const composer = document.getElementById("composer");
      const sendStatus = document.getElementById("sendStatus");
      const sendButton = document.getElementById("sendButton");
      const refreshButton = document.getElementById("refreshButton");
      const manualNumber = document.getElementById("manualNumber");
      const openManualButton = document.getElementById("openManualButton");
      const inspectorMeta = document.getElementById("inspectorMeta");
      const tasksInspector = document.getElementById("tasksInspector");
      const decisionLogsInspector = document.getElementById("decisionLogsInspector");
      const debugInspector = document.getElementById("debugInspector");
      const ownNumberValue = document.getElementById("ownNumberValue");
      const activeTesterValue = document.getElementById("activeTesterValue");
      const testerStatus = document.getElementById("testerStatus");

      let selectedContactNumber = "";
      let activeTesterNumber = "";

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }

      function getRowId(row) {
        if (!row || typeof row !== "object") {
          return "unknown";
        }

        const value = row.id ?? row.task_id ?? row.message_id ?? row.external_id ?? row.run_id ?? null;
        return value === null || value === undefined ? "unknown" : String(value);
      }

      function renderContacts(contacts) {
        if (!contacts.length) {
          contactsEl.innerHTML = '<div class="panel-inner note">' +
            (activeTesterNumber
              ? 'No stored WhatsApp thread yet for the filtered tester number.'
              : 'No WhatsApp threads stored yet. Send a message to the connected AI number to start the live thread view.') +
          '</div>';
          return;
        }

        contactsEl.innerHTML = contacts.map((contact) => {
          const active = contact.whatsapp_number === selectedContactNumber ? " active" : "";
          const preview = contact.last_message_text || "[" + contact.last_message_kind + "]";
          const outreachState = contact.autonomous_outreach ? "autonomous outreach allowed" : "reply only";
          return '<div class="contact' + active + '" data-number="' + escapeHtml(contact.whatsapp_number) + '">' +
            '<div class="contact-title">' + escapeHtml(contact.name) + '</div>' +
            '<div class="contact-meta">' + escapeHtml(contact.whatsapp_number) + '</div>' +
            (contact.whatsapp_lid ? '<div class="contact-meta">LID ' + escapeHtml(contact.whatsapp_lid) + '</div>' : '') +
            '<div class="contact-meta">' + escapeHtml(outreachState) + '</div>' +
            '<div class="contact-meta">' + escapeHtml(preview) + '</div>' +
          '</div>';
        }).join("");

        for (const node of contactsEl.querySelectorAll(".contact")) {
          node.addEventListener("click", () => {
            selectedContactNumber = node.dataset.number || "";
            void loadContacts();
            void loadMessages();
          });
        }
      }

      function renderMessages(messages) {
        if (!selectedContactNumber) {
          messagesEl.innerHTML = '<div class="note">No thread selected yet.</div>';
          return;
        }

        if (!messages.length) {
          messagesEl.innerHTML = '<div class="note">No stored messages for this contact yet.</div>';
          return;
        }

        messagesEl.innerHTML = messages.slice().reverse().map((message) => {
          if (!message || typeof message !== "object") {
            return '<div class="note">Skipped malformed message row.</div>';
          }

          const klass = message.direction === "outbound" ? "message outbound" : "message inbound";
          const parts = [];
          if (message.text_content) parts.push(escapeHtml(message.text_content));
          if (message.transcript) parts.push('<div><strong>Transcript:</strong> ' + escapeHtml(message.transcript) + '</div>');
          if (message.analysis) parts.push('<div><strong>Analysis:</strong> ' + escapeHtml(message.analysis) + '</div>');
          if (message.media_path) parts.push('<div><a href="/api/playground/whatsapp/messages/' + encodeURIComponent(getRowId(message)) + '/media" target="_blank">Open media</a></div>');
          const author = message.is_from_me ? "Bot" : (message.author_name || message.author_number || "Contact");
          return '<div class="' + klass + '">' +
            '<div class="meta">' + escapeHtml(author) + ' | ' + escapeHtml(message.kind) + ' | ' + escapeHtml(message.occurred_at) + '</div>' +
            '<div>' + (parts.join("") || '<em>[empty]</em>') + '</div>' +
          '</div>';
        }).join("");
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }

      function renderInspector(body) {
        if (!selectedContactNumber) {
          inspectorMeta.textContent = "Select a thread to inspect tasks and logs.";
          tasksInspector.innerHTML = '<div class="note">No thread selected yet.</div>';
          decisionLogsInspector.innerHTML = '<div class="note">No thread selected yet.</div>';
          debugInspector.innerHTML = '<div class="note">No thread selected yet.</div>';
          return;
        }

        const tasks = body.tasks || [];
        const decisionLogs = body.decisionLogs || [];
        const debugRecords = body.debugRecords || [];

        inspectorMeta.textContent =
          selectedContactNumber + " | " +
          tasks.length + " task(s) | " +
          decisionLogs.length + " decision log(s) | " +
          debugRecords.length + " debug record(s)";

        tasksInspector.innerHTML = tasks.length
          ? tasks.map((task) =>
              !task || typeof task !== "object"
                ? '<div class="note">Skipped malformed task row.</div>'
                : '<div class="message" style="max-width:100%;margin-bottom:10px;">' +
                  '<div class="meta">Task #' + escapeHtml(getRowId(task)) + ' | ' + escapeHtml(task.status) + ' | ' + escapeHtml(task.updated_at) + '</div>' +
                  '<div><strong>' + escapeHtml(task.title) + '</strong></div>' +
                  '<div style="margin-top:6px;">' + escapeHtml(task.details) + '</div>' +
                '</div>'
            ).join("")
          : '<div class="note">No tasks linked to this contact yet.</div>';

        decisionLogsInspector.innerHTML = decisionLogs.length
          ? decisionLogs.map((item) =>
              !item || typeof item !== "object"
                ? '<div class="note">Skipped malformed decision log row.</div>'
                : '<div class="message" style="max-width:100%;margin-bottom:10px;">' +
                  '<div class="meta">' + escapeHtml(item.decision_type) + ' | ' + escapeHtml(item.created_at) + '</div>' +
                  '<div><strong>' + escapeHtml(item.summary) + '</strong></div>' +
                  '<div style="margin-top:6px;"><pre style="min-height:auto;margin-top:6px;">' + escapeHtml(JSON.stringify(item.context || {}, null, 2)) + '</pre></div>' +
                '</div>'
            ).join("")
          : '<div class="note">No decision logs linked to this contact yet.</div>';

        debugInspector.innerHTML = debugRecords.length
          ? debugRecords.map((item) =>
              !item || typeof item !== "object"
                ? '<div class="note">Skipped malformed debug row.</div>'
                : '<div class="message" style="max-width:100%;margin-bottom:10px;">' +
                  '<div class="meta">' + escapeHtml(item.stage) + ' | ' + escapeHtml(item.severity) + ' | ' + escapeHtml(item.created_at) + '</div>' +
                  '<div><strong>' + escapeHtml(item.summary) + '</strong></div>' +
                  '<div style="margin-top:6px;"><pre style="min-height:auto;margin-top:6px;">' + escapeHtml(JSON.stringify(item.payload || {}, null, 2)) + '</pre></div>' +
                '</div>'
            ).join("")
          : '<div class="note">No debug records linked to this contact yet.</div>';
      }

      async function loadTesterConfig() {
        const response = await fetch("/api/playground/whatsapp/tester-config");
        const body = await response.json();
        activeTesterNumber = (body.testerWhatsappNumbers && body.testerWhatsappNumbers[0]) || "";
        ownNumberValue.textContent = body.ownNumber || "Not connected";
        activeTesterValue.textContent = activeTesterNumber || "Off";
        testerStatus.textContent = activeTesterNumber
          ? "Tester filter is active for one sender number."
          : "No sender filter is active. Live AI will react to inbound WhatsApp messages and show them here.";
      }

      async function loadContacts() {
        const response = await fetch("/api/playground/whatsapp/contacts");
        const body = await response.json();
        renderContacts(body.contacts || []);
      }

      async function loadMessages() {
        if (!selectedContactNumber) {
          renderMessages([]);
          threadTitle.textContent = "Select a contact";
          threadMeta.textContent = "Waiting for a live thread.";
          return;
        }

        const response = await fetch("/api/playground/whatsapp/messages?contactNumber=" + encodeURIComponent(selectedContactNumber));
        const body = await response.json();
        const items = body.messages || [];
        renderMessages(items);
        threadTitle.textContent = body.contact?.name || selectedContactNumber;
        threadMeta.textContent = (body.contact?.whatsapp_number || selectedContactNumber) + " | " + items.length + " stored messages";
      }

      async function loadInspector() {
        if (!selectedContactNumber) {
          renderInspector({});
          return;
        }

        const response = await fetch("/api/playground/whatsapp/thread-context?contactNumber=" + encodeURIComponent(selectedContactNumber));
        const body = await response.json();
        renderInspector(body);
      }

      async function refreshThreadData(label) {
        try {
          await Promise.all([loadContacts(), loadMessages(), loadInspector()]);
        } catch (error) {
          console.error("[whatsapp-playground]", label, error);
          throw new Error(label + ": " + (error?.message || "Unknown thread refresh failure"));
        }
      }

      sendButton.addEventListener("click", async () => {
        if (!selectedContactNumber) {
          sendStatus.textContent = "Pick a contact first.";
          return;
        }

        const text = composer.value.trim();
        if (!text) {
          sendStatus.textContent = "Message is empty.";
          return;
        }

        sendButton.disabled = true;
        sendStatus.textContent = "Sending...";

        try {
          const response = await fetch("/api/playground/whatsapp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetNumber: selectedContactNumber,
              text
            })
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "Send failed");
          }

          composer.value = "";
          sendStatus.textContent = "Sent and stored.";
          await refreshThreadData("Send refresh");
        } catch (error) {
          sendStatus.textContent = error.message || "Send failed";
        } finally {
          sendButton.disabled = false;
        }
      });

      refreshButton.addEventListener("click", async () => {
        sendStatus.textContent = "Refreshing...";
        try {
          await loadTesterConfig();
          await refreshThreadData("Manual refresh");
          sendStatus.textContent = "Refreshed.";
        } catch (error) {
          sendStatus.textContent = error.message || "Refresh failed";
        }
      });

      openManualButton.addEventListener("click", async () => {
        const value = manualNumber.value.trim();
        if (!value) {
          sendStatus.textContent = "Enter a number first.";
          return;
        }
        selectedContactNumber = value;
        await refreshThreadData("Open thread");
      });

      void loadTesterConfig().then(() => refreshThreadData("Initial load"));
      setInterval(() => {
        void loadTesterConfig();
        if (selectedContactNumber) {
          void refreshThreadData("Auto refresh").catch((error) => {
            console.error("[whatsapp-playground] auto refresh failed", error);
          });
        }
      }, 4000);
    </script>
  </body>
</html>`;

  const llmConfigHtml = renderLlmConfigPage({
    defaultProvider: input.config.llmRouterProvider,
    defaultModel: input.config.llmRouterModel,
    adminProtected: Boolean(input.config.adminApiToken)
  });
  const agentIdentityHtml = renderAgentIdentityPage({
    adminProtected: Boolean(input.config.adminApiToken)
  });
  const authorityPolicyHtml = renderAuthorityPolicyPage({
    adminProtected: Boolean(input.config.adminApiToken)
  });
  const companyDbConfigHtml = renderCompanyDbConfigPage({
    adminProtected: Boolean(input.config.adminApiToken)
  });

  const agentLabHtml = renderAgentLabPage({
    botName: input.config.botName,
    provider: input.config.llmRouterProvider,
    model: input.config.llmRouterModel
  });

  const isLlmProviderName = (value: unknown): value is LlmProviderName =>
    value === "uniapi-gemini" || value === "uniapi-openai" || value === "openai";

  const parseLlmPricingEntries = (raw: unknown): LlmModelPricingEntry[] => {
    if (!Array.isArray(raw)) {
      throw new Error("entries must be an array");
    }

    const entries = raw.map((entry) => {
      const provider = entry?.provider;
      const model = String(entry?.model ?? "").trim();
      const inputCostPerTokenMyr = Number(entry?.inputCostPerTokenMyr);
      const outputCostPerTokenMyr = Number(entry?.outputCostPerTokenMyr);

      if (!isLlmProviderName(provider)) {
        throw new Error(`Unsupported LLM provider: ${String(provider ?? "")}`);
      }

      if (!model) {
        throw new Error("Model is required for each pricing row");
      }

      if (!Number.isFinite(inputCostPerTokenMyr) || inputCostPerTokenMyr < 0) {
        throw new Error(`Invalid inputCostPerTokenMyr for ${provider}:${model}`);
      }

      if (!Number.isFinite(outputCostPerTokenMyr) || outputCostPerTokenMyr < 0) {
        throw new Error(`Invalid outputCostPerTokenMyr for ${provider}:${model}`);
      }

      return {
        provider,
        model,
        inputCostPerTokenMyr,
        outputCostPerTokenMyr
      };
    });

    const uniqueEntries = new Map<string, LlmModelPricingEntry>();
    for (const entry of entries) {
      uniqueEntries.set(`${entry.provider}::${entry.model.toLowerCase()}`, entry);
    }

    return Array.from(uniqueEntries.values());
  };

  const getRequestAdminToken = (req: express.Request): string => {
    const rawHeader = req.header("x-admin-token");
    return typeof rawHeader === "string" ? rawHeader.trim() : "";
  };

  const logAdminAuthFailure = (
    req: express.Request,
    reason: "missing_config" | "missing_token" | "token_mismatch",
    providedToken: string
  ) => {
    const forwardedFor = req.header("x-forwarded-for");
    console.warn("[admin-auth] request denied", {
      method: req.method,
      path: req.path,
      reason,
      hasProvidedToken: providedToken.length > 0,
      providedTokenLength: providedToken.length,
      expectedTokenLength: input.config.adminApiToken?.length ?? 0,
      remoteAddress: forwardedFor || req.ip || req.socket.remoteAddress || null
    });
  };

  const sendAdminAuthFailure = (
    req: express.Request,
    res: express.Response,
    reason: "missing_config" | "missing_token" | "token_mismatch"
  ) => {
    const providedToken = getRequestAdminToken(req);
    logAdminAuthFailure(req, reason, providedToken);

    if (reason === "missing_config") {
      res.status(503).json({
        error: "ADMIN_API_TOKEN is not configured on the live server.",
        code: "ADMIN_AUTH_NOT_CONFIGURED",
        detail: "Set ADMIN_API_TOKEN in Railway, redeploy, then re-enter the same token in this page."
      });
      return;
    }

    const detail =
      reason === "missing_token"
        ? "This request requires the x-admin-token header. Enter the live ADMIN_API_TOKEN in the page before saving or testing."
        : "The provided admin token did not match the live server token. Check Railway ADMIN_API_TOKEN for hidden spaces or stale values, redeploy after env changes, then re-enter the exact token here.";

    res.status(401).json({
      error: "Admin token missing or invalid.",
      code: "ADMIN_AUTH_FAILED",
      detail,
      adminProtected: true
    });
  };

  const requireAdminIfConfigured = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!input.config.adminApiToken) {
      next();
      return;
    }

    const providedToken = getRequestAdminToken(req);
    if (!providedToken) {
      sendAdminAuthFailure(req, res, "missing_token");
      return;
    }

    if (providedToken !== input.config.adminApiToken) {
      sendAdminAuthFailure(req, res, "token_mismatch");
      return;
    }

    next();
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!input.config.adminApiToken) {
      sendAdminAuthFailure(req, res, "missing_config");
      return;
    }

    const providedToken = getRequestAdminToken(req);
    if (!providedToken) {
      sendAdminAuthFailure(req, res, "missing_token");
      return;
    }

    if (providedToken !== input.config.adminApiToken) {
      sendAdminAuthFailure(req, res, "token_mismatch");
      return;
    }

    next();
  };

  const parseDebugConfig = (raw: unknown): DebugConfig => {
    const body = (raw ?? {}) as any;
    return {
      mode:
        body.mode === "debug_basic" || body.mode === "debug_verbose" || body.mode === "debug_trace"
          ? body.mode
          : "debug_off",
      promptTrace: Boolean(body.promptTrace),
      apiPayloadTrace: Boolean(body.apiPayloadTrace),
      enabledTaskIds: Array.isArray(body.enabledTaskIds)
        ? body.enabledTaskIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value))
        : [],
      enabledToolNames: Array.isArray(body.enabledToolNames)
        ? body.enabledToolNames.map((value: unknown) => String(value))
        : []
    };
  };

  const getEffectiveTesterWhatsappNumbers = async (): Promise<string[]> => {
    const runtimeNumbers = await input.repository.getTesterWhatsappNumbers();
    return runtimeNumbers.length > 0 ? runtimeNumbers : input.config.testerWhatsappNumbers;
  };

  const getSingleTesterWhatsappNumber = async (): Promise<string | null> => {
    const numbers = await getEffectiveTesterWhatsappNumbers();
    return numbers[0] ?? null;
  };

  app.get("/", async (_req, res) => {
    const identity = await input.agentIdentityService.getIdentity().catch(() => null);
    const health = await input.healthService.full().catch(() => ({
      status: "failed" as const,
      checks: [
        {
          name: "startup",
          ok: false,
          detail: "Unable to load health report"
        }
      ]
    }));

    res.type("html").send(
      renderDashboardPage({
        appName: "AI Employee Dashboard",
        botName: identity?.name ?? null,
        whatsappEnabled: input.config.enableWhatsapp,
        adminProtected: Boolean(input.config.adminApiToken),
        health
      })
    );
  });

  app.get("/health", async (_req, res) => {
    const report = await input.healthService.basic();
    res.status(report.status === "ok" ? 200 : 503).json(report);
  });

  app.get("/health/full", async (_req, res) => {
    const report = await input.healthService.full();
    res.status(report.status === "ok" ? 200 : 503).json(report);
  });

  app.get("/playground/gemini", (_req, res) => {
    res.type("html").send(playgroundHtml);
  });

  app.get("/playground/agent-lab", (_req, res) => {
    res.type("html").send(agentLabHtml);
  });

  app.get("/playground/llm/config", (_req, res) => {
    res.type("html").send(llmConfigHtml);
  });

  app.get("/playground/agent-identity", (_req, res) => {
    res.type("html").send(agentIdentityHtml);
  });

  app.get("/playground/authority-policy", (_req, res) => {
    res.type("html").send(authorityPolicyHtml);
  });

  app.get("/playground/company-db", (_req, res) => {
    res.type("html").send(companyDbConfigHtml);
  });

  app.get("/playground/whatsapp", (_req, res) => {
    res.type("html").send(whatsappMessagesHtml);
  });

  app.get("/playground/whatsapp/onboarding", (_req, res) => {
    res.type("html").send(whatsappOnboardingHtml);
  });

  app.post("/api/playground/gemini", async (req, res) => {
    try {
      const output = await input.llmRouter.generateText({
        systemPrompt: String(req.body.systemPrompt ?? ""),
        prompt: String(req.body.prompt ?? "Reply with OK.")
      });

      res.json({
        provider: input.config.llmRouterProvider,
        model: input.config.llmRouterModel,
        output
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Playground request failed"
      });
    }
  });

  app.get("/api/playground/agent-lab/overview", async (_req, res) => {
    const [tasks, decisionLogs, debugRecords, activeSkills] = await Promise.all([
      input.repository.listTasks(12),
      input.repository.listDecisionLogs({ limit: 20 }),
      input.repository.listDebugRecords({ limit: 20 }),
      input.skillRegistry.listActiveSkillPacks()
    ]);

    res.json({
      tasks,
      decisionLogs,
      debugRecords,
      activeSkills
    });
  });

  app.post("/api/playground/agent-lab/run", async (req, res) => {
    try {
      const text = String(req.body.text ?? "").trim();
      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      const result = await input.agentService.simulateLocalInstruction({
        senderName: req.body.senderName ? String(req.body.senderName) : null,
        senderNumber: req.body.senderNumber ? String(req.body.senderNumber) : null,
        text
      });

      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to run local agent simulation"
      });
    }
  });

  app.get("/api/playground/llm/config", requireAdminIfConfigured, async (_req, res) => {
    const [entries, recentCalls, knownModelsFromLogs] = await Promise.all([
      input.repository.getLlmModelPricing(),
      input.repository.listRecentLlmCallLogs(),
      input.repository.listKnownLlmModels()
    ]);

    const knownModels = new Map<string, { provider: LlmProviderName; model: string; lastUsedAt: string | null }>();
    const registerModel = (provider: LlmProviderName, model: string, lastUsedAt: string | null) => {
      const key = `${provider}::${model.trim().toLowerCase()}`;
      if (!model.trim() || knownModels.has(key)) {
        return;
      }

      knownModels.set(key, {
        provider,
        model: model.trim(),
        lastUsedAt
      });
    };

    registerModel(input.config.llmRouterProvider, input.config.llmRouterModel, null);
    for (const entry of entries) {
      registerModel(entry.provider, entry.model, null);
    }
    for (const model of knownModelsFromLogs) {
      registerModel(model.provider, model.model, model.lastUsedAt);
    }

    res.json({
      entries,
      recentCalls,
      knownModels: Array.from(knownModels.values())
    });
  });

  app.get("/api/playground/agent-identity", requireAdminIfConfigured, async (_req, res) => {
    const identity = await input.agentIdentityService.getIdentity();
    res.json({ identity });
  });

  app.put("/api/playground/agent-identity", requireAdmin, async (req, res) => {
    try {
      const name = String(req.body.name ?? "").trim();
      const roleDescription = String(req.body.roleDescription ?? "").trim();
      const aliases = Array.isArray(req.body.aliases)
        ? req.body.aliases.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
        : [];

      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      if (!roleDescription) {
        res.status(400).json({ error: "roleDescription is required" });
        return;
      }

      const identity = await input.agentIdentityService.saveIdentity({
        name,
        aliases,
        roleDescription
      });

      res.json({ ok: true, identity });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save agent identity"
      });
    }
  });

  app.get("/api/playground/authority-policy", requireAdminIfConfigured, async (_req, res) => {
    const policy = await input.authorityPolicyService.getPolicy();
    res.json({ policy });
  });

  app.get("/api/playground/company-db", requireAdminIfConfigured, async (_req, res) => {
    const [config, status] = await Promise.all([
      input.companyDbConfigService.getConfig(),
      input.companyDbConfigService.getStatus()
    ]);
    res.json({ config, status });
  });

  app.put("/api/playground/company-db", requireAdmin, async (req, res) => {
    try {
      const config = await input.companyDbConfigService.saveConfig({
        connectionString: req.body.connectionString
      });
      const status = await input.companyDbConfigService.getStatus();
      res.json({ ok: true, config, status });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save company DB config"
      });
    }
  });

  app.post("/api/playground/company-db/test", requireAdmin, async (_req, res) => {
    try {
      await input.companyDbService.ping();
      const status = await input.companyDbConfigService.getStatus();
      res.json({ ok: true, status });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to test company DB connection"
      });
    }
  });

  app.put("/api/playground/authority-policy", requireAdmin, async (req, res) => {
    try {
      const policy = await input.authorityPolicyService.savePolicy({
        singleSourceOfTruthNumber: req.body.singleSourceOfTruthNumber
          ? String(req.body.singleSourceOfTruthNumber)
          : null,
        requireSingleSourceOfTruthForSensitiveChanges:
          typeof req.body.requireSingleSourceOfTruthForSensitiveChanges === "boolean"
            ? req.body.requireSingleSourceOfTruthForSensitiveChanges
            : true
      });

      res.json({ ok: true, policy });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save authority policy"
      });
    }
  });

  app.put("/api/playground/llm/config", requireAdminIfConfigured, async (req, res) => {
    try {
      const entries = parseLlmPricingEntries(req.body.entries);
      await input.repository.saveLlmModelPricing(entries);
      res.json({ ok: true, count: entries.length });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to save LLM pricing"
      });
    }
  });

  app.get("/api/playground/whatsapp/status", (_req, res) => {
    res.json(input.whatsappOnboardingService.getState());
  });

  app.post("/api/playground/whatsapp/start", async (_req, res) => {
    try {
      void input.whatsappOnboardingService.start();
      res.json({
        ok: true
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start WhatsApp onboarding"
      });
    }
  });

  app.post("/api/playground/whatsapp/reset", async (_req, res) => {
    try {
      await input.whatsappOnboardingService.reset();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to reset WhatsApp onboarding"
      });
    }
  });

  app.post("/api/playground/whatsapp/activate", async (_req, res) => {
    try {
      if (!input.activateWhatsAppSession) {
        res.status(409).json({
          error: "WhatsApp activation is not available on this server."
        });
        return;
      }

      await input.activateWhatsAppSession();
      res.json({
        ok: true,
        ownNumber: input.getOwnWhatsappNumber?.() ?? null
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to activate WhatsApp session"
      });
    }
  });

  app.get("/api/playground/whatsapp/tester-config", async (_req, res) => {
    const testerWhatsappNumbers = await getEffectiveTesterWhatsappNumbers();
    res.json({
      ownNumber: input.getOwnWhatsappNumber?.() ?? null,
      testerWhatsappNumbers
    });
  });

  app.put("/api/playground/whatsapp/tester-config", async (req, res) => {
    try {
      const testerNumber = normalizePhoneNumber(String(req.body.testerNumber ?? ""));
      const testerWhatsappNumbers = testerNumber ? [testerNumber] : [];

      await input.repository.saveTesterWhatsappNumbers(testerWhatsappNumbers);

      if (testerNumber) {
        await input.repository.ensureContactShell({
          whatsappNumber: testerNumber,
          name: testerNumber,
          notes: "Single tester number configured from localhost WhatsApp playground."
        });
      }

      res.json({
        ok: true,
        ownNumber: input.getOwnWhatsappNumber?.() ?? null,
        testerWhatsappNumbers
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save tester WhatsApp number"
      });
    }
  });

  app.get("/api/playground/whatsapp/groups", requireAdmin, async (_req, res) => {
    try {
      if (!input.listWhatsAppGroups) {
        res.status(409).json({
          error: "WhatsApp gateway is not enabled for live group inspection."
        });
        return;
      }

      const groups = await input.listWhatsAppGroups();
      res.json({
        ownNumber: input.getOwnWhatsappNumber?.() ?? null,
        groups
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to list WhatsApp groups"
      });
    }
  });

  app.get("/api/playground/whatsapp/groups/:chatId", requireAdmin, async (req, res) => {
    try {
      if (!input.getWhatsAppGroupMetadata) {
        res.status(409).json({
          error: "WhatsApp gateway is not enabled for live group inspection."
        });
        return;
      }

      const chatId = decodeURIComponent(String(req.params.chatId ?? "")).trim();
      if (!chatId) {
        res.status(400).json({ error: "chatId is required" });
        return;
      }

      const group = await input.getWhatsAppGroupMetadata(chatId);
      res.json({
        ownNumber: input.getOwnWhatsappNumber?.() ?? null,
        group
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch WhatsApp group metadata"
      });
    }
  });

  app.get("/api/playground/whatsapp/contacts", async (_req, res) => {
    const testerWhatsappNumbers = await getEffectiveTesterWhatsappNumbers();
    const contacts =
      testerWhatsappNumbers.length > 0
        ? await input.repository.listMessageContactsByNumbers(testerWhatsappNumbers)
        : await input.repository.listMessageContacts();
    res.json({ contacts, testerWhatsappNumbers });
  });

  app.get("/api/playground/whatsapp/messages", async (req, res) => {
    const contactNumber = normalizePhoneNumber(String(req.query.contactNumber ?? ""));
    if (!contactNumber) {
      res.json({ contact: null, messages: [] });
      return;
    }

    const [contact, messages] = await Promise.all([
      input.repository.getContactByNumber(contactNumber),
      input.repository.listMessagesForContact(contactNumber)
    ]);

    res.json({ contact, messages });
  });

  app.get("/api/playground/whatsapp/runtime-diagnostics", async (_req, res) => {
    res.json({
      diagnostics: input.getWhatsAppRuntimeDiagnostics?.() ?? null
    });
  });

  app.get("/api/playground/whatsapp/thread-context", async (req, res) => {
    const contactNumber = normalizePhoneNumber(String(req.query.contactNumber ?? ""));
    if (!contactNumber) {
      res.json({ contact: null, tasks: [], decisionLogs: [], debugRecords: [] });
      return;
    }

    const [contact, tasks, decisionLogs, debugRecords] = await Promise.all([
      input.repository.getContactByNumber(contactNumber),
      input.repository.listTasksForContact(contactNumber, 20),
      input.repository.listDecisionLogsForContact(contactNumber, 20),
      input.repository.listDebugRecordsForContact(contactNumber, 20)
    ]);

    res.json({
      contact,
      tasks,
      decisionLogs,
      debugRecords
    });
  });

  app.get("/api/playground/whatsapp/messages/:id/media", async (req, res) => {
    const messageId = Number(req.params.id);
    if (!Number.isFinite(messageId)) {
      res.status(400).json({ error: "Invalid message id" });
      return;
    }

    const message = await input.repository.getMessageById(messageId);
    if (!message?.media_path) {
      res.status(404).json({ error: "Media not found" });
      return;
    }

    if (message.mime_type) {
      res.type(message.mime_type);
    }

    res.sendFile(message.media_path);
  });

  app.post("/api/playground/whatsapp/send", async (req, res) => {
    try {
      const targetNumber = normalizePhoneNumber(req.body.targetNumber);
      const text = String(req.body.text ?? "").trim();
      if (!targetNumber || !text) {
        res.status(400).json({
          error: "targetNumber and text are required"
        });
        return;
      }

      await input.whatsappPlaygroundService.sendText(targetNumber, text);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send WhatsApp message"
      });
    }
  });

  app.post("/admin/bootstrap", requireAdmin, async (req, res) => {
    await input.bootstrapService.ensureBootstrapContact({
      whatsappNumber: normalizePhoneNumber(req.body.whatsappNumber),
      whatsappLid: req.body.whatsappLid ? normalizeWhatsAppIdentityUser(String(req.body.whatsappLid)) : null,
      name: req.body.name,
      role: req.body.role ?? "Initiator",
      branch: req.body.branch ?? null,
      authorityLevel: Number(req.body.authorityLevel ?? 5),
      domains: Array.isArray(req.body.domains) ? req.body.domains : [],
      notes: req.body.notes ?? null,
      autonomousOutreach:
        typeof req.body.autonomousOutreach === "boolean" ? req.body.autonomousOutreach : true
    });

    res.json({ ok: true });
  });

  app.post("/admin/contacts", requireAdmin, async (req, res) => {
    const contacts = Array.isArray(req.body.contacts) ? req.body.contacts : [];
    for (const contact of contacts) {
      await input.repository.upsertContact({
        whatsappNumber: normalizePhoneNumber(contact.whatsappNumber),
        whatsappLid: contact.whatsappLid ? normalizeWhatsAppIdentityUser(String(contact.whatsappLid)) : null,
        name: contact.name,
        role: contact.role ?? null,
        branch: contact.branch ?? null,
        authorityLevel: contact.authorityLevel ?? null,
        domains: Array.isArray(contact.domains) ? contact.domains : [],
        isHumanApi: contact.isHumanApi ?? true,
        notes: contact.notes ?? null,
        source: contact.source ?? null,
        isInternal: contact.isInternal ?? false,
        department: contact.department ?? null,
        relationType: contact.relationType ?? null,
        aboutPerson: contact.aboutPerson ?? null,
        autonomousOutreach: typeof contact.autonomousOutreach === "boolean" ? contact.autonomousOutreach : null
      });
    }

    res.json({ ok: true, count: contacts.length });
  });

  app.post("/admin/facts", requireAdmin, async (req, res) => {
    const facts = Array.isArray(req.body.facts) ? req.body.facts : [];

    for (const fact of facts) {
      await input.repository.upsertFact({
        factKey: fact.factKey,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        status: fact.status ?? "confirmed",
        confidence: Number(fact.confidence ?? 0.99),
        sourceContactNumber: normalizePhoneNumber(req.body.sourceContactNumber ?? "")
      });
    }

    res.json({ ok: true, count: facts.length });
  });

  app.post("/admin/assets/url", requireAdmin, async (req, res) => {
    const url = String(req.body.url ?? "");
    const title = req.body.title ? String(req.body.title) : null;
    const fetched = await fetch(url);
    const html = await fetched.text();

    await input.repository.addKnowledgeAsset({
      sourceType: "url",
      sourceRef: url,
      title,
      mimeType: fetched.headers.get("content-type"),
      textContent: html,
      summary: null,
      metadata: {
        fetchedAt: new Date().toISOString()
      },
      createdBy: "admin"
    });

    res.json({
      ok: true,
      url,
      bytes: html.length
    });
  });

  app.get("/admin/jobs", requireAdmin, async (_req, res) => {
    const jobs = await input.repository.listJobs();
    res.json({ jobs });
  });

  app.get("/admin/contacts", requireAdmin, async (_req, res) => {
    const contacts = await input.repository.listContacts();
    res.json({ contacts });
  });

  app.post("/admin/llm/test", requireAdmin, async (req, res) => {
    const prompt = String(req.body.prompt ?? "Reply with OK.");
    const output = await input.llmRouter.generateText({
      prompt,
      provider: req.body.provider,
      model: req.body.model
    } as any);

    res.json({
      provider: req.body.provider ?? input.config.llmRouterProvider,
      model: req.body.model ?? input.config.llmRouterModel,
      output
    });
  });

  app.get("/admin/prompts", requireAdmin, async (_req, res) => {
    const versions = await input.repository.listPromptVersions();
    const active = versions.filter((row) => row.is_active);
    res.json({ active, versions });
  });

  app.post("/admin/prompts/reload", requireAdmin, async (_req, res) => {
    const synced = await input.promptRegistry.reload();
    res.json({ ok: true, synced });
  });

  app.post("/admin/prompts/activate", requireAdmin, async (req, res) => {
    const promptKey = String(req.body.promptKey ?? "").trim();
    const versionHash = req.body.versionHash ? String(req.body.versionHash) : undefined;
    const version =
      req.body.version === undefined || req.body.version === null ? undefined : Number(req.body.version);

    if (!promptKey || (!versionHash && !Number.isFinite(version))) {
      res.status(400).json({ error: "promptKey plus versionHash or version is required" });
      return;
    }

    const activated = await input.promptRegistry.activatePromptVersion({
      promptKey,
      versionHash,
      version
    });

    if (!activated) {
      res.status(404).json({ error: "Prompt version not found" });
      return;
    }

    res.json({ ok: true, active: activated });
  });

  app.get("/admin/skills", requireAdmin, async (_req, res) => {
    const versions = await input.repository.listSkillVersions();
    const active = versions.filter((row) => row.is_active);
    res.json({ active, versions });
  });

  app.post("/admin/skills/reload", requireAdmin, async (_req, res) => {
    const synced = await input.skillRegistry.reload();
    res.json({ ok: true, synced });
  });

  app.post("/admin/skills/activate", requireAdmin, async (req, res) => {
    const skillId = String(req.body.skillId ?? "").trim();
    const versionHash = req.body.versionHash ? String(req.body.versionHash) : undefined;
    const version =
      req.body.version === undefined || req.body.version === null ? undefined : Number(req.body.version);

    if (!skillId || (!versionHash && !Number.isFinite(version))) {
      res.status(400).json({ error: "skillId plus versionHash or version is required" });
      return;
    }

    const activated = await input.skillRegistry.activateSkillVersion({
      skillId,
      versionHash,
      version
    });

    if (!activated) {
      res.status(404).json({ error: "Skill version not found" });
      return;
    }

    res.json({ ok: true, active: activated });
  });

  app.get("/admin/debug/config", requireAdmin, async (_req, res) => {
    const config = await input.debugService.getConfig(true);
    res.json({ config });
  });

  app.put("/admin/debug/config", requireAdmin, async (req, res) => {
    const config = parseDebugConfig(req.body);
    await input.debugService.updateConfig(config);
    res.json({ ok: true, config });
  });

  app.get("/admin/debug/records", requireAdmin, async (req, res) => {
    const taskIdRaw = req.query.taskId ? Number(req.query.taskId) : undefined;
    const records = await input.repository.listDebugRecords({
      limit: req.query.limit ? Number(req.query.limit) : 100,
      taskId: Number.isFinite(taskIdRaw) ? taskIdRaw : undefined,
      runId: req.query.runId ? String(req.query.runId) : undefined,
      stage: req.query.stage ? String(req.query.stage) : undefined,
      severity: req.query.severity ? String(req.query.severity) : undefined
    });

    res.json({ records });
  });

  return app;
}
