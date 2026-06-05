# Ebere Backend — Implementation Checklist

This file tracks implementation progress feature by feature, broken into verifiable sub-tasks.

**Workflow:**
- Each checkbox is a concrete, testable step
- When you verify a step works, ask the LLM to mark it `[x]`
- When a section is fully done, ask the LLM to move to the next one
- Tests listed under each section are the acceptance criteria before marking the section complete

---

## Phase 1 — Foundation

### 1.1 NestJS Scaffold + Hello World
- [x] NestJS project created with TypeScript strict mode
- [x] `GET /hello` returns `{ message, app, slogan }` with HTTP 200
- [x] **Verify:** `npm run start:dev` starts without errors
- [x] **Verify:** `curl http://localhost:3000/hello` returns `{ "message": "Hello from Ebere!", "app": "Ebere", "slogan": "Ebere handles it." }`

### 1.2 Environment Configuration
- [x] `@nestjs/config` installed
- [x] `ConfigModule.forRoot({ isGlobal: true })` added to `AppModule`
- [x] `.env.example` created with all required variable names and descriptions
- [x] `.env` loaded — `PORT` env var respected in `main.ts`
- [x] **Verify:** set `PORT=4000` in `.env`, restart, app serves on 4000

### 1.3 MongoDB Connection
- [x] `@nestjs/mongoose` and `mongoose` installed
- [x] `MongooseModule.forRootAsync()` wired via `ConfigService` in `AppModule` — reads `MONGODB_URI` from env
- [x] `MONGODB_URI` in `.env` points to a running MongoDB instance (local, Atlas, or any host — Docker setup handled at deployment)
- [x] **Verify:** `npm run start:dev` with a valid `MONGODB_URI` — no connection error in console logs

### 1.4 Scheduling Module
- [x] `@nestjs/schedule` installed
- [x] `ScheduleModule.forRoot()` added to `AppModule`
- [x] **Verify:** app starts without schedule-related errors in logs

### 1.5 Queue Infrastructure (BullMQ + Redis)
- [x] `@nestjs/bullmq` and `bullmq` installed
- [x] `REDIS_HOST` and `REDIS_PORT` added to `.env.example` — points to any running Redis instance (Docker setup handled at deployment)
- [x] `BullModule.forRootAsync()` wired via `ConfigService` in `AppModule` with global job defaults:
  ```ts
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  }
  ```
- [x] `NotificationsQueue` declared: `BullModule.registerQueue({ name: 'notifications' })` — imported in `NotificationsModule`
- [x] `DeliveryWorker` processor created (`src/notifications/delivery.processor.ts`) — handles job types: `send-message`, `batch-broadcast`, and `send-reminder`
  - Each `send-message` job payload: `{ userId, message, channels: ('telegram'|'whatsapp'|'email')[] }`
  - Worker calls `deliverToUser()` for each channel in the payload
- [x] `deliverToUser(userId, message): Promise<void>` — central delivery method in `NotificationsService`
  - Loads user's verified `identities[]`
  - Sends via Telegram if `telegram` identity present
  - Sends via WhatsApp if `whatsapp` identity present
  - Sends via email if `email` identity is present and verified (see Phase 11.2)
- [x] **Verify:** `npm run start:dev` with a valid `REDIS_HOST`/`REDIS_PORT` — BullMQ connects to Redis (log line confirms)
- [x] **Verify:** enqueue a test `send-message` job via a temporary test route → worker processes it and `deliverToUser` is called

---

## Phase 2 — Users Module

### 2.1 User Schema
- [x] `src/users/user.schema.ts` created with Mongoose schema — hybrid design:
  - **Core (system-managed, indexed):** `_id`, `identities[]`, `plan{}`, `createdAt`, `updatedAt`
    - `identities[]` subdocument: `{ provider ('whatsapp'|'telegram'|'email'), externalId, verified, verifiedAt? }`
    - `plan{}` sub-doc: billing tier + quota counters (see Phase 14.1)
  - **LLM-managed profile blob:** `profile: Record<string, unknown>`
    - e.g. `{ name, neighborhood, email, phoneNumber, housingPreferences, businessName, occupation, preferredLanguage, regularMarket }`
    - Sparse index on `profile.neighborhood` — used as fallback in `searchRecords`
    - The LLM populates and updates `profile` over conversations — no schema change needed to store new user attributes
- [x] `UsersModule` created and imported in `AppModule`
- [x] **Verify:** `npm run build` passes — schema TypeScript compiles cleanly

### 2.2 UsersService
- [x] `UsersService.upsertUser(provider, externalId, extraData?)` — finds existing user by identity or creates new one; returns canonical user document
- [x] `UsersService.getUserByIdentity(provider, externalId)` — returns user or `null`
- [x] `UsersService.mergeProfilePatch(userId, patch: Record<string, unknown>)` — deep-merges `patch` into `profile` blob; used by the LLM to store any attribute it learns about the user
- [x] `UsersService.getProfileField(userId, key: string)` — returns a single field from `profile` or `null`
- [x] `UsersService.getMissingCriticalFields(userId)` — checks whether `profile.name` and `profile.neighborhood` exist; returns missing keys for onboarding
- [x] **Verify (unit test):** calling `upsertUser` twice with same identity returns the same user `_id`
- [x] **Verify (unit test):** `mergeProfilePatch({ name: 'Chidi' })` → `profile.name` set; `getMissingCriticalFields` no longer includes `'name'`
- [x] **Verify (unit test):** `mergeProfilePatch({ occupation: 'driver', regularMarket: 'Mile 12' })` → stored in `profile` without any schema change

---

## Phase 3 — Identity Module

