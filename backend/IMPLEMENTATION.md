# Ebere

> **Ebere handles it.** — Your own AI agent. No app to download, no account to create.

Ebere is a personal AI agent platform accessible through WhatsApp and Telegram. Every user gets their own agent — with persistent memory, a customisable name and personality, and the ability to extend its capabilities by adding **skills**: plain-English descriptions of new behaviours the agent should follow.

Out of the box the agent handles everyday tasks — community commerce, personal finance, inventory tracking, web search, scheduling, and reminders. Users extend it further by teaching it new skills in plain language, pointed at any public URL or typed directly in chat. No code, no installs, no configuration forms.

---

## What Users Can Do

| Capability | Example | What the agent does |
|---|---|---|
| **General chat** | "What's the capital of France?" | Answers from Gemini's knowledge directly |
| **Web search** | "What's the current dollar rate in Nigeria?" | Calls web search, returns cited sources |
| **Bookkeeping** | "Just made ₦180k from a curtain job. Materials ₦35k." | Logs income + expense, links any receipt image |
| **Marketplace** | "I'm a plumber in Surulere" / "Find a doctor in Ikeja" | Posts offer or searches; notifies both sides when matched |
| **Reports** | "Send my weekly report" | Financial summary with honest scope disclaimer |
| **Reminders** | "Remind me to invoice the client at 9am tomorrow" | Delivers reminder via the same chat |
| **Scheduling** | "Every Monday morning, summarise tech news for me" | Creates a recurring background task |
| **Skills** | "Save a skill: when I ask about budgeting, use the 50/30/20 rule" | Saves a skill; agent applies it in future conversations |
| **Import skills** | "Import a skill from https://example.com/my-skill.md" | Fetches, validates, and saves the skill file |
| **Agent config** | "Call yourself Jade" / "Be more formal" | Renames the agent and adjusts its tone |

---

## Architecture

```
WhatsApp (Meta Cloud API)  ─┐
                            ├──▶  NestJS Backend  ──▶  Google ADK (Gemini)
Telegram (Bot API)         ─┘         │                     │
                                      │          Per-user dynamic agent
                                   MongoDB       Base tools + User skills
                                   GCS           (loaded on-demand from GCS)
```

- **Channels:** WhatsApp (Meta Cloud API) + Telegram Bot API
- **Agent layer:** [Google Agent Development Kit](https://google.github.io/adk-docs/) — TypeScript (`@google/adk`)
- **LLM:** Gemini (model configurable via env)
- **Backend:** NestJS (TypeScript, modular DI)
- **Database:** MongoDB via Mongoose
- **File & skill storage:** Google Cloud Storage (GCS); local filesystem fallback in development
- **Queue / scheduling:** BullMQ + Redis

### Per-User Agent Model

Each message triggers a fresh agent build for that user:
1. User's skill index (name + auto-generated description) is fetched from MongoDB
2. User's agent config (name, tone) is read from their profile
3. A personalised `LlmAgent` is constructed with a dynamic system prompt
4. The agent decides which skills are relevant and fetches their full content from GCS on-demand
5. Session history is persisted in MongoDB — conversation context survives across rebuilds

---

## Skills System

Skills are plain-English text files (≤ 10,000 characters) stored privately in GCS. They describe how the agent should behave in specific situations, using the platform's built-in tools.

```
User: "Save a skill called price-checker:
       When asked about prices, always compare at least 3 sources
       and present them in a table with naira equivalents."

Agent → saveSkill() → validates content → stores in GCS
      → auto-generates short description for the skill index
      → future messages that match the description trigger fetchSkill()
```

Skill content is sandboxed — it cannot override system-level instructions, access other users' data, or reference filesystem paths or code patterns.

---

## Repository Structure

```
ebere/
├── backend/          # NestJS API — webhooks, agent, domain logic
├── landing-page/     # Static landing page
└── README.md         # This file
```

---

## Quick Start

### Prerequisites
- Node.js ≥ 24.13
- MongoDB instance (local, Atlas, or remote)
- Redis instance (local or remote)
- Gemini API key ([get one here](https://aistudio.google.com/app/apikey))
- Google Cloud Storage bucket (production) — local filesystem used automatically in dev

### 1. Clone & install
```bash
git clone <repo-url>
cd ebere/backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your keys — see backend/README.md for full variable list
```

### 3. Run the backend
```bash
npm run start:dev
```

### 4. Verify
```bash
curl http://localhost:3000/hello
# → { "message": "Hello from Ebere!", "app": "Ebere", "slogan": "Ebere handles it." }
```

---

## Exposing Webhooks Locally

Both WhatsApp and Telegram require a publicly accessible HTTPS URL.

```bash
npx ngrok http 3000
```

Then register the tunnel URL in:
- **Telegram:** `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<NGROK_URL>/webhook/telegram`
- **WhatsApp:** Meta Developer Console → WhatsApp → Configuration → Webhook URL: `<NGROK_URL>/webhook/whatsapp`

---

## Persona

Ebere is warm, direct, and plain-spoken — like a trusted coordinator, not an academic chatbot. She works for any community anywhere. The slogan is simple: **Ebere handles it.**

---

## License

MIT
