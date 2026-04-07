import { LlmProviderName } from "../llm/types.js";

export function renderLlmConfigPage(input: {
  defaultProvider: LlmProviderName;
  defaultModel: string;
  adminProtected: boolean;
}): string {
  const defaultProvider = JSON.stringify(input.defaultProvider);
  const defaultModel = JSON.stringify(input.defaultModel);
  const adminProtected = JSON.stringify(input.adminProtected);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LLM Cost Configuration</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe8;
        --panel: rgba(255, 251, 246, 0.94);
        --ink: #1f1b17;
        --muted: #70675d;
        --accent: #0f766e;
        --accent-2: #dff3ee;
        --accent-3: #fb8c3c;
        --danger: #b64040;
        --border: #ddd1c2;
        --shadow: rgba(62, 44, 28, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, #fff7ef, transparent 32%),
          radial-gradient(circle at top right, #e5f6f1, transparent 28%),
          linear-gradient(180deg, #f9f4ed 0%, var(--bg) 100%);
      }
      .wrap {
        max-width: 1280px;
        margin: 0 auto;
        padding: 28px 18px 44px;
      }
      .hero {
        margin-bottom: 20px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 38px;
        line-height: 1.05;
      }
      p, .meta, .helper {
        color: var(--muted);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
        gap: 18px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: 0 16px 42px var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(8px);
      }
      .card-body {
        padding: 18px;
      }
      .card-head {
        padding: 18px 18px 0;
      }
      .card-title {
        font-size: 24px;
        margin: 0 0 6px;
      }
      .toolbar, .token-bar, .stat-grid, .suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .token-bar {
        margin-top: 14px;
      }
      .stat-grid {
        margin-top: 14px;
      }
      .stat {
        min-width: 160px;
        padding: 12px 14px;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
      }
      .stat-label {
        color: var(--muted);
        font-size: 13px;
      }
      .stat-value {
        font-size: 22px;
        font-weight: 700;
        margin-top: 4px;
      }
      input, select, button {
        font: inherit;
      }
      input, select {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: #fff;
        color: var(--ink);
      }
      input[type="number"] {
        min-width: 120px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font-weight: 700;
        cursor: pointer;
        color: white;
        background: var(--accent);
      }
      button.secondary {
        background: #6b7280;
      }
      button.warn {
        background: var(--accent-3);
        color: #2b1807;
      }
      button.ghost {
        background: transparent;
        color: var(--accent);
        border: 1px solid var(--border);
      }
      button.danger {
        background: #fff1f1;
        color: var(--danger);
        border: 1px solid #efc6c6;
      }
      .status {
        margin-top: 12px;
        min-height: 24px;
        color: var(--muted);
      }
      .pricing-table, .calls-table {
        width: 100%;
        border-collapse: collapse;
      }
      .pricing-table th, .pricing-table td,
      .calls-table th, .calls-table td {
        padding: 12px 10px;
        border-top: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      .pricing-table th, .calls-table th {
        font-size: 13px;
        color: var(--muted);
        letter-spacing: 0.02em;
      }
      .pricing-table td:last-child, .calls-table td:last-child {
        white-space: nowrap;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 8px 12px;
        border: 1px solid var(--border);
        background: #fff;
        color: var(--ink);
        cursor: pointer;
      }
      .chip small {
        color: var(--muted);
      }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 9px;
        font-size: 12px;
        font-weight: 700;
      }
      .ok {
        background: #dff3ee;
        color: #0d5c55;
      }
      .fail {
        background: #fde8e8;
        color: #9f3232;
      }
      .empty {
        padding: 18px;
        color: var(--muted);
      }
      .table-wrap {
        overflow-x: auto;
      }
      .mono {
        font-family: "Cascadia Code", Consolas, monospace;
        font-size: 13px;
      }
      @media (max-width: 980px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <h1>LLM Cost Configuration</h1>
        <p>Label MYR per token for each router model, then review the actual token usage and estimated cost recorded for every LLM router call.</p>
        <div class="meta">Default router path: <span class="mono" id="defaultPath"></span></div>
      </div>

      <div class="layout">
        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Model Pricing</h2>
            <div class="helper">Set input and output pricing in MYR per 1 token. Historical call logs keep the rates that were active when the call was recorded.</div>
            <div class="token-bar">
              <input id="adminToken" type="password" placeholder="Admin token for protected API routes" />
              <button id="saveTokenButton" class="ghost" type="button">Use Token</button>
              <span class="helper" id="authHint"></span>
            </div>
            <div class="suggestions" id="modelSuggestions"></div>
          </div>
          <div class="card-body">
            <div class="toolbar">
              <button id="addRowButton" type="button">Add Pricing Row</button>
              <button id="savePricingButton" class="warn" type="button">Save Pricing</button>
              <button id="reloadButton" class="secondary" type="button">Reload</button>
            </div>
            <div class="status" id="pricingStatus">Loading pricing...</div>
          </div>
          <div class="table-wrap">
            <table class="pricing-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Input MYR/token</th>
                  <th>Output MYR/token</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="pricingTableBody"></tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2 class="card-title">Recent Router Usage</h2>
            <div class="helper">This reads from the new LLM call log so you can verify token counts, latency, and total MYR per call.</div>
            <div class="stat-grid" id="summaryStats"></div>
          </div>
          <div class="card-body">
            <div class="status" id="callsStatus">Loading recent calls...</div>
          </div>
          <div class="table-wrap">
            <table class="calls-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Route</th>
                  <th>Type</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="callsTableBody"></tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <script>
      const DEFAULT_PROVIDER = ${defaultProvider};
      const DEFAULT_MODEL = ${defaultModel};
      const ADMIN_PROTECTED = ${adminProtected};
      const STORAGE_KEY = "llm-config-admin-token";
      const PROVIDERS = ["uniapi-gemini", "uniapi-openai", "openai"];

      const adminTokenInput = document.getElementById("adminToken");
      const saveTokenButton = document.getElementById("saveTokenButton");
      const authHint = document.getElementById("authHint");
      const pricingStatus = document.getElementById("pricingStatus");
      const callsStatus = document.getElementById("callsStatus");
      const pricingTableBody = document.getElementById("pricingTableBody");
      const callsTableBody = document.getElementById("callsTableBody");
      const modelSuggestions = document.getElementById("modelSuggestions");
      const summaryStats = document.getElementById("summaryStats");
      const addRowButton = document.getElementById("addRowButton");
      const savePricingButton = document.getElementById("savePricingButton");
      const reloadButton = document.getElementById("reloadButton");

      document.getElementById("defaultPath").textContent = DEFAULT_PROVIDER + " / " + DEFAULT_MODEL;

      adminTokenInput.value = localStorage.getItem(STORAGE_KEY) || "";
      updateAuthHint();

      saveTokenButton.addEventListener("click", () => {
        localStorage.setItem(STORAGE_KEY, adminTokenInput.value.trim());
        updateAuthHint();
        void loadPageData();
      });

      addRowButton.addEventListener("click", () => {
        appendPricingRow({
          provider: DEFAULT_PROVIDER,
          model: "",
          inputCostPerTokenMyr: "",
          outputCostPerTokenMyr: ""
        });
      });

      savePricingButton.addEventListener("click", async () => {
        try {
          const entries = collectPricingEntries();
          if (!entries.length) {
            pricingStatus.textContent = "Add at least one pricing row before saving.";
            return;
          }

          pricingStatus.textContent = "Saving pricing...";
          savePricingButton.disabled = true;

          const response = await fetch("/api/playground/llm/config", {
            method: "PUT",
            headers: buildHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ entries })
          });

          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to save pricing");
          }

          pricingStatus.textContent = "Pricing saved.";
          await loadPageData();
        } catch (error) {
          pricingStatus.textContent = error.message || "Failed to save pricing";
        } finally {
          savePricingButton.disabled = false;
        }
      });

      reloadButton.addEventListener("click", () => {
        void loadPageData();
      });

      function updateAuthHint() {
        authHint.textContent = ADMIN_PROTECTED
          ? adminTokenInput.value.trim()
            ? "Protected mode active. Requests will include your token."
            : "This page can load, but the API will reject requests until you enter the admin token."
          : "Admin token is optional in this environment.";
      }

      function buildHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const token = adminTokenInput.value.trim();
        if (token) {
          headers["x-admin-token"] = token;
        }
        return headers;
      }

      function appendPricingRow(entry) {
        const row = document.createElement("tr");
        row.setAttribute("data-pricing-row", "true");
        row.innerHTML =
          '<td><select data-field="provider">' +
            PROVIDERS.map((provider) => '<option value="' + provider + '"' + (provider === entry.provider ? " selected" : "") + '>' + provider + '</option>').join("") +
          '</select></td>' +
          '<td><input data-field="model" type="text" placeholder="gpt-5.4-mini" value="' + escapeHtml(entry.model || "") + '" /></td>' +
          '<td><input data-field="inputCostPerTokenMyr" type="number" min="0" step="0.000000000001" placeholder="0.000000" value="' + escapeHtml(String(entry.inputCostPerTokenMyr ?? "")) + '" /></td>' +
          '<td><input data-field="outputCostPerTokenMyr" type="number" min="0" step="0.000000000001" placeholder="0.000000" value="' + escapeHtml(String(entry.outputCostPerTokenMyr ?? "")) + '" /></td>' +
          '<td><button class="danger" type="button" data-remove="true">Remove</button></td>';

        row.querySelector('[data-remove="true"]').addEventListener("click", () => {
          row.remove();
          if (!pricingTableBody.children.length) {
            pricingStatus.textContent = "No pricing rows yet.";
          }
        });

        pricingTableBody.appendChild(row);
      }

      function renderPricing(entries) {
        pricingTableBody.innerHTML = "";
        if (!entries.length) {
          pricingStatus.textContent = "No pricing rows saved yet.";
          return;
        }

        for (const entry of entries) {
          appendPricingRow(entry);
        }

        pricingStatus.textContent = "Loaded " + entries.length + " pricing row" + (entries.length === 1 ? "" : "s") + ".";
      }

      function renderSuggestions(models, pricingEntries) {
        modelSuggestions.innerHTML = "";
        const pricedKeys = new Set(pricingEntries.map((entry) => entry.provider + "::" + entry.model.toLowerCase()));
        const missingModels = models.filter((model) => !pricedKeys.has(model.provider + "::" + model.model.toLowerCase()));

        if (!missingModels.length) {
          modelSuggestions.innerHTML = '<span class="helper">Every detected model already has pricing.</span>';
          return;
        }

        for (const model of missingModels) {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "chip";
          chip.innerHTML = escapeHtml(model.model) + ' <small>' + escapeHtml(model.provider) + '</small>';
          chip.addEventListener("click", () => {
            appendPricingRow({
              provider: model.provider,
              model: model.model,
              inputCostPerTokenMyr: "",
              outputCostPerTokenMyr: ""
            });
            chip.remove();
            pricingStatus.textContent = "Added detected model. Fill in the MYR rates and save.";
          });
          modelSuggestions.appendChild(chip);
        }
      }

      function renderSummary(calls) {
        const totals = calls.reduce((acc, call) => {
          acc.calls += 1;
          acc.tokens += Number(call.total_tokens || 0);
          acc.cost += Number(call.total_cost_myr || 0);
          if (!call.success) {
            acc.failures += 1;
          }
          return acc;
        }, { calls: 0, tokens: 0, cost: 0, failures: 0 });

        summaryStats.innerHTML = "";
        const cards = [
          ["Calls", String(totals.calls)],
          ["Tokens", formatInteger(totals.tokens)],
          ["MYR", formatCost(totals.cost)],
          ["Failures", String(totals.failures)]
        ];

        for (const card of cards) {
          const node = document.createElement("div");
          node.className = "stat";
          node.innerHTML = '<div class="stat-label">' + card[0] + '</div><div class="stat-value">' + card[1] + "</div>";
          summaryStats.appendChild(node);
        }
      }

      function renderCalls(calls) {
        callsTableBody.innerHTML = "";
        if (!calls.length) {
          callsTableBody.innerHTML = '<tr><td colspan="7" class="empty">No router calls have been logged yet.</td></tr>';
          callsStatus.textContent = "No calls yet.";
          renderSummary([]);
          return;
        }

        renderSummary(calls);
        callsStatus.textContent = "Showing the most recent " + calls.length + " call" + (calls.length === 1 ? "" : "s") + ".";

        for (const call of calls) {
          const row = document.createElement("tr");
          const tokens = [
            "in " + formatInteger(call.input_tokens),
            "out " + formatInteger(call.output_tokens),
            "total " + formatInteger(call.total_tokens)
          ].join(" / ");
          const costs = [
            "in " + formatCost(call.input_cost_myr),
            "out " + formatCost(call.output_cost_myr),
            "total " + formatCost(call.total_cost_myr)
          ].join(" / ");
          const status = call.success
            ? '<span class="pill ok">ok</span>'
            : '<span class="pill fail">failed</span><div class="helper" style="margin-top:6px;">' + escapeHtml(call.error_message || "Unknown error") + "</div>";

          row.innerHTML =
            "<td>" + escapeHtml(formatDate(call.created_at)) + "</td>" +
            '<td><div class="mono">' + escapeHtml(call.provider_name) + "</div><div>" + escapeHtml(call.model) + "</div></td>" +
            "<td>" + escapeHtml(call.call_type) + "</td>" +
            '<td class="mono">' + escapeHtml(tokens) + "</td>" +
            '<td class="mono">' + escapeHtml(costs) + "</td>" +
            "<td>" + escapeHtml(call.latency_ms == null ? "-" : String(call.latency_ms) + " ms") + "</td>" +
            "<td>" + status + "</td>";
          callsTableBody.appendChild(row);
        }
      }

      function collectPricingEntries() {
        const rows = Array.from(pricingTableBody.querySelectorAll('[data-pricing-row="true"]'));
        const entries = rows.map((row) => {
          const provider = row.querySelector('[data-field="provider"]').value;
          const model = row.querySelector('[data-field="model"]').value.trim();
          const inputCostPerTokenMyr = Number(row.querySelector('[data-field="inputCostPerTokenMyr"]').value);
          const outputCostPerTokenMyr = Number(row.querySelector('[data-field="outputCostPerTokenMyr"]').value);
          if (!provider || !model || !Number.isFinite(inputCostPerTokenMyr) || !Number.isFinite(outputCostPerTokenMyr)) {
            throw new Error("Each row needs provider, model, input MYR/token, and output MYR/token.");
          }
          if (inputCostPerTokenMyr < 0 || outputCostPerTokenMyr < 0) {
            throw new Error("MYR per token values cannot be negative.");
          }
          return {
            provider,
            model,
            inputCostPerTokenMyr,
            outputCostPerTokenMyr
          };
        });

        const uniqueEntries = new Map();
        for (const entry of entries) {
          uniqueEntries.set(entry.provider + "::" + entry.model.toLowerCase(), entry);
        }

        return Array.from(uniqueEntries.values());
      }

      async function loadPageData() {
        pricingStatus.textContent = "Loading pricing...";
        callsStatus.textContent = "Loading recent calls...";

        try {
          const response = await fetch("/api/playground/llm/config", {
            headers: buildHeaders({ Accept: "application/json" })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to load configuration");
          }

          const entries = Array.isArray(body.entries) ? body.entries : [];
          const calls = Array.isArray(body.recentCalls) ? body.recentCalls : [];
          const models = Array.isArray(body.knownModels) ? body.knownModels : [];

          renderPricing(entries);
          renderSuggestions(models, entries);
          renderCalls(calls);
        } catch (error) {
          pricingStatus.textContent = error.message || "Failed to load pricing";
          callsStatus.textContent = error.message || "Failed to load recent calls";
          callsTableBody.innerHTML = '<tr><td colspan="7" class="empty">Router data is unavailable right now.</td></tr>';
          summaryStats.innerHTML = "";
        }
      }

      function formatDate(value) {
        if (!value) {
          return "-";
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
      }

      function formatInteger(value) {
        if (value == null || value === "") {
          return "-";
        }
        return Number(value).toLocaleString();
      }

      function formatCost(value) {
        if (value == null || value === "") {
          return "Not priced";
        }
        return "MYR " + Number(value).toFixed(6);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      void loadPageData();
    </script>
  </body>
</html>`;
}
