import { HealthReport } from "../types.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type DashboardCard = {
  title: string;
  description: string;
  href: string;
  label: string;
};

export function renderDashboardPage(input: {
  appName: string;
  botName?: string | null;
  adminProtected: boolean;
  health: HealthReport;
}): string {
  const safeBotName = String(input.botName ?? "").trim() || "Not configured";
  const healthPriority = ["llm_router", "gemini_web_search", "openai_capabilities", "agent_db", "company_db", "whatsapp"];
  const cards: DashboardCard[] = [
    {
      title: "WhatsApp Console",
      description: "Open stored chats, thread context, tester setup, and manual WhatsApp send tools.",
      href: "/playground/whatsapp",
      label: "Open WhatsApp"
    },
    {
      title: "WhatsApp QR Setup",
      description: "Start or reset the Baileys onboarding flow and scan the QR code for the bot account.",
      href: "/playground/whatsapp/onboarding",
      label: "Open QR Setup"
    },
    {
      title: "Agent Identity",
      description: "Set the AI name, aliases, and role from UI instead of hardcoding them in environment variables.",
      href: "/playground/agent-identity",
      label: "Open Identity"
    },
    {
      title: "Authority Policy",
      description: "Configure single source of truth behavior and protect sensitive authority changes.",
      href: "/playground/authority-policy",
      label: "Open Authority"
    },
    {
      title: "Company DB",
      description: "Configure and test the read-only company database connection from UI.",
      href: "/playground/company-db",
      label: "Open Company DB"
    },
    {
      title: "Agent Lab",
      description: "Run local reasoning tests and inspect planner output before touching live WhatsApp.",
      href: "/playground/agent-lab",
      label: "Open Agent Lab"
    },
    {
      title: "LLM Config",
      description: "Inspect provider, model, and pricing configuration used by the runtime.",
      href: "/playground/llm/config",
      label: "Open LLM Config"
    }
  ];

  const orderedChecks = [...input.health.checks].sort((left, right) => {
    const leftIndex = healthPriority.indexOf(left.name);
    const rightIndex = healthPriority.indexOf(right.name);
    const normalizedLeft = leftIndex === -1 ? healthPriority.length : leftIndex;
    const normalizedRight = rightIndex === -1 ? healthPriority.length : rightIndex;
    return normalizedLeft - normalizedRight;
  });

  const routerCheck = orderedChecks.find((check) => check.name === "llm_router");
  const searchCheck = orderedChecks.find((check) => check.name === "gemini_web_search");

  const healthItems = orderedChecks
    .map(
      (check) =>
        `<div class="health-item ${check.ok ? "ok" : "warn"}">
          <strong>${escapeHtml(check.name)}</strong>
          <div class="health-detail">${escapeHtml(check.detail)}</div>
        </div>`
    )
    .join("");

  const cardItems = cards
    .map(
      (card) =>
        `<article class="card">
          <h2>${escapeHtml(card.title)}</h2>
          <p>${escapeHtml(card.description)}</p>
          <a class="button" href="${escapeHtml(card.href)}">${escapeHtml(card.label)}</a>
        </article>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.appName)} Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe8;
        --panel: rgba(255, 251, 246, 0.94);
        --ink: #181512;
        --muted: #6d6459;
        --accent: #176b87;
        --accent-soft: #d9edf4;
        --border: #ddd1c2;
        --ok: #2f7d4a;
        --warn: #a05f17;
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
      .wrap {
        max-width: 1200px;
        margin: 0 auto;
        padding: 28px 18px 42px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 16px 40px var(--shadow);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 40px;
        line-height: 1.02;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      p, .meta, .health-detail {
        color: var(--muted);
      }
      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
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
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 20px;
      }
      .card, .health {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 20px;
        box-shadow: 0 16px 40px var(--shadow);
      }
      .button {
        display: inline-block;
        margin-top: 10px;
        text-decoration: none;
        border-radius: 999px;
        padding: 10px 14px;
        color: white;
        background: var(--accent);
        font-weight: 700;
      }
      .health-grid {
        display: grid;
        gap: 12px;
        margin-top: 12px;
      }
      .health-item {
        border-radius: 16px;
        border: 1px solid var(--border);
        background: #fff;
        padding: 12px 14px;
      }
      .health-item.ok strong {
        color: var(--ok);
      }
      .health-item.warn strong {
        color: var(--warn);
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .links a {
        color: var(--accent);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <h1>${escapeHtml(input.appName)}</h1>
        <p>Central dashboard for live Railway access, settings, local playground tools, and WhatsApp onboarding.</p>
        <div class="meta-row">
          <div class="pill"><strong>Agent:</strong> ${escapeHtml(safeBotName)}</div>
          <div class="pill"><strong>WhatsApp:</strong> live gateway</div>
          <div class="pill"><strong>Admin:</strong> ${escapeHtml(input.adminProtected ? "token protected" : "not configured")}</div>
          <div class="pill"><strong>Health:</strong> ${escapeHtml(input.health.status)}</div>
          <div class="pill"><strong>LLM Router:</strong> ${escapeHtml(routerCheck?.ok ? "ok" : "check needed")}</div>
          <div class="pill"><strong>UniAPI Search:</strong> ${escapeHtml(searchCheck?.ok ? "ok" : "check needed")}</div>
        </div>
        <div class="links">
          <a href="/health">Basic Health</a>
          <a href="/health/full">Full Health</a>
        </div>
      </section>

      <section class="grid">
        ${cardItems}
      </section>

      <section class="health" style="margin-top: 20px;">
        <h2>Runtime Health</h2>
        <p>Full health view with LLM router and UniAPI-related checks prioritized first.</p>
        <div class="health-grid">${healthItems}</div>
      </section>
    </div>
  </body>
</html>`;
}