### 3.1 IdentityService Core
- [x] `src/identity/identity.module.ts` and `identity.service.ts` created
- [x] `IdentityService.resolveUser(provider, externalId, channelMeta?)` — entry point for all channel controllers; calls `UsersService.upsertUser()`, returns canonical user; checks silently for duplicate identities
- [x] `IdentityService.checkForDuplicateIdentity(provider, externalId)` — returns any existing user with that identity, or `null`
- [x] **Verify (unit test):** `resolveUser` for unknown identity creates a new user; for known identity returns same user

### 3.2 Account Linking
- [x] `src/identity/link-request.schema.ts` — `{ fromUserId, code (6-char), channel, expiresAt (10 min TTL), usedAt?, mergedIntoUserId? }`
- [x] `IdentityService.generateLinkCode(userId, channel)` — creates and stores link request, returns code string
- [x] `IdentityService.verifyLinkCode(incomingUserId, code)` — finds valid (unexpired, unused) request; triggers OTP flow or merge if phone matches
- [x] `IdentityService.mergeAccounts(primaryUserId, secondaryUserId)` — transfers all identities from secondary to primary; sets `mergedInto` on secondary user; re-keys sessions (later: ledger, gigs, properties)
- [x] **Verify (unit test):** expired code returns an error; valid code triggers merge
- [x] **Verify (unit test):** after merge, `getUserByIdentity` for secondary identity returns the primary user

### 3.3 Duplicate Identity Suggestion
- [x] When `resolveUser` detects the same phone/email exists on a different user account, it attaches a `suggestLinking: true` flag to the returned context
- [x] Channel controllers surface this as a Ebere message: *"That number is already on another Ebere account. Want to link them?"*
- [x] **Verify:** create two users with different providers but same phone → `resolveUser` returns `suggestLinking: true`

---

## Phase 4 — Channel Module

### 4.1 Telegram Adapter
- [x] `src/channels/telegram/telegram.controller.ts` — `POST /webhook/telegram`
- [x] Request validation: checks `X-Telegram-Bot-Api-Secret-Token` header matches `TELEGRAM_WEBHOOK_SECRET` env var; rejects with 403 if invalid
- [x] Parses `Update` object — handles these message types:
  - `message.text` → plain text payload
  - `message.photo` (largest size) → image payload
  - `message.voice` / `message.audio` → audio payload
  - ~~`message.document`~~ — **not supported** (dropped silently)
- [x] `TelegramService.downloadFile(fileId): Promise<Buffer>` — calls `getFile` API, then downloads binary from CDN URL
- [x] `TelegramService.sendMessage(chatId: string, text: string): Promise<void>` — POST to Bot API `sendMessage`
- [x] **Verify:** send a mock text Update JSON to `POST /webhook/telegram` (with correct secret header) → controller processes without error
- [x] **Verify:** send mock Update without secret header → 403 response
- [x] **Verify (unit test):** photo Update extracts the largest `photo` array item's `file_id`

### 4.2 WhatsApp Adapter
- [x] `src/channels/whatsapp/whatsapp.controller.ts`
- [x] `GET /webhook/whatsapp` — returns `hub.challenge` when `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN` env var; 403 otherwise
- [x] `POST /webhook/whatsapp` — validates `X-Hub-Signature-256` HMAC-SHA256 signature using `WHATSAPP_APP_SECRET`; rejects with 403 if invalid
- [x] Parses Meta Cloud payload — handles message types: `text`, `image`, `audio`; ~~`document`~~ **not supported** (dropped silently)
- [x] `WhatsAppService.downloadMedia(mediaId: string): Promise<{ buffer: Buffer, mimeType: string }>` — fetches media URL from Graph API `/media/{id}`, then downloads binary
- [x] `WhatsAppService.sendMessage(to: string, text: string): Promise<void>` — POST to Graph API `messages` endpoint
- [x] **Verify:** `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=abc123` → returns `abc123`
- [x] **Verify:** POST with invalid HMAC → 403
- [x] **Verify (unit test):** text message payload correctly extracts `from` phone and `text.body`
- [x] **Verify (unit test):** image message payload correctly extracts `image.id` as mediaId

---

## Phase 5 — Media Module

### 5.1 StorageProvider Interface
- [x] `src/media/storage-provider.interface.ts` — defines `StorageProvider`: `store(buffer, mimeType, userId): Promise<{ storagePath: string }>`; exports `STORAGE_PROVIDER` injection token
- [x] `src/media/local.storage-provider.ts` — writes file to `./uploads/{userId}/{timestamp}-{random}.{ext}`; creates directory if absent
- [x] `MediaModule` created, `LocalStorageProvider` registered as default via `STORAGE_PROVIDER` token

### 5.2 MediaService
- [x] `src/media/media-file.schema.ts` — `{ _id, userId, channel, mimeType, storagePath, linkedCollection?, linkedId?, createdAt }`
- [x] `MediaService.store(buffer, mimeType, userId, channel): Promise<string>` — calls provider, saves metadata doc, returns `mediaFileId`
- [x] `MediaService.linkToRecord(mediaFileId, collection, recordId)` — updates `linkedCollection` and `linkedId` on the media doc
- [x] `MediaService.getStoredFile(mediaFileId)` — returns the full media document
- [x] **Verify (unit test):** store returns mediaFileId; provider and model called with correct args
- [x] **Verify (unit test):** `getStoredFile` returns the doc with correct `storagePath`

---

## Phase 6 — Agent Module

### 6.1 MongoSessionService
- [x] `@google/adk` and `zod` installed
- [x] `src/agent/sessions/mongo-session.service.ts` — implements ADK `BaseSessionService`
  - `createSession(appName, userId, sessionId?, state?)` → creates `sessions` doc
  - `getSession(appName, userId, sessionId)` → returns session or `null`
  - `updateSession(session)` → upsert session state + events array
  - `listSessions(appName, userId)` → returns list of session summaries
  - `deleteSession(appName, userId, sessionId)` → removes doc
