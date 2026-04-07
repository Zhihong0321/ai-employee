export function renderAgentIdentityPage(input: {
  adminProtected: boolean;
}): string {
  const adminProtected = JSON.stringify(input.adminProtected);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Identity</title>
    <style>
      :root {
        --bg: #f3f1ea;
        --panel: rgba(255, 252, 247, 0.94);
        --ink: #1f1b17;
        --muted: #6d655c;
        --accent: #166534;
        --accent-2: #dff2e5;
        --border: #ddd4c6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, #fff8ef, transparent 30%),
          linear-gradient(180deg, #faf6ef 0%, var(--bg) 100%);
      }
      .wrap {
        max-width: 960px;
        margin: 0 auto;
        padding: 28px 18px 44px;
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 22px;
        box-shadow: 0 14px 40px rgba(59, 43, 24, 0.08);
        padding: 22px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 38px;
      }
      p, .helper, .status {
        color: var(--muted);
      }
      label {
        display: block;
        margin: 16px 0 8px;
        font-weight: 700;
      }
      input, textarea {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
        background: #fff;
        color: var(--ink);
      }
      textarea {
        min-height: 140px;
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
      button.secondary {
        background: #6b7280;
      }
      .toolbar {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-top: 18px;
      }
      .status {
        min-height: 24px;
        margin-top: 12px;
      }
      .preview {
        margin-top: 22px;
        padding: 16px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--accent-2);
      }
      .mono {
        font-family: "Cascadia Code", Consolas, monospace;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Agent Identity</h1>
        <p>Set the AI teammate name, mention aliases, and role description. Group-chat addressing and planner behavior will use these values live.</p>

        <label for="adminToken">Admin token</label>
        <input id="adminToken" type="password" placeholder="Required only when admin protection is enabled" />

        <label for="agentName">Agent name</label>
        <input id="agentName" placeholder="Eter" />

        <label for="agentAliases">Aliases</label>
        <input id="agentAliases" placeholder="eter,@eter,assistant" />
        <div class="helper">Comma-separated. Mentions using these aliases will count as addressing the agent.</div>

        <label for="roleDescription">Role description</label>
        <textarea id="roleDescription" placeholder="Describe how this teammate should behave and what it is responsible for."></textarea>

        <div class="toolbar">
          <button id="saveButton" type="button">Save Identity</button>
          <button id="reloadButton" class="secondary" type="button">Reload</button>
        </div>

        <div class="status" id="status">Loading identity...</div>

        <div class="preview">
          <strong>Preview</strong>
          <div style="height:10px"></div>
          <div>Name: <span id="previewName" class="mono">-</span></div>
          <div style="margin-top:6px;">Aliases: <span id="previewAliases" class="mono">-</span></div>
          <div style="margin-top:6px;">Role: <span id="previewRole">-</span></div>
        </div>
      </div>
    </div>

    <script>
      const ADMIN_PROTECTED = ${adminProtected};
      const STORAGE_KEY = "agent-identity-admin-token";
      const adminToken = document.getElementById("adminToken");
      const agentName = document.getElementById("agentName");
      const agentAliases = document.getElementById("agentAliases");
      const roleDescription = document.getElementById("roleDescription");
      const statusEl = document.getElementById("status");
      const previewName = document.getElementById("previewName");
      const previewAliases = document.getElementById("previewAliases");
      const previewRole = document.getElementById("previewRole");
      const saveButton = document.getElementById("saveButton");
      const reloadButton = document.getElementById("reloadButton");

      adminToken.value = localStorage.getItem(STORAGE_KEY) || "";

      function buildHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const token = adminToken.value.trim();
        if (token) {
          headers["x-admin-token"] = token;
        }
        return headers;
      }

      function renderPreview() {
        previewName.textContent = agentName.value.trim() || "-";
        previewAliases.textContent = agentAliases.value.trim() || "-";
        previewRole.textContent = roleDescription.value.trim() || "-";
      }

      async function loadIdentity() {
        statusEl.textContent = "Loading identity...";
        try {
          const response = await fetch("/api/playground/agent-identity", {
            headers: buildHeaders({ Accept: "application/json" })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to load identity");
          }

          const identity = body.identity || {};
          agentName.value = identity.name || "";
          agentAliases.value = Array.isArray(identity.aliases) ? identity.aliases.join(", ") : "";
          roleDescription.value = identity.roleDescription || "";
          renderPreview();
          statusEl.textContent = ADMIN_PROTECTED && !adminToken.value.trim()
            ? "Loaded. Enter the admin token before saving changes."
            : "Identity loaded.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to load identity";
        }
      }

      saveButton.addEventListener("click", async () => {
        localStorage.setItem(STORAGE_KEY, adminToken.value.trim());
        renderPreview();
        statusEl.textContent = "Saving identity...";
        saveButton.disabled = true;

        try {
          const response = await fetch("/api/playground/agent-identity", {
            method: "PUT",
            headers: buildHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              name: agentName.value.trim(),
              aliases: agentAliases.value.split(",").map((value) => value.trim()).filter(Boolean),
              roleDescription: roleDescription.value.trim()
            })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to save identity");
          }

          const identity = body.identity || {};
          agentName.value = identity.name || "";
          agentAliases.value = Array.isArray(identity.aliases) ? identity.aliases.join(", ") : "";
          roleDescription.value = identity.roleDescription || "";
          renderPreview();
          statusEl.textContent = "Identity saved. New messages will use the updated identity.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to save identity";
        } finally {
          saveButton.disabled = false;
        }
      });

      reloadButton.addEventListener("click", () => {
        void loadIdentity();
      });

      agentName.addEventListener("input", renderPreview);
      agentAliases.addEventListener("input", renderPreview);
      roleDescription.addEventListener("input", renderPreview);

      void loadIdentity();
    </script>
  </body>
</html>`;
}
