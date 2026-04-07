export function renderAuthorityPolicyPage(input: {
  adminProtected: boolean;
}): string {
  const adminProtected = JSON.stringify(input.adminProtected);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authority Policy</title>
    <style>
      :root {
        --bg: #f3f1ea;
        --panel: rgba(255, 252, 247, 0.94);
        --ink: #1f1b17;
        --muted: #6d655c;
        --accent: #7c3aed;
        --accent-2: #efe7ff;
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
      input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
        background: #fff;
        color: var(--ink);
      }
      .checkbox {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        margin-top: 16px;
      }
      .checkbox input {
        width: auto;
        margin-top: 4px;
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
        <h1>Authority Policy</h1>
        <p>Define who the agent treats as the single source of truth for sensitive authority changes, org-chart updates, and “ignore this person” style instructions.</p>

        <label for="adminToken">Admin token</label>
        <input id="adminToken" type="password" placeholder="Required only when admin protection is enabled" />

        <label for="singleSourceNumber">Single source of truth number</label>
        <input id="singleSourceNumber" placeholder="601121000099" />
        <div class="helper">Use the WhatsApp number that is allowed to confirm sensitive authority changes.</div>

        <label class="checkbox">
          <input id="requireSingleSource" type="checkbox" />
          <span>Require the configured single source of truth for sensitive authority changes</span>
        </label>

        <div class="toolbar">
          <button id="saveButton" type="button">Save Policy</button>
          <button id="reloadButton" class="secondary" type="button">Reload</button>
        </div>

        <div class="status" id="status">Loading authority policy...</div>

        <div class="preview">
          <strong>Preview</strong>
          <div style="height:10px"></div>
          <div>Single source number: <span id="previewNumber" class="mono">-</span></div>
          <div style="margin-top:6px;">Strict single-source mode: <span id="previewMode">-</span></div>
        </div>
      </div>
    </div>

    <script>
      const ADMIN_PROTECTED = ${adminProtected};
      const STORAGE_KEY = "authority-policy-admin-token";
      const adminToken = document.getElementById("adminToken");
      const singleSourceNumber = document.getElementById("singleSourceNumber");
      const requireSingleSource = document.getElementById("requireSingleSource");
      const statusEl = document.getElementById("status");
      const previewNumber = document.getElementById("previewNumber");
      const previewMode = document.getElementById("previewMode");
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
        previewNumber.textContent = singleSourceNumber.value.trim() || "-";
        previewMode.textContent = requireSingleSource.checked ? "required" : "fallback allowed";
      }

      async function loadPolicy() {
        statusEl.textContent = "Loading authority policy...";
        try {
          const response = await fetch("/api/playground/authority-policy", {
            headers: buildHeaders({ Accept: "application/json" })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to load authority policy");
          }

          const policy = body.policy || {};
          singleSourceNumber.value = policy.singleSourceOfTruthNumber || "";
          requireSingleSource.checked = policy.requireSingleSourceOfTruthForSensitiveChanges !== false;
          renderPreview();
          statusEl.textContent = ADMIN_PROTECTED && !adminToken.value.trim()
            ? "Loaded. Enter the admin token before saving changes."
            : "Authority policy loaded.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to load authority policy";
        }
      }

      saveButton.addEventListener("click", async () => {
        localStorage.setItem(STORAGE_KEY, adminToken.value.trim());
        renderPreview();
        statusEl.textContent = "Saving authority policy...";
        saveButton.disabled = true;

        try {
          const response = await fetch("/api/playground/authority-policy", {
            method: "PUT",
            headers: buildHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              singleSourceOfTruthNumber: singleSourceNumber.value.trim(),
              requireSingleSourceOfTruthForSensitiveChanges: requireSingleSource.checked
            })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to save authority policy");
          }

          const policy = body.policy || {};
          singleSourceNumber.value = policy.singleSourceOfTruthNumber || "";
          requireSingleSource.checked = policy.requireSingleSourceOfTruthForSensitiveChanges !== false;
          renderPreview();
          statusEl.textContent = "Authority policy saved. New messages will use the updated authority rules.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to save authority policy";
        } finally {
          saveButton.disabled = false;
        }
      });

      reloadButton.addEventListener("click", () => {
        void loadPolicy();
      });

      singleSourceNumber.addEventListener("input", renderPreview);
      requireSingleSource.addEventListener("input", renderPreview);

      void loadPolicy();
    </script>
  </body>
</html>`;
}