- [x] `src/agent/sessions/session.schema.ts` — `{ _id, appName, userId, channel, adkSessionId, events[], state{}, updatedAt }`
- [x] **Verify (unit test):** `createSession` → `getSession` roundtrip returns correct state

### 6.2 Ebere Agent Definition
- [x] `src/agent/ebere.agent.ts` — instantiates `LlmAgent` with:
  - `name: 'ebere'`
  - `model` from `ConfigService` (`GEMINI_MODEL` env var, default `gemini-flash-latest`)
  - Full persona system prompt — includes:
    - Warm, direct tone; location-agnostic; multimodal-aware; "Ebere handles it."
    - **General chat is a first-class capability**: Ebere answers any question (advice, calculations, local knowledge, explanations), not just commerce actions — system prompt explicitly enables this
    - When no tool is relevant, Ebere responds conversationally using Gemini's knowledge and grounding
  - `tools: [googleSearch, ...domainTools]` — `googleSearch` (ADK built-in) registered as an **explicit tool** the agent invokes by choice, not always-on grounding — avoids grounding API cost on every request
  - **Intent and category classification**: system prompt teaches Ebere to map natural language to `intent ('need'|'offer')` + `category` before calling Memory tools. Required examples in prompt: `"I need a doctor"` → `searchRecords({ type:'post', intent:'offer', category:'healthcare' })`; `"I'm a plumber"` → `saveRecord({ type:'post', intent:'offer', category:'home_services', ... })`; `"Find me a flat under ₦500k"` → `searchRecords({ type:'post', intent:'offer', category:'housing', maxAmount:500000 })`. When `searchRecords` returns empty for a need, Ebere calls `saveRecord` with `intent:'need'` as a standing request and tells the user they will be notified when a match appears.
  - **Graceful incomplete-data principle** baked into system prompt: whenever Ebere generates a report or summary from partial data, it must acknowledge what is and isn't tracked. Examples the prompt should include:
    - *"This report covers only what you've logged with me — if you have income or expenses you haven't shared, your actual totals may differ."*
    - *"I'm only tracking inventory items you've added. Let me know if there are others."*
    - *"I don't have your full transaction history, so treat this as an estimate."*
  - This applies to all tools that aggregate or summarise: `getFinancialReport`, `getInventoryReport`, `searchRecords`
- [x] `AgentModule` created, exports `RunnerService`
- [x] **Verify:** `npm run build` — agent module compiles without errors
- [x] **Verify:** send "What's the capital of Nigeria?" → Ebere responds from Gemini knowledge without calling `googleSearch`
- [x] **Verify:** send "What's the current dollar rate in Nigeria?" → agent invokes `googleSearch` → response includes cited source URL
- [x] **Verify:** ask for a financial report with only 2 entries logged → response includes a caveat that the report reflects only logged transactions

### 6.3 RunnerService
- [x] `src/agent/runner.service.ts` — initializes ADK `Runner` with `LlmAgent`, `MongoSessionService`, `InMemoryMemoryService`
- [x] `RunnerService.run(userId, channel, payload: { text?: string, mediaBuffer?: Buffer, mimeType?: string, mediaFileId?: string }): Promise<string>`
  - Derives `sessionId` from `userId + channel`
  - Builds ADK content parts: text part + inline image/audio bytes (if present)
  - Calls `runner.run()`, iterates events, returns the final response text
- [x] **Verify (integration test):** send `{ text: 'Hello' }` with a valid `GEMINI_API_KEY` → receives a non-empty string back from Gemini

### 6.4 Channel → Agent Wiring
- [x] Both channel controllers call `IdentityService.resolveUser()` to get canonical `userId` before calling `RunnerService`
- [x] If `suggestLinking: true`, prepend linking suggestion to the agent response
- [x] Both controllers call `MediaService.store()` when media is present; pass `mediaFileId` to runner
- [x] Both controllers call the appropriate `sendMessage()` with the runner's returned string
- [x] **Verify (end-to-end):** POST a mock Telegram text Update → agent returns a Gemini response → `TelegramService.sendMessage` is called with it
- [x] **Verify (end-to-end):** POST a mock WhatsApp image message → media stored → Gemini processes image bytes → response sent back

---

## Phase 7 — Safety Module ✅ Complete

### 7.1 Guard Registry
- [x] `src/safety/safety.module.ts` and `safety-guard.service.ts` created
- [x] `GuardRegistry` — `register(name, guard)`, `runPreHooks(toolName, args, userId): Promise<string | void>` (returns a warning string if guard intervenes), `runPostHooks(toolName, result, userId)`
- [x] Guard interface: `{ name: string, pre?(toolName, args, userId): Promise<string | void>, post?(toolName, result, userId): Promise<void> }`
- [x] `SafetyModule` exported and imported in `AgentModule`

### 7.2 Initial Guards
- [x] `FinancialPrivacyGuard` — pre-hook on `getFinancialReport` and `saveRecord` (when `type === 'ledger'`): verifies caller owns the records; throws `ForbiddenException` if not
- [x] `RateLimiterGuard` — pre-hook on `saveRecord` (when `type === 'post'`): reads post count from session state; increments; blocks with advisory if over threshold (`RATE_LIMIT_POSTS_PER_HOUR`)
- [x] `ServiceSafetyAdviceGuard` — post-hook on `expressInterest`: checks `metadata.category`; if `'task'` or `'home_services'`, appends safety advice (*"Meet in a public place. Never pay upfront. Share your location with someone you trust."*); no-op for all other categories
- [x] `AbuseContentFilterGuard` — pre-hook on all tools: basic keyword blocklist check; returns a refusal string if triggered
- [x] **Verify (unit test):** `FinancialPrivacyGuard` blocks when `args.userId !== callingUserId`
- [x] **Verify (unit test):** `RateLimiterGuard` allows 10 posts, blocks the 11th (with default limit)
- [x] **Verify (unit test):** `ServiceSafetyAdviceGuard` on `expressInterest` for a `task` post → safety text appended; for a `housing` post → no safety text appended

