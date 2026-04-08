# Notes For Railway Deployment

## Read This First

This note is written for future AI agents and developers.

Its purpose is simple:

**Do not assume that "runs locally" means "deploys on Railway".**

Railway deployment failures have repeatedly cost hours during first deployment.
This file exists to reduce that pain.

Use this note before, during, and after the first Railway deployment of this app or any similar app.

## Core Mental Model

Railway is not your local machine.

Railway is closer to:

- a fresh Linux machine
- a clean Docker build
- a stricter startup environment
- a database that may already contain older schema state

Localhost often has hidden advantages:

- existing auth files
- existing data directories
- evolved database tables from previous runs
- Windows-specific behavior
- node/npm state that is more forgiving

**Rule: trust the Docker path more than the local path.**

If Docker fails, Railway is likely to fail.
If Docker passes, Railway risk drops a lot.

## What Actually Broke In This Project

These were the real first-deployment problems encountered while deploying this repo to Railway.

### 1. `npm ci` failed even though local install worked

Symptoms:

- Railway build failed during Docker install
- error mentioned package-lock / package.json out of sync
- missing `@emnapi/runtime`
- missing `@emnapi/core`

Root cause:

- Railway used a stricter clean-install path than the local machine
- lockfile behavior differed in a clean Linux container

Decision taken for this repo:

- use `npm install` in Docker instead of `npm ci`

Reason:

- for live testing, reliable deployment was more important than strict lockfile enforcement

Repo files involved:

- [Dockerfile](/G:/AI-Assistant/Dockerfile)
- [package.json](/G:/AI-Assistant/package.json)
- [package-lock.json](/G:/AI-Assistant/package-lock.json)

### 2. Database migrations assumed too much

Symptoms:

- app boot failed during startup migrations
- Postgres errors such as:
  - `column "chat_id" does not exist`
  - `column "sender_number" does not exist`

Root cause:

- Railway Postgres already had an older `messages` table
- migration logic assumed fresher schema than the live database actually had

Decision taken for this repo:

- harden the init migration so it can upgrade an older `messages` table safely

Repo file involved:

- [001_init.sql](/G:/AI-Assistant/src/database/migrations/001_init.sql)

### 3. Startup assumed bot identity was already configured

Symptoms:

- startup crashed with `replaceAll` on `undefined`
- page rendering failed before server could fully serve UI

Root cause:

- we intentionally moved identity management to UI
- but some pages still assumed `botName` always existed

Decision taken for this repo:

- make UI rendering safe when identity is not configured yet

Repo files involved:

- [render-agent-lab-page.ts](/G:/AI-Assistant/src/http/render-agent-lab-page.ts)
- [render-dashboard-page.ts](/G:/AI-Assistant/src/http/render-dashboard-page.ts)

### 4. Root URL was useless during ops

Symptoms:

- visiting `/` returned `Cannot GET /`

Root cause:

- no root route existed

Decision taken for this repo:

- add a real dashboard at `/`

Repo files involved:

- [render-dashboard-page.ts](/G:/AI-Assistant/src/http/render-dashboard-page.ts)
- [create-app.ts](/G:/AI-Assistant/src/http/create-app.ts)

### 5. Basic health was not enough

Symptoms:

- dashboard showed DB and WhatsApp only
- most important UniAPI / LLM route status was missing

Decision taken for this repo:

- root dashboard now uses full health
- prioritize:
  - `llm_router`
  - `gemini_web_search`
  - `openai_capabilities`

Repo files involved:

- [create-app.ts](/G:/AI-Assistant/src/http/create-app.ts)
- [render-dashboard-page.ts](/G:/AI-Assistant/src/http/render-dashboard-page.ts)
- [health-service.ts](/G:/AI-Assistant/src/services/health-service.ts)

## Stable Rules For Future AI

If you are an AI agent preparing a first Railway deployment, follow these rules.

### Rule 1: Docker is the deployment truth

Before telling anyone "ready to deploy", run:

```powershell
npm run build
docker build --no-cache -t ai-assistant-test .
```

If either fails:

- do not trust localhost
- do not say deployment is ready

### Rule 2: Assume the Railway DB may be older than local

When touching migrations:

- do not assume the table already has the latest columns
- add columns defensively
- backfill before adding constraints/indexes
- avoid one-shot assumptions like "column already exists because it exists locally"

### Rule 3: Separate infrastructure config from product config

Infrastructure belongs in env:

- database URL
- storage paths
- API keys
- runtime mode
- admin token

Product behavior belongs in UI/database settings:

- bot identity
- bot aliases
- role description
- authority policy

### Rule 4: Startup must tolerate missing optional config

The app should boot even when:

- bot identity is not configured yet
- WhatsApp is not connected yet
- company DB is missing
- some optional model keys are absent

