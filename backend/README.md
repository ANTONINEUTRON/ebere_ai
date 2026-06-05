# Ebere — Backend

NestJS API server for the Ebere personal agent platform. Handles webhook ingestion from WhatsApp and Telegram, builds a per-user dynamic agent via Google ADK, and manages all domain data in MongoDB and GCS.

> See the [root README](../README.md) for full project context.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (TypeScript, strict mode) |
| Agent | Google ADK TypeScript (`@google/adk`) — dynamic per-user agent |
| LLM | Gemini (model env-configurable) |
| Database | MongoDB via Mongoose (`@nestjs/mongoose`) |
| File & skill storage | Google Cloud Storage (prod) / local filesystem (dev) |
| Channels | Telegram Bot API, Meta WhatsApp Cloud API |
| Queue | BullMQ + Redis |
| Scheduling | `@nestjs/schedule` + node-cron |

---

## Module Structure

```
src/
+-- app.module.ts
+-- main.ts
|
+-- agent/                      # ADK agent layer (per-user dynamic build)
|   +-- ebere.agent.ts          # createEbereAgent() factory with skills injection
|   +-- runner.service.ts       # ADK Runner - builds per-user agent on each run()
|   +-- sessions/
|   |   +-- mongo-session.service.ts   # BaseSessionService backed by MongoDB
|   +-- tools/                  # FunctionTool definitions (per domain)
|       +-- identity.tools.ts
|       +-- memory.tools.ts
|       +-- notifications.tools.ts
|       +-- profile.tools.ts
|       +-- schedules.tools.ts
|       +-- skills.tools.ts     # NEW: skill CRUD exposed as agent tools
|       +-- agent-config.tools.ts  # NEW: agentName / agentTone config tools
|       +-- web-search.tool.ts
|
+-- channels/                   # Messaging channel adapters
|   +-- telegram/
|   |   +-- telegram.controller.ts  # POST /webhook/telegram (timing-safe secret)
|   |   +-- telegram.service.ts
|   +-- whatsapp/
|       +-- whatsapp.controller.ts  # GET verify + POST /webhook/whatsapp (HMAC)
|       +-- whatsapp.service.ts
|
+-- identity/                   # Identity, auth & account linking
|   +-- identity.service.ts
|   +-- link-request.schema.ts
|
+-- users/                      # User records + agentName / agentTone fields
|   +-- users.service.ts
|   +-- user.schema.ts
|
+-- media/                      # Multimodal file storage
|   +-- media.service.ts        # MIME/size validation before storing
|   +-- storage-provider.interface.ts  # store / storeText / fetchText / deleteObject
|   +-- local.storage-provider.ts     # Dev: ./uploads fallback
|   +-- gcs.storage-provider.ts       # NEW: GCS-backed provider
|   +-- media-file.schema.ts
|
+-- skills/                     # NEW: user skill management
|   +-- skills.service.ts       # CRUD + content validation + SSRF guard
|   +-- skills.module.ts
|   +-- skill.schema.ts         # MongoDB metadata record
|   +-- skill-content.validator.ts  # Blocks injection patterns, enforces size limit
|   +-- ssrf.validator.ts       # Blocks private-IP / non-HTTPS URLs
|
+-- memory/                     # Unified record store
+-- schedules/                  # Recurring background tasks
+-- notifications/              # Reminders & delivery worker
+-- safety/                     # Guard registry + pre/post tool hooks (Redis rate limiter)
```
---

## Running Locally

### Prerequisites
- Node.js ≥ 24.13
- A running MongoDB instance (local, Atlas, or remote) — set `MONGODB_URI` in `.env`
- A running Redis instance (local or remote) — set `REDIS_HOST` / `REDIS_PORT` in `.env`

### Install
```bash
npm install
```

### Environment
```bash
cp .env.example .env
# Fill in values � see Environment Variables below
```

### Development server
```bash
npm run start:dev
```

### Verify
```bash
curl http://localhost:3000/hello
# ? { "message": "Hello from Ebere!", "app": "Ebere", "slogan": "Ebere handles it." }
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: 3000) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_HOST` | Yes | Redis hostname (default: `localhost`) |
| `REDIS_PORT` | No | Redis port (default: `6379`) |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `GEMINI_MODEL` | No | Model name (default: `gemini-flash-latest`) |
| `TELEGRAM_BOT_TOKEN` | Yes | From BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Yes | Random secret for webhook header validation |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Meta Graph API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | From Meta Developer Console |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token for GET webhook verification |
| `WHATSAPP_APP_SECRET` | Yes | For HMAC signature validation on POST |
| `GCS_BUCKET` | Prod only | GCS bucket name for media and skill storage |
| `GCS_PROJECT_ID` | Prod only | Google Cloud project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Prod only | Path to service account JSON; omit for Workload Identity |
| `RATE_LIMIT_POSTS_PER_HOUR` | No | Max community posts per user per hour (default: 10) |
| `RATE_LIMIT_SKILL_FETCHES_PER_MIN` | No | Max skill fetches per user per minute (default: 30) |
| `SMTP_HOST` | No | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `MAIL_FROM` | No | Sender address (e.g. `Ebere <no-reply@ebere.app>`) |
| `SEARCH_API_KEY` | No | API key for web search provider |
| `SEARCH_PROVIDER` | No | Search backend: `brave` \| `serper` \| `google-cse` |
| `BILLING_ENABLED` | No | Set `true` to enforce quotas (default: `false` for testing) |
| `FREE_MESSAGE_LIMIT` | No | Monthly free-tier message cap |
| `PRO_PRICE_MONTHLY` | No | Pro tier price shown to users |
| `PRO_CURRENCY` | No | Currency for pro pricing (e.g. `NGN`) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/hello` | Health check � returns app info |
| `GET` | `/` | NestJS default hello |
| `POST` | `/webhook/telegram` | Telegram webhook receiver |
| `GET` | `/webhook/whatsapp` | WhatsApp webhook verification |
| `POST` | `/webhook/whatsapp` | WhatsApp webhook receiver |

---

## Scripts

```bash
npm run start:dev     # Development (watch mode)
npm run start:prod    # Production (compiled)
npm run build         # Compile TypeScript
npm run test          # Unit tests
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
npm run lint          # ESLint
```

---

## Exposing Webhooks Locally

```bash
npx ngrok http 3000
```

Register the tunnel URL:
- **Telegram:** `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<NGROK>/webhook/telegram`
- **WhatsApp:** Meta Developer Console ? WhatsApp ? Configuration ? Webhook URL + Verify Token

---

## Implementation Progress

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the full feature checklist.