---

## Phase 8 — Memory Module (Unified Record Store) ✅ Complete

> Replaces Bookkeeping and Posts. Every record Ebere stores — a financial transaction, an inventory item, a community post, or any future type — is a `Memory`. The `type` field is a free-form string; no schema changes are ever needed to store a new kind of record.

### 8.1 Schema & Indexes
- [x] `src/memory/memory.schema.ts` — polymorphic hybrid schema:
  - **Universal core (always present, always indexed):** `_id`, `userId`, `type (string)`, `createdAt`, `updatedAt`
  - **Sparse numeric core (indexed; populated only when relevant):**
    - `amount?: number` — ledger: transaction value; post: asking price
    - `quantity?: number` — inventory: current stock count
    - `date?: Date` — ledger: transaction date
  - **Sparse string core (indexed; high-frequency filter fields):**
    - `status?: string` — post: `'active'|'fulfilled'|'expired'|'removed'`; inventory: `'active'|'depleted'`
    - `intent?: string` — post: `'need'|'offer'`
    - `category?: string` — post + ledger: domain / expense category
    - `neighborhood?: string` — post: location filter
    - `currency?: string` — any string, LLM-set from context, no hardcoded default
  - **Structural reference (not metadata):** `mediaFileIds?: string[]`
  - **LLM-extracted free-form blob (not indexed):** `metadata: Record<string, unknown>`
    - Post: `{ title, description, subcategory, priceType, minPrice, condition, remoteOk, interestedParties[], fulfilledWith, expiresAt, tags, roomType, furnished, bedrooms, yearsExperience }`
    - Ledger: `{ transactionType ('income'|'expense'), vendor, taxDeductible, projectCode, receiptNo, description }`
    - Inventory: `{ name, sku, unitCost, unitPrice, supplier, location, barcode, expiryDate, lowStockThreshold }`
  - Indexes at schema creation:
    - `{ userId: 1, type: 1, createdAt: -1 }` — general per-user queries
    - `{ type: 1, intent: 1, category: 1, neighborhood: 1, status: 1 }` — post search
    - `{ userId: 1, type: 1, date: -1 }` — financial queries
    - `{ userId: 1, type: 1, status: 1 }` — inventory queries
- [x] `MemoryModule` created and imported in `AppModule`
- [x] **Verify:** `npm run build` — schema compiles cleanly; sparse indexes confirmed on startup

### 8.2 MemoryService — Generic CRUD
- [x] `MemoryService.saveRecord(userId, type, data)` — creates Memory document; calls `matchAndNotify()` when `type === 'post'` and `intent` is present
- [x] `MemoryService.searchRecords(userId, type, filters: { intent?, category?, neighborhood?, status?, minAmount?, maxAmount?, query? })` — returns matching records ordered by `createdAt` desc; `query` does full-text match on `metadata` via `$text` index
- [x] `MemoryService.updateRecord(userId, memoryId, changes)` — validates ownership; merges sparse core changes + deep-merges `metadata` patch
- [x] `MemoryService.deleteRecord(userId, memoryId)` — validates ownership; removes document
- [x] `MemoryService.getUserRecords(userId, type?, status?)` — returns caller's records, optionally filtered
- [x] **Verify (unit test):** `saveRecord` with `type: 'ledger'` and `saveRecord` with `type: 'post'` both land in the same `memories` collection
- [x] **Verify (unit test):** `searchRecords(userId, 'post', { intent: 'offer', category: 'healthcare' })` never returns `type: 'ledger'` documents

### 8.3 MemoryService — Financial Aggregation
- [x] `MemoryService.aggregateFinancials(userId, from: Date, to: Date)` — MongoDB `$group` pipeline on `{ userId, type: 'ledger' }` records; groups by `metadata.transactionType`; sums `amount`; returns `{ totalIncome, totalExpenses, net, entryCount, dataNote }`
- [x] `MemoryService.getInventorySnapshot(userId)` — finds all `{ type: 'inventory', status: 'active' }` records; computes total stock value from `quantity × metadata.unitPrice`; flags items where `quantity <= metadata.lowStockThreshold`; returns report with `dataNote: 'Showing X tracked items.'`
- [x] **Verify (unit test):** 3 income + 2 expense ledger records → `aggregateFinancials` returns correct net
- [x] **Verify (unit test):** `getInventorySnapshot` with 2 active + 1 depleted → only 2 items in report

### 8.4 MemoryService — Post Operations
- [x] `MemoryService.expressInterest(fromUserId, memoryId)` — validates caller is not the record owner and has not already expressed interest (`metadata.interestedParties`); appends to `metadata.interestedParties`; enqueues `send-message` job to post owner with caller's contact info
- [x] `MemoryService.matchAndNotify(memory)` — queries opposite-`intent` records in same `category` + `neighborhood` with `status: 'active'`; if matches found enqueues a single `batch-notify` job; when `category === 'housing'`, also notifies users whose `profile.housingPreferences.neighborhood` matches; logs match count
  - `DeliveryWorker` (Phase 1.5) handles `batch-notify`: calls `deliverToUser()` on both sides; per-user errors do not fail the job
  - To the **seeker**: *"Someone nearby is offering [category] in [neighborhood] — reply to connect"*
  - To the **new poster**: *"Someone nearby needs [category] in [neighborhood] — reply to connect"*