Only truly required infrastructure should block startup.

### Rule 5: First deploy must optimize for observability

A first Railway deploy should immediately answer:

- Did the server boot?
- Did migrations complete?
- Is DB reachable?
- Is LLM router configured?
- Is WhatsApp runtime healthy?
- Is WhatsApp connected?

That means:

- root dashboard must be useful
- `/health`
- `/health/full`

must be meaningful

## Railway Environment Guidance

### Minimum required

```env
DATABASE_URL=<railway postgres url>
PORT=3000
```

### WhatsApp with persistent storage

If using Railway persistent storage mounted at `/storage`:

```env
WHATSAPP_MODE=agent
WHATSAPP_AUTH_DIR=/storage/baileys-auth
MEDIA_STORAGE_DIR=/storage/media
```

### LLM routing

Typical setup:

```env
UNIAPI_API_KEY=<your key>
LLM_ROUTER_PROVIDER=uniapi-gemini
LLM_ROUTER_MODEL=gemini-3.1-flash-lite-preview
UNIAPI_GEMINI_BASE_URL=https://api.uniapi.io/gemini
UNIAPI_OPENAI_BASE_URL=https://api.uniapi.io/v1
```

Optional OpenAI capabilities:

```env
OPENAI_API_KEY=<your key>
OPENAI_REASONING_MODEL=gpt-5.4-mini
OPENAI_VISION_MODEL=gpt-5.4-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
HEALTHCHECK_MODEL=gpt-5.4-mini
```

### Admin protection

```env
ADMIN_API_TOKEN=<strong token>
```

### Optional

```env
BOOTSTRAP_WHATSAPP_NUMBER=
TESTER_WHATSAPP_NUMBERS=
AUTONOMY_MODE=low-risk
```

## Important Product Rule For This Repo

**Do not manage agent identity from Railway env for normal operation.**

Avoid using env as the long-term source of truth for:

- `BOT_NAME`
- `BOT_ALIASES`
- `BOT_ROLE_DESCRIPTION`

For this repo, identity should be set from UI:

- `/playground/agent-identity`

Why:

- identity is product behavior
- env is infrastructure

This separation matters.

## Persistent Storage Rule

If Railway storage is mounted at `/storage`, point app storage there:

```env
WHATSAPP_AUTH_DIR=/storage/baileys-auth
MEDIA_STORAGE_DIR=/storage/media
```

Reason:

- WhatsApp session should survive redeploy
- downloaded media should survive redeploy

If a session was previously stored in an ephemeral location, expect to scan QR once after switching to `/storage`.

## First-Time Railway Deployment Checklist

Use this exact order.

### Before push

1. Run:

```powershell
npm run build
docker build --no-cache -t ai-assistant-test .
```

2. If migrations changed, ask:

- would this work against an older table?
- not just the local DB?

3. Confirm the app can boot without optional product config:

- no bot identity yet
- no WhatsApp yet

### After pushing

1. Verify Railway env is correct
2. Verify persistent storage paths
3. Redeploy
4. Open `/`
5. Open `/health`
6. Open `/health/full`

### After successful boot

1. Configure identity from UI
2. Configure authority policy from UI
3. Check QR / onboarding flow
4. Check root dashboard health cards

## Failure Pattern Cheat Sheet

### `Cannot GET /`

Meaning:

- server is probably running
- root route is missing

For this repo:

- this should no longer happen after dashboard addition

### `/health` returns JSON

Meaning:

- app booted
- Express is up

This is a good sign even if `/` is bad.

### Repeated `Fatal startup error`

Meaning:

- crash loop

Likely causes:

- migration failure
- startup rendering assumption
- config assumption

### `WhatsApp not connected yet`

Meaning:

- app is up
- WhatsApp session is not connected yet

This is not a deployment failure.

### Build fails at npm install

Meaning:

- container install path is broken
- do not trust local node_modules

### Missing DB columns during startup

Meaning:

- migration assumed too much about the existing live schema

Fix approach:

- defensive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- backfill values
- only then add constraints/indexes

## Why This Note Matters

The repeated pain pattern was:

1. local app works
2. Railway deploy fails in a different way
3. hours are spent debugging first deployment
4. same category of lesson has to be rediscovered later

This note is meant to break that cycle.

The real principle is:

**first Railway deployment is an environment-hardening exercise, not just a git push**

## What Future AI Should Do

If a future AI agent reads this before deploying:

1. read this file first
2. treat Docker as truth
3. treat migrations as legacy-sensitive
4. avoid env-based product config unless explicitly required
5. make root dashboard and health meaningful
6. expect Railway to expose hidden assumptions that local did not

If this discipline is followed, future Railway deploys should be much less painful than the first one.
