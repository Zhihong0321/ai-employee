# AI Assistant MVP

Single-server WhatsApp AI employee built around:

- Baileys for WhatsApp messaging
- internal LLM router with swappable providers
- OpenAI for reasoning, vision, transcription, and web search
- Postgres for raw chat logs, memory, contacts, tasks, and scheduled jobs

## What this MVP does

- Connect to a dedicated WhatsApp account with Baileys
- Store every inbound and outbound message in Postgres
- Transcribe voice notes with `gpt-4o-transcribe`
- Analyze images with `gpt-5.4-mini`
- Use OpenAI web search when needed
- Route core reasoning calls through an internal provider router
- Support UniAPI Gemini as the default reasoning provider
- Support UniAPI OpenAI-compatible models through the same router
- Store contacts, facts, claims, tasks, decision logs, and scheduled reminders
- Poll due jobs and execute reminders automatically
- Provide bootstrap, onboarding, and health endpoints over HTTP

## Local dev, deploy, test, debug loop

### 1. Prepare local env

The repository now supports a simple local-first loop:

- Docker runs Postgres
- the app runs on your host for fast `tsx` reloads
- a compiled container run is available for deploy smoke tests

Create `.env` from the example:

```powershell
Copy-Item .env.example .env
```

The example is already wired for local Docker Postgres and starts with `ENABLE_WHATSAPP=false` so the app can boot without forcing a QR login during setup.

Add keys when you are ready:

- `UNIAPI_API_KEY` for routed reasoning
- `OPENAI_API_KEY` for transcription, vision, and web search
- `BOOTSTRAP_WHATSAPP_NUMBER` when you want the initiator seeded automatically

For the two local tests you asked for:

- Gemini playground needs `UNIAPI_API_KEY`
- Baileys onboarding does not need model keys, but it does write WhatsApp auth files into `WHATSAPP_AUTH_DIR`

### 2. Install dependencies

```powershell
npm install
```

### 3. Start local Postgres in Docker

```powershell
npm run db:up
```

This boots:

- agent DB at `postgres://postgres:postgres@localhost:5433/ai_assistant`
- company read-only DB at `postgres://company_reader:company_reader@localhost:5433/company_prod`

The compose init scripts also seed a small `branch_directory` table in `company_prod` so read-only DB checks have something real to query.

### 4. Verify baseline health

```powershell
npm run healthcheck
```

Expected without API keys:

- agent DB: ok
- company DB: ok
- LLM or OpenAI checks: skipped or degraded until keys are added

### 5. Run the app in fast dev mode

```powershell
npm run dev
```

Useful URLs:

- [http://localhost:3001/health](http://localhost:3001/health)
- [http://localhost:3001/health/full](http://localhost:3001/health/full)

### 6. Run with a debugger attached

```powershell
npm run dev:debug
```

That opens the Node inspector on `localhost:9229`. Use it when you want breakpoints or step-through debugging while still running the TypeScript entrypoint directly.

### 7. Smoke-test the compiled container deploy

```powershell
npm run docker:up
```

That builds the production image and runs the app against the Docker Postgres service. Stop it with:

```powershell
npm run docker:down
```

### 8. Enable WhatsApp when ready

Once DB and HTTP health look good:

1. set `ENABLE_WHATSAPP=true` in `.env`
2. add your provider keys
3. restart `npm run dev`
4. scan the QR in the terminal on first login

Auth files and downloaded media stay under `./data`, which is gitignored.

## Focused local tests

### Gemini playground

This is the quickest proof that your LLM router and `gemini-3.1-flash-lite-preview` path work from local `.env`.

1. Put your `UNIAPI_API_KEY` into [`.env`](G:\AI-Assistant\.env)
2. Run:

```powershell
npm run playground:gemini
```

What you get:

- terminal chat loop
- current router provider and model printed on startup
- `/reset` clears history
- `/system <text>` changes the system prompt
- `/exit` quits

If this works, your local router-to-UniAPI Gemini path is proven.

### Baileys onboarding

This is a standalone QR/login flow for the WhatsApp account the bot will use.

Run:

```powershell
npm run whatsapp:onboard
```

What it does:

- creates the auth directory if needed
- prints the WhatsApp QR in the terminal
- stores credentials locally in `WHATSAPP_AUTH_DIR`
- prints the connected account id once login succeeds

After that, you can stop the script and start the main app with `ENABLE_WHATSAPP=true`.

## Main endpoints

- `GET /health`
- `GET /health/full`
- `POST /admin/bootstrap`
- `POST /admin/contacts`
- `POST /admin/facts`
- `POST /admin/assets/url`
- `POST /admin/llm/test`
- `GET /admin/jobs`

Use header `x-admin-token: <ADMIN_API_TOKEN>` for admin routes.

## Bootstrap examples

Set the first trusted human:

```powershell
curl -X POST http://localhost:3001/admin/bootstrap ^
  -H "Content-Type: application/json" ^
  -H "x-admin-token: change-me" ^
  -d "{\"whatsappNumber\":\"+60123456789\",\"name\":\"Zhi Hong\",\"role\":\"Initiator\",\"authorityLevel\":5,\"domains\":[\"company_bootstrap\",\"operations\"]}"
```

Add Human APIs:

```powershell
curl -X POST http://localhost:3001/admin/contacts ^
  -H "Content-Type: application/json" ^
  -H "x-admin-token: change-me" ^
  -d "{\"contacts\":[{\"whatsappNumber\":\"+60111111111\",\"name\":\"CEO\",\"role\":\"CEO\",\"authorityLevel\":5,\"domains\":[\"strategy\",\"company_direction\"]},{\"whatsappNumber\":\"+60222222222\",\"name\":\"IT Manager\",\"role\":\"IT Manager\",\"authorityLevel\":4,\"domains\":[\"systems\",\"bugs\",\"infra\"]}]}"
```

Seed company facts:

```powershell
curl -X POST http://localhost:3001/admin/facts ^
  -H "Content-Type: application/json" ^
  -H "x-admin-token: change-me" ^
  -d "{\"sourceContactNumber\":\"+60123456789\",\"facts\":[{\"factKey\":\"company:name\",\"subject\":\"company\",\"predicate\":\"name\",\"value\":\"My Company\"},{\"factKey\":\"branch:seremban:exists\",\"subject\":\"branch:seremban\",\"predicate\":\"exists\",\"value\":\"true\"}]}"
```

## Notes

- `company_prod` access is read-only by design. The app rejects non-SELECT SQL.
- The scheduler is internal. No OS cron is required.
- Full raw chat is stored for audit. Structured memory is stored separately.
- Core planning and reply generation go through `src/llm/llm-router.ts`.
- Default router target is `uniapi-gemini` with `gemini-3.1-flash-lite-preview`.
- `npm run build` now copies SQL migrations into `dist`, so compiled and Docker runs apply migrations correctly.

## LLM Router

The app now has an internal provider router so business logic does not call UniAPI or OpenAI directly for core reasoning.

- Router entrypoint: `src/llm/llm-router.ts`
- UniAPI Gemini adapter: `src/llm/providers/uniapi-gemini-provider.ts`
- UniAPI OpenAI-compatible adapter: `src/llm/providers/uniapi-openai-provider.ts`
- OpenAI adapter: `src/llm/providers/openai-provider.ts`

Current default:

- provider: `uniapi-gemini`
- model: `gemini-3.1-flash-lite-preview`
- base URL: `https://api.uniapi.io/gemini`

Also supported:

- provider: `uniapi-openai`
- base URL: `https://api.uniapi.io/v1`
- uses the same `UNIAPI_API_KEY`
- can target OpenAI-compatible models exposed by UniAPI

OpenAI is still used for:

- audio transcription
- image understanding
- web-search tool access