- [x] `MemoryService.expireOldPosts()` — updates `status → 'expired'` for `type: 'post'` records where `metadata.expiresAt <= now`; scheduled via `@Cron`
- [x] **Verify (unit test):** `expressInterest` by record owner → error thrown
- [x] **Verify (unit test):** `expressInterest` twice by same user on same record → second call throws
- [x] **Verify (unit test):** `saveRecord` for a post when matching opposite-intent post exists in same category + neighborhood → `matchAndNotify` enqueues exactly 1 `batch-notify` job

### 8.5 MemoryService — Inventory Operations
- [x] `MemoryService.adjustStock(userId, memoryId, delta: number, reason: 'sale'|'purchase'|'adjustment')` — atomic `$inc` on `quantity`; throws if result would go below 0; for `'sale'`: also calls `saveRecord({ type: 'ledger', amount, metadata: { transactionType: 'income' } })`; for `'purchase'`: saves an expense ledger record
- [x] **Verify (unit test):** `adjustStock` with delta making `quantity` negative → error thrown
- [x] **Verify (unit test):** `adjustStock(-3, 'sale')` → `quantity` decrements by 3 AND an income ledger Memory document is created

### 8.6 Receipt Image Flow
- [x] Channel sends image buffer → `MediaService.store()` → `mediaFileId` passed into `RunnerService.run()`
- [x] Gemini extracts amount, transactionType, vendor from receipt image bytes
- [x] `saveRecord` called with `type: 'ledger'`, extracted core fields, and `mediaFileIds: [mediaFileId]`
- [x] **Verify:** send mock image buffer with text "this is a receipt" → Memory document created with non-null `mediaFileIds`

### 8.7 FunctionTools
- [x] `saveRecord` FunctionTool — Zod schema: `{ type, amount?, quantity?, date?, status?, intent?, category?, neighborhood?, currency?, mediaFileId?, metadata?: Record<string, unknown> }` — LLM chooses `type` from context; system prompt examples:
  - *"I made ₦50k from a client"* → `saveRecord({ type:'ledger', amount:50000, currency:'NGN', metadata:{ transactionType:'income', vendor:'client' } })`
  - *"I have 100 bags of rice at ₦15k cost, ₦18k sell"* → `saveRecord({ type:'inventory', quantity:100, metadata:{ name:'rice bags', unitCost:15000, unitPrice:18000 } })`
  - *"I'm a plumber in Surulere"* → `saveRecord({ type:'post', intent:'offer', category:'home_services', neighborhood:'Surulere', metadata:{ subcategory:'plumber', title:'...', availability:'weekdays' } })`
  - `AbuseContentFilterGuard` pre-hook on all `saveRecord` calls; `RateLimiterGuard` pre-hook when `type === 'post'`
- [x] `searchRecords` FunctionTool — Zod schema: `{ type, intent?, category?, neighborhood?, minAmount?, maxAmount?, status?, query? }` — `neighborhood` falls back to `user.profile.neighborhood`
- [x] `updateRecord` FunctionTool — Zod schema: `{ memoryId, changes: { status?, amount?, quantity?, currency?, metadata?: Record<string, unknown> } }` — validates ownership; deep-merges `metadata` patch
- [x] `deleteRecord` FunctionTool — Zod schema: `{ memoryId }` — validates ownership
- [x] `getUserRecords` FunctionTool — Zod schema: `{ type?, status? }` — returns caller's own records
- [x] `getFinancialReport` FunctionTool — Zod schema: `{ period ('today'|'week'|'month') }` → resolves date range → calls `aggregateFinancials()`; returns totals + `dataNote`; `FinancialPrivacyGuard` pre-hook
- [x] `getInventoryReport` FunctionTool — no params → calls `getInventorySnapshot()`; agent appends `dataNote` caveat in response
- [x] `expressInterest` FunctionTool — Zod schema: `{ memoryId }` — `ServiceSafetyAdviceGuard` post-hook
- [x] `adjustStock` FunctionTool — Zod schema: `{ memoryId, delta, reason: 'sale'|'purchase'|'adjustment' }` — calls `MemoryService.adjustStock()`
- [x] All nine tools registered on Ebere agent
- [x] **Verify:** *"I made ₦50,000 today"* → `saveRecord({ type:'ledger', ... })` → Memory document created in DB
- [x] **Verify:** *"I need a doctor in Ikeja"* → `searchRecords({ type:'post', intent:'offer', category:'healthcare', neighborhood:'Ikeja' })` → if empty → `saveRecord({ type:'post', intent:'need', ... })` → *"No doctors found yet — I've noted your request."*
- [x] **Verify:** *"I have a flat in Ikeja for ₦900k/year"* → `saveRecord({ type:'post', intent:'offer', category:'housing', amount:900000, neighborhood:'Ikeja', ... })` invoked
- [x] **Verify:** *"I sold 10 bags of rice"* → `adjustStock` invoked → `quantity` decremented + income ledger record created
- [x] **Verify:** *"Send my weekly report"* → `getFinancialReport` invoked → totals + caveat about logged-only data
- [x] **Verify:** *"Show my inventory"* with 2 items → lists those 2 items + notes only tracked items shown

---

## Phase 9 — Schedules Module (Recurring Background Tasks)

> Turns Ebere from a purely reactive agent into one that does work on behalf of users without them being present.

