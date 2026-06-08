# Ebere — The AI That Connects People and Gets Things Done

> **Ebere handles it.** No app to download. No account to create. Just message.

---

## The Problem

Across Africa and emerging markets, millions of everyday transactions still happen through word of mouth. A mother needs a reliable plumber. A tailor wants to reach new customers. A small trader needs to track cash flow. A community leader wants to broadcast local opportunities.

Today, these people bounce between dozens of apps — classifieds, spreadsheets, WhatsApp groups with thousands of unread messages, paper notebooks — or they simply give up and rely on luck.

There is no single, frictionless layer that **connects people who need services with people who offer them**, while also helping both sides manage their money and operations — all without installing anything.

---

## The Solution

**Ebere is a personal AI agent that lives inside WhatsApp and Telegram.** Every user gets their own agent — with persistent memory, a customisable personality, and a built-in marketplace that connects them to people and businesses around them.

No download. No sign-up form. No learning curve. You message Ebere the same way you message a friend.

---

## How Ebere Connects People and Businesses

Ebere's marketplace is conversational and automatic. There are no listing pages to browse, no search filters to configure — you just talk.

### Posting an Offer

> **User:** "I'm a plumber in Surulere. I also cover Yaba and Ikeja."
>
> **Ebere:** Saves the offer, registers the service areas, and *immediately* searches for anyone nearby who has posted a plumbing request. If matches exist, they are surfaced right away.

### Finding a Service

> **User:** "I need a doctor in Ikeja."
>
> **Ebere:** Searches the community board for healthcare providers in Ikeja. If a match is found, the user can express interest with a single message. If no match exists, Ebere saves a standing request and **proactively notifies the user** when a matching provider shows up.

### The Connection Flow

1. **Person A** posts an offer or a need.
2. **Person B** finds the listing and expresses interest — Ebere notifies Person A.
3. **Person A** reviews interested people (presented by name and area, never by ID) and approves the connection.
4. **Ebere sends both parties each other's contact details** — phone number (with a tap-to-chat WhatsApp or Telegram link) or email — directly in their chat.
5. They connect. No middleman fees. No platform lock-in.

### Proactive Matching

Ebere doesn't wait for users to search. When a plumber registers in Surulere, Ebere automatically checks: *"Is anyone in Surulere looking for a plumber right now?"* If yes, the plumber sees the opportunity immediately. If not, Ebere remembers — and notifies them the moment a match appears.

This turns Ebere from a passive directory into an **active matchmaker** for local commerce.

---

## Beyond Connections: A Full Business-in-a-Chat

Ebere isn't just a marketplace. It's an operating system for small operators — all through conversation.

### 💰 Financial Tracking

> "Just made ₦180k from a curtain job. Materials cost ₦35k."

Ebere logs income, expenses, and receipt photos. Ask for a weekly or monthly report and get an honest financial summary — with a clear disclaimer about scope.

### 📦 Inventory Management

> "I have 100 bags of rice at ₦15k cost, ₦18k sell price."

Track stock, adjust quantities on sale or purchase, and get snapshot reports — all without a spreadsheet.

### ⏰ Reminders & Scheduled Tasks

> "Remind me to invoice the client at 9am tomorrow."
> "Every Monday morning, summarise tech news for me."

One-off reminders and recurring cron-scheduled tasks — delivered to the same chat, on time.

### 🌐 Web Search

> "What's the current dollar rate in Nigeria?"

Real-time web search with cited sources, right inside the conversation.

### 🧠 Persistent Memory

Ebere remembers your name, your neighborhood, your skills, your transaction history, and your preferences — across sessions, across days, across channels.

### 🔗 Cross-Channel Identity

Started on Telegram? Link your WhatsApp account with a 6-character code. All your data, skills, and history merge into one unified profile.

---

## The Skills System: Teach Ebere Anything

Users can extend Ebere's behaviour by saving **skills** — plain-English instructions that tell the agent how to behave in specific situations.

> "Save a skill called price-checker: When I ask about prices, always compare at least 3 sources and present them in a table with naira equivalents."

Skills are auto-indexed, securely sandboxed, and fetched on-demand. Users can also import skills from any public URL. No code. No configuration.

This means **every user's Ebere is different** — shaped by their needs, their trade, their community.

---

## Categories Ebere Covers

| Category | Example Offers | Example Needs |
|---|---|---|
| **Home Services** | Plumber, electrician, painter, cleaner | "I need someone to fix my AC" |
| **Healthcare** | Doctor, nurse, pharmacist | "Find me a dentist in Yaba" |
| **Housing** | Apartments, land, office space | "Find a flat under ₦500k" |
| **Food** | Catering, groceries, restaurant | "Who sells jollof rice near Lekki?" |
| **Education** | Tutoring, lessons, training | "I need a French tutor for my child" |
| **Tech & Digital** | Web developer, phone repair | "Looking for a Flutter developer" |
| **Fashion** | Tailor, designer, fabric seller | "Custom agbada for a wedding" |
| **Transport** | Logistics, moving, dispatch riders | "I need a van to move furniture" |
| **General Trade** | Any product or service | Whatever the community needs |

---

## Why Ebere Wins

| Traditional Approach | Ebere |
|---|---|
| Download an app, create an account, learn the UI | Just send a WhatsApp or Telegram message |
| Browse listings, apply filters, scroll pages | Describe what you need in plain language |
| Wait and hope someone sees your post | Proactive matching — Ebere notifies both sides |
| Track finances in a separate spreadsheet | Built-in bookkeeping in the same conversation |
| Manage inventory in another tool | Stock tracking without leaving the chat |
| One-size-fits-all features | Teach Ebere new skills in plain English |
| Platform lock-in and fees | Direct contact exchange — no middleman |

---

## How It Works (Technical Summary)

- **Channels:** WhatsApp (Meta Cloud API) + Telegram Bot API
- **Agent Engine:** Google Agent Development Kit (ADK) powered by Gemini
- **Per-User Architecture:** Every message triggers a personalised agent build — unique name, tone, skills, and context
- **Database:** MongoDB for profiles, records, session history, and skill metadata
- **Storage:** Google Cloud Storage for skill files and media
- **Queue:** BullMQ + Redis for scheduled tasks, reminders, and background matching
- **Safety:** Content moderation, sandboxed skills, and prompt-injection protection built in

---

## The Vision

Ebere starts as a personal AI agent. It becomes the **connective tissue of local economies** — a layer where anyone can offer a service, find what they need, track their money, manage their stock, and grow their business, all through the messaging apps they already use every day.

No friction. No gatekeepers. Just people helping people — with an AI that handles the rest.

---

**Ebere handles it.**
