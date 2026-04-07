export function renderCompanyDbConfigPage(input: {
  adminProtected: boolean;
}): string {
  const adminProtected = JSON.stringify(input.adminProtected);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Company DB Config</title>
    <style>
      :root {
        --bg: #f2efe8;
        --panel: rgba(255, 251, 246, 0.95);
        --ink: #1c1814;
        --muted: #6e655a;
        --accent: #0f766e;
        --accent-2: #d8f0ed;
        --border: #ddd1c2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, #fff8ee, transparent 30%),
          linear-gradient(180deg, #faf6ef 0%, var(--bg) 100%);
      }
      .wrap {
        max-width: 980px;
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
        min-height: 120px;
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
        flex-wrap: wrap;
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
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Company DB Config</h1>
        <p>Manage the read-only company database connection string from UI instead of relying only on Railway environment variables.</p>

        <label for="adminToken">Admin token</label>
        <input id="adminToken" type="password" placeholder="Required only when admin protection is enabled" />

        <label for="connectionString">Connection string</label>
        <textarea id="connectionString" placeholder="postgresql://user:pass@host:5432/dbname"></textarea>
        <div class="helper">This is intended for the read-only company database. The app will continue to reject non-SELECT/WITH SQL queries.</div>

        <div class="toolbar">
          <button id="saveButton" type="button">Save Config</button>
          <button id="testButton" type="button">Test Connection</button>
          <button id="reloadButton" class="secondary" type="button">Reload</button>
        </div>

        <div class="status" id="status">Loading company DB config...</div>

        <div class="preview">
          <strong>Current status</strong>
          <div style="height:10px"></div>
          <div>Effective source: <span id="previewSource" class="mono">-</span></div>
          <div style="margin-top:6px;">Configured: <span id="previewConfigured">-</span></div>
        </div>
      </div>
    </div>

    <script>
      const ADMIN_PROTECTED = ${adminProtected};
      const STORAGE_KEY = "company-db-config-admin-token";
      const adminToken = document.getElementById("adminToken");
      const connectionString = document.getElementById("connectionString");
      const statusEl = document.getElementById("status");
      const previewSource = document.getElementById("previewSource");
      const previewConfigured = document.getElementById("previewConfigured");
      const saveButton = document.getElementById("saveButton");
      const testButton = document.getElementById("testButton");
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

      function renderPreview(body) {
        const status = body && body.status ? body.status : {};
        previewSource.textContent = status.source || "-";
        previewConfigured.textContent = status.configured ? "yes" : "no";
      }

      async function loadConfig() {
        statusEl.textContent = "Loading company DB config...";
        try {
          const response = await fetch("/api/playground/company-db", {
            headers: buildHeaders({ Accept: "application/json" })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to load company DB config");
          }

          const config = body.config || {};
          connectionString.value = config.connectionString || "";
          renderPreview(body);
          statusEl.textContent = ADMIN_PROTECTED && !adminToken.value.trim()
            ? "Loaded. Enter the admin token before saving changes."
            : "Company DB config loaded.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to load company DB config";
        }
      }

      saveButton.addEventListener("click", async () => {
        localStorage.setItem(STORAGE_KEY, adminToken.value.trim());
        statusEl.textContent = "Saving company DB config...";
        saveButton.disabled = true;

        try {
          const response = await fetch("/api/playground/company-db", {
            method: "PUT",
            headers: buildHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              connectionString: connectionString.value.trim()
            })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to save company DB config");
          }

          connectionString.value = body.config?.connectionString || "";
          renderPreview(body);
          statusEl.textContent = "Company DB config saved.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to save company DB config";
        } finally {
          saveButton.disabled = false;
        }
      });

      testButton.addEventListener("click", async () => {
        localStorage.setItem(STORAGE_KEY, adminToken.value.trim());
        statusEl.textContent = "Testing company DB connection...";
        testButton.disabled = true;

        try {
          const response = await fetch("/api/playground/company-db/test", {
            method: "POST",
            headers: buildHeaders({ "Content-Type": "application/json" })
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(body.error || "Failed to test company DB connection");
          }

          renderPreview(body);
          statusEl.textContent = "Company DB connection is healthy.";
        } catch (error) {
          statusEl.textContent = error.message || "Failed to test company DB connection";
        } finally {
          testButton.disabled = false;
        }
      });

      reloadButton.addEventListener("click", () => {
        void loadConfig();
      });

      void loadConfig();
    </script>
  </body>
</html>`;
}