### 9.1 Schema & Service
- [x] `src/schedules/schedule.schema.ts` — hybrid schema:
  - **Core:** `userId`, `name`, `cronExpression`, `task: ScheduleTask`, `isActive`, `lastRunAt?`, `nextRunAt`, `createdAt`
  - `ScheduleTask` discriminated union: `web_search | area_digest | financial_report | agent_query`
  - Index: `{ userId: 1, isActive: 1, nextRunAt: 1 }`
- [x] `SchedulesService.createSchedule(userId, data)` — saves doc; computes initial `nextRunAt` from `cronExpression`
- [x] `SchedulesService.listSchedules(userId)` — returns user's schedules with `nextRunAt`
- [x] `SchedulesService.pauseSchedule(userId, scheduleId)` — validates ownership; sets `isActive: false`
- [x] `SchedulesService.deleteSchedule(userId, scheduleId)` — validates ownership; removes doc
- [x] `SchedulesService.runDueSchedules()` — finds `isActive: true` && `nextRunAt <= now`; executes task; delivers result via `deliverToUser()`; advances `nextRunAt`; logs execution
- [x] `@Cron('*/5 * * * *')` calls `runDueSchedules()`
- [x] `SchedulesModule` created and imported in `AppModule`
- [x] **Verify (unit test):** `createSchedule` with `"every Monday 9am"` → `cronExpression` stored + correct `nextRunAt` computed
- [x] **Verify (unit test):** `pauseSchedule` → `isActive: false`; `runDueSchedules` skips it

### 9.2 FunctionTools
- [x] `createSchedule` FunctionTool — Zod schema: `{ name, schedule (natural language), task: ScheduleTask }` — LLM converts `"every Monday 9am"` → `cronExpression`; system prompt must include cron conversion examples
- [x] `listSchedules` FunctionTool — returns caller's schedules with `nextRunAt` formatted as human-readable date
- [x] `pauseSchedule` FunctionTool — Zod schema: `{ scheduleId }` — sets `isActive: false`
- [x] `deleteSchedule` FunctionTool — Zod schema: `{ scheduleId }` — validates ownership; removes
- [x] All four tools registered on Ebere agent
- [ ] **Verify:** *"Every Monday morning, find remote Flutter jobs and message me"* → `createSchedule` invoked → Monday 9am → `web_search` task executes → result delivered via `deliverToUser`
- [ ] **Verify:** *"Stop the Flutter alerts"* → `pauseSchedule` → `isActive: false` in DB
- [ ] **Verify:** *"What recurring tasks do I have?"* → `listSchedules` → human-readable schedule list returned

---

## Phase 10 — Notifications & Reminders

### 10.1 Mailer Setup
- [x] `@nestjs-modules/mailer` and `nodemailer` installed
- [x] `MailerModule.forRootAsync()` configured via `ConfigService` — SMTP transport using env vars
- [x] `.env.example` updated with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- [x] `NotificationsService.sendEmail(to: string, subject: string, text: string)` — thin wrapper around `MailerService.sendMail()`
- [x] `DeliveryWorker` (from Phase 1.5) wired to call `sendEmail()` when job has an `email` channel entry
- [ ] **Verify:** set valid SMTP credentials in `.env`, trigger a test email job → email arrives in inbox

### 10.2 Reminders
- [x] `src/notifications/reminder.schema.ts` — `{ userId, message, triggerAt, delivered, deliveredAt?, jobId? }`
  - `jobId` stores the BullMQ job ID so the job can be removed if the reminder is cancelled
- [x] `NotificationsService.createReminder(userId, message, triggerAt)` — saves reminder doc, then enqueues a delayed `send-reminder` job with `delay = triggerAt - now` ms; stores `jobId` on the doc
- [x] `DeliveryWorker` handles `send-reminder` job type: calls `deliverToUser()` (which fans out to all verified channels — Telegram, WhatsApp, and email if set), then marks the reminder doc `delivered: true, deliveredAt: now`
- [x] No cron polling needed — BullMQ fires the job exactly at `triggerAt`
- [x] `setReminder` FunctionTool — Zod schema: `{ userId, message, triggerAt (ISO string) }` → `createReminder()`
- [x] Tool registered on Ebere agent
- [ ] **Verify:** create reminder with `triggerAt` 60s in future → inspect Redis queue, job shows delayed status → after 60s, job fires → reminder `delivered: true` in DB and message received on all channels user has set
- [ ] **Verify:** user with email set receives the reminder on Telegram, WhatsApp, AND email simultaneously

### 10.3 User Profile Tools
- [x] `getUserProfile` FunctionTool — returns user's `profile` blob (all LLM-managed attributes) + `identities[]` summary + result of `getMissingCriticalFields()`
- [x] `updateUserProfile` FunctionTool — Zod schema: `{ patch: Record<string, unknown> }` → `UsersService.mergeProfilePatch()`; LLM calls this whenever it learns something new about the user (name, neighborhood, occupation, preferences, etc.); returns updated profile
- [x] Both tools registered on Ebere agent
- [x] **Verify (unit test):** new user → `getUserProfile` returns empty `profile` + `missingCriticalFields: ['name', 'neighborhood']`
- [x] **Verify (unit test):** `updateUserProfile({ patch: { name: 'Chidi' } })` → `profile.name` set; critical fields updated
- [x] **Verify (unit test):** `updateUserProfile({ patch: { regularMarket: 'Mile 12', occupation: 'trader' } })` → stored in `profile` without any schema change

---

## Phase 11 — Onboarding Flow

- [x] System prompt instructs Ebere to call `getUserProfile` at the start of each session to check `getMissingCriticalFields()`
- [x] If fields missing: Ebere asks for them naturally before proceeding with any action
- [x] ADK session state tracks `fieldsAskedThisSession: string[]` — Ebere does not re-ask fields already requested in the current conversation
- [x] After profile is complete, Ebere transitions to main menu naturally (no prompts for fields already collected)
- [x] System prompt teaches timing distinction: *"every X"* or *"regularly"* phrasing → call `createSchedule`; one-off future events → call `setReminder`; examples: *"every Monday morning find remote Flutter jobs"* → `createSchedule`, *"remind me at 3pm today"* → `setReminder`
- [ ] **Verify:** first-ever message "Hello" → Ebere greets and asks for name + neighborhood (not both at once — one at a time)
- [ ] **Verify:** returning user "Hello" → Ebere does not ask for name or neighborhood again
- [ ] **Verify:** user mid-conversation provides neighborhood → subsequent `searchRecords` uses it without asking again

---

## Phase 12 — Account Linking Tools

- [x] `linkAccount` FunctionTool — calls `IdentityService.generateLinkCode()`; returns the code + instructions
- [x] `verifyLinkCode` FunctionTool — Zod schema: `{ code }` → calls `IdentityService.verifyLinkCode()` → triggers merge
- [x] `addIdentity` FunctionTool — Zod schema: `{ provider, value }` → adds email/phone identity after OTP confirmation (OTP delivery TBD)
- [x] All three tools registered on Ebere agent
- [ ] **Verify:** user A generates code on Telegram → user B enters code on WhatsApp → accounts merged → ledger entries from both visible under merged user

---

## Phase 13 — Web Search & Grounding

### 13.1 Gemini Native Grounding
- [x] `GoogleSearch` ADK tool already included in the agent from Phase 6.2 — confirm it is active and passing through source citations
- [x] Channel controllers pass full response text (including any URLs Gemini includes from grounding) to the user without stripping
- [ ] **Verify:** ask "What is the current price of a bag of cement in Nigeria?" → response includes a source URL from a live web page
- [ ] **Verify:** grounding does not fire for tool-handled queries (e.g., "show my expenses") — `getFinancialReport` tool is called instead

### 13.2 `webSearch` FunctionTool
- [x] `src/agent/tools/web-search.tool.ts` — `webSearch` FunctionTool
  - Zod schema: `{ query: string, siteRestrict?: string }` — optional `siteRestrict` scopes to a domain (e.g., `nairaland.com`)
  - Calls configured search API; provider from `SEARCH_PROVIDER` env var (`brave`|`serper`|`google-cse`); key from `SEARCH_API_KEY`
  - Returns top 5 results as `{ title, url, snippet }[]`
  - Formats output as a numbered list with full URLs on their own line so Telegram/WhatsApp auto-preview them
- [x] `SEARCH_API_KEY` and `SEARCH_PROVIDER` added to `.env.example`
- [x] `webSearch` tool registered on Ebere agent
- [ ] **Verify:** agent "Find me vendors selling solar panels in Lagos" → `webSearch` invoked → numbered list with clickable URLs returned in chat
- [x] **Verify (unit test):** result formatter converts `{ title, url, snippet }[]` to correct numbered plain-text list

---

## Phase 14 — Billing Module

> ⚠️ **Implement last — only after user testing on the live product confirms value and retention.**

### 14.1 Billing Layer (dummy mode enabled by default for user testing)
- [ ] `BILLING_ENABLED` env var added to `.env.example` — default `false`; set `true` only when ready to enforce quotas after user testing
- [ ] `plan` sub-document added to user schema: `{ tier: 'free'|'pro', messageCount: number, periodStart: Date, periodResetAt: Date, isBlocked: boolean, pendingUpgrade: boolean }`
  - Index: `{ 'plan.periodResetAt': 1 }` for the daily reset cron
- [ ] `FREE_MESSAGE_LIMIT`, `PRO_PRICE_MONTHLY`, `PRO_CURRENCY` added to `.env.example`
- [ ] `src/billing/billing.module.ts` and `billing.service.ts` created; `BillingModule` imported in `AppModule`
- [ ] `BillingService.checkAndIncrementQuota(userId): Promise<{ allowed: boolean, remaining: number, resetAt: Date }>`
  - When `BILLING_ENABLED=false`: immediately returns `{ allowed: true, remaining: 999, resetAt: ... }` — zero DB calls, zero overhead during testing
  - When `BILLING_ENABLED=true`: atomic `findOneAndUpdate` with `$inc`; checks against `FREE_MESSAGE_LIMIT`; `pro` tier always passes; sets `isBlocked: true` at limit
- [ ] `BillingService.resetPeriod(userId)` — zeroes `messageCount`, sets `periodResetAt = now + 30d`, clears `isBlocked`
- [ ] `@Cron('0 2 * * *')` daily job — only runs when `BILLING_ENABLED=true`; queries `periodResetAt <= now`; calls `resetPeriod()` for each matched user
- [ ] **Verify (unit test):** `BILLING_ENABLED=false` → `checkAndIncrementQuota` returns `allowed: true` with zero DB calls
- [ ] **Verify (unit test):** `BILLING_ENABLED=true` → 50 calls pass, 51st returns `allowed: false`
- [ ] **Verify (unit test):** pro-tier user with `BILLING_ENABLED=true` → always `allowed: true`

### 14.2 Quota Enforcement in Channel Controllers
- [ ] Both Telegram and WhatsApp controllers call `BillingService.checkAndIncrementQuota(userId)` after `IdentityService.resolveUser()`, before `RunnerService.run()`
- [ ] If `allowed: false`: controller calls `sendMessage()` with a friendly quota message and returns without calling `RunnerService`
- [ ] Quota message template: *"You've used all N free messages this month. Your quota resets on [date]. Reply UPGRADE for unlimited access."*
- [ ] **Verify:** set a user's `messageCount` to the limit → send a message → quota message sent; `RunnerService.run` not called
- [ ] **Verify:** pro-tier user at same count → message processes normally

### 14.3 Upgrade Flow (stub)
- [ ] Channel controllers intercept literal text `UPGRADE` (case-insensitive) before quota check — bypasses quota so blocked users can still reach this
- [ ] `BillingService.getUpgradeInfo()` — returns `{ price: PRO_PRICE_MONTHLY, currency: PRO_CURRENCY, instructions: 'Payment processing coming soon.' }`
- [ ] On `CONFIRM` reply: `BillingService.initiateUpgrade(userId)` — sets `plan.pendingUpgrade: true`; sends acknowledgement message
- [ ] **Verify:** blocked user sends "upgrade" → receives pricing info message (quota guard not triggered)
- [ ] **Verify:** user sends "confirm" → `plan.pendingUpgrade: true` in DB + acknowledgement sent

---

## Completed Phases Summary

| Phase | Status | Notes |
|---|---|---|
| 1.1 NestJS Scaffold + Hello World | 🟡 In progress | Server created; GET /hello in place |
| 1.2 Environment Config | ⬜ Pending | |
| 1.3 MongoDB Connection | ⬜ Pending | No Docker \u2014 configure MONGODB_URI to any running instance |
| 1.4 Scheduling | ⬜ Pending | |
| 1.5 Queue Infrastructure (BullMQ + Redis) | ⬜ Pending | No Docker \u2014 configure REDIS_HOST/PORT; job defaults set globally |
| 2 Users Module | ⬜ Pending | |
| 3 Identity Module | ⬜ Pending | |
| 4 Channel Module | ⬜ Pending | |
| 5 Media Module | ⬜ Pending | |
| 6 Agent Module | ⬜ Pending | Explicit `googleSearch` tool (not always-on); graceful partial-data prompting |
| 7 Safety Module | ⬜ Pending | |
| 8 Bookkeeping + Inventory | ⬜ Pending | Incl. graceful partial-data reporting |
| 9 Posts (unified) | ⬜ Pending | Replaces Gigs + Housing + Marketplace; 5 tools; open-ended categories, no code changes for new domains |
| 10 Schedules Module | ⬜ Pending | Recurring background tasks; 4 tools; `*/5 * * * *` cron worker; hybrid schema |
| 11.1 Mailer Setup | ⬜ Pending | SMTP via `@nestjs-modules/mailer` |
| 11.2 Reminders | ⬜ Pending | Delayed BullMQ jobs; multi-channel incl. email |
| 11.3 User Profile Tools | ⬜ Pending | |
| 12 Onboarding Flow | ⬜ Pending | |
| 13 Account Linking Tools | ⬜ Pending | |
| 14 Web Search & Grounding | ⬜ Pending | Gemini grounding + `webSearch` FunctionTool with linked results |
| 15.1 Billing Layer | ⬜ Pending | Dummy mode (`BILLING_ENABLED=false`) until after user testing |
| 15.2 Quota Enforcement | ⬜ Pending | Channel controllers block at limit |
| 15.3 Upgrade Flow | ⬜ Pending | UPGRADE/CONFIRM keyword stub — implement last |

---

## Appendix — Performance & Cost Rules

Cross-cutting constraints that apply during implementation of each phase. Treat these as hard rules.

### Database Indexes
Declare these in each schema file at creation time — do not add them as an afterthought:

| Schema | Index |
|---|---|
| `users` | `{ 'identities.provider': 1, 'identities.externalId': 1 }` unique |
| `users` | `{ neighborhood: 1 }` |
| `users` | `{ 'plan.periodResetAt': 1 }` |
| `posts` | `{ intent: 1, category: 1, neighborhood: 1, status: 1, createdAt: -1 }` |
| `posts` | `{ userId: 1, status: 1 }` |
| `posts` | `{ status: 1, expiresAt: 1 }` |
| `ledgerEntries` | `{ userId: 1, date: -1 }` |
| `inventoryItems` | `{ userId: 1, name: 1 }` unique |
| `schedules` | `{ userId: 1, isActive: 1, nextRunAt: 1 }` |
| `sessions` | `{ userId: 1, channel: 1 }` unique |

### Session Event Pruning
- `MongoSessionService.updateSession()` must use `$push` with `$slice: -100` — **never** replace the full events array
- Media bytes (image/audio buffers) are **never** stored in session state; only `mediaFileId` string references are stored
- Sessions with no activity for 30 days are flagged `archived: true` and excluded from normal queries

### Keyword Interception Before Gemini
Channel controllers handle these **before** calling `BillingService` or `RunnerService` — zero Gemini cost:
- `UPGRADE` / `UPGRADE NOW` → billing upgrade info
- `CONFIRM` → billing confirm handler
- `HELP` / `MENU` → static help text
- `CANCEL` → cancel pending upgrade

### BullMQ Job Lifecycle
All queue registrations must include:
```typescript
defaultJobOptions: {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
}
```

### Broadcast Cost Awareness
- WhatsApp charges per conversation opened — broadcasting to N users = N new conversation windows; `DeliveryWorker` must log the recipient count before starting delivery
- Telegram has a 30 messages/second global rate limit per bot — batch jobs must add a small delay between sends

### Gemini API Cost Controls
- `googleSearch` is a **tool** the agent explicitly invokes — not always-on grounding — avoids grounding surcharge on every request
- System prompt must stay under 800 tokens; verbose prompts increase input token cost on every request
- `RunnerService` logs input + output token counts from ADK response metadata on every call so costs are observable from day one
- Keyword commands (`UPGRADE`, `HELP`, etc.) are intercepted before `RunnerService` — these never consume Gemini tokens

