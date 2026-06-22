# Spur AI Support — Architecture Deep-Dive

---

**Contents**

- [1. Overall Project Structure](#1-overall-project-structure)
- [2. Backend Architecture](#2-backend-architecture)
  - [2.1 Entry Point](#21-entry-point)
  - [2.2 Express App](#22-express-app)
  - [2.3 Channel Architecture](#23-channel-architecture)
  - [2.4 Service Layer](#24-service-layer)
  - [2.5 Repository Layer](#25-repository-layer)
  - [2.6 Validation](#26-validation)
  - [2.7 Error Handling](#27-error-handling)
  - [2.8 Data Model](#28-data-model)
  - [2.9 Seed Data](#29-seed-data)
- [3. Frontend Architecture](#3-frontend-architecture)
  - [3.1 Framework](#31-framework)
  - [3.2 State Design](#32-state-design)
  - [3.3 Component Tree](#33-component-tree)
  - [3.4 Component Details](#34-component-details)
  - [3.5 Optimistic UI Flow](#35-optimistic-ui-flow)
  - [3.6 URL Sync](#36-url-sync)
  - [3.7 Mobile Responsiveness](#37-mobile-responsiveness)
  - [3.8 Scroll Behavior](#38-scroll-behavior)
  - [3.9 API Client](#39-api-client)
  - [3.10 Types](#310-types)
- [4. End-to-End Data Flow](#4-end-to-end-data-flow)
- [5. Key Design Decisions](#5-key-design-decisions)
- [6. Trade-offs & If I Had More Time](#6-trade-offs--if-i-had-more-time)

---

## 1. Overall Project Structure

```
project-root/
├── client/                     # SvelteKit frontend (port 5173)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api/            # HTTP client + typed endpoint modules
│   │   │   ├── components/     # Svelte 5 UI components
│   │   │   └── types/          # TypeScript interfaces
│   │   └── routes/             # +page.svelte (entire app)
│   ├── .env                    # PUBLIC_API_URL=http://localhost:3001
│   └── package.json
├── server/                     # Express backend (port 3001)
│   ├── prisma/
│   │   ├── schema.prisma       # 3 tables
│   │   ├── seed.ts             # 9 store policies
│   │   └── dev.db              # SQLite (gitignored)
│   ├── src/
│   │   ├── channels/           # Channel adapters (web, future: whatsapp, etc.)
│   │   │   ├── README.md
│   │   │   └── web/web.channel.ts
│   │   ├── config/             # env.ts, database.ts
│   │   ├── middleware/         # errorHandler.ts
│   │   ├── repositories/      # policy.repository.ts
│   │   ├── services/           # chat.service, llm.service, prompt.service
│   │   └── validators/         # chat.validator.ts (Zod)
│   ├── .env
│   └── package.json
├── .gitignore
├── README.md
└── ARCHITECTURE.md
```

Frontend and backend are fully independent — separate `package.json`, separate configs, no monorepo workspace, no shared dependencies. This matches how Spur would deploy them: frontend on Vercel/Netlify, backend on Render/Fly.io.

---

## 2. Backend Architecture

### 2.1 Entry Point

`server/src/index.ts` — Minimal bootstrap: loads `.env`, connects Prisma to SQLite, starts Express on the configured port.

### 2.2 Express App

`server/src/app.ts` — Middleware stack:

| Middleware | Purpose |
|---|---|
| `cors({ origin, exposedHeaders: ['Retry-After'] })` | Restricts origin; exposes rate-limit header |
| `express.json({ limit: '100kb' })` | Parses JSON bodies |
| Routes (`/chat/*`) | API endpoints via `web.channel.ts` |
| `errorHandler` | Centralized catch-all |

Plus a `/health` endpoint for uptime checks.

### 2.3 Channel Architecture

Instead of a flat `routes/` directory, the backend uses a **channel architecture**. Each channel is a self-contained Express router representing a platform:

```
channels/
├── README.md
└── web/
    └── web.channel.ts   # Web chat endpoints + rate limiting
```

Adding WhatsApp or Instagram means creating `channels/whatsapp/whatsapp.channel.ts` with its own rate limiting, validation, and response formatting — no existing code changes.

#### `web.channel.ts` — Endpoints

Three endpoints without `/api` prefix:

```
GET    /chat/conversations                   → list (max 50)
GET    /chat/conversations/:id/messages      → conversation + messages (max 100)
POST   /chat/message                         → send message, get AI reply (rate-limited: 1/10s)
```

`POST /chat/message` has `express-rate-limit` (1 request per 10 seconds per IP) with `legacyHeaders: true` so browsers receive the `Retry-After` header for client-side countdown. Each route validates input (Zod on POST), calls a service function, returns JSON, and forwards errors via `next(error)`.

### 2.4 Service Layer

#### `chat.service.ts` — Core chat logic

##### `handleMessage(message, sessionId?)`

1. **Find or create conversation** — Look up by `sessionId` (404 if not found) or create a new one (title: `"New conversation"`)
2. **Save user message** — Insert with `role: 'user'`
3. **Generate title** — If new, call `generateTitle(message)` for an AI summary (2–5 words), update the conversation
4. **Fetch history** — All messages, ordered by timestamp
5. **Generate AI reply** — Call `generateReply(history, message)`
6. **Save AI reply** — Insert with `role: 'agent'`

Key design: The LLM call **never throws** — all errors are caught internally and a user-friendly string is returned. This guarantees data consistency without Prisma transactions.

##### `getConversations()`

Returns the 50 most recent conversations ordered by `createdAt` descending.

##### `getConversationMessages(conversationId)`

Returns the conversation + its 100 most recent messages (404 if not found).

---

#### `llm.service.ts` — OpenAI integration

##### Client initialization

Singleton pattern — `OpenAI` client created lazily on first use (`getClient()`).

##### `generateReply(history, userMessage)`

1. Checks for `OPENAI_API_KEY` — returns friendly error if missing
2. Loads system prompt (from `prompt.service.ts`) and trims history to last 20 messages in parallel
3. Maps internal roles (`user` / `agent`) to OpenAI roles (`user` / `assistant`)
4. Calls `gpt-4o-mini` with `max_tokens=500`, `temperature=0.7`, 15s timeout
5. Returns response content (or fallback if empty)

Error handling ladder — every path returns a string, never throws:

| Error | User-friendly reply |
|---|---|
| No API key | "support assistant is currently unavailable" |
| OpenAI 429 | "high demand. Please try again" |
| `insufficient_quota` | "temporarily unavailable" |
| Timeout | "took too long to process" |
| Other OpenAI error | "something went wrong" |
| Unexpected error | "something went wrong" |

##### `generateTitle(userMessage)`

Separate lightweight call on the same model but with `max_tokens=20`, `temperature=0.3`. System prompt asks for a 2–5 word title summarizing the user's intent. Falls back to `"New conversation"` on any error. Only called on the first message of a new conversation.

---

#### `prompt.service.ts` — System prompt builder

Fetches all policies from `PolicyRepository` and assembles the system prompt:

```
Role: You are a friendly customer support agent for Spur Shop (Indian e-commerce).
Rules: Keep responses under 150 words. Never invent policies.
       Politely refuse off-topic questions (programming, finance, health, etc.).
Policies: Store Overview, Shipping Policy, Returns & Refunds, Payment Methods,
          Order Management, Account Management, Customer Support,
          Product Information, Privacy & Security
```

The strict scope limitation is enforced via prompt instructions, not code-level filtering.

### 2.5 Repository Layer

#### `policy.repository.ts` — Cached policy fetcher

- `getAllPolicies()` — Returns all `StorePolicy` records from DB
- Cache duration: **5 minutes** in-memory TTL
- On miss: queries DB, populates cache, returns
- On hit: returns cached data, no DB query

This avoids redundant reads on every message while keeping policies editable (changes take effect within 5 minutes). An admin panel could add `refreshPolicies()` for instant invalidation.

### 2.6 Validation

`server/src/validators/chat.validator.ts` — Zod schema:

```ts
{ message: string.min(1).max(10000), sessionId: string.uuid().optional() }
```

- Empty messages → 400
- Over 10,000 characters → 400
- `sessionId` must be valid UUID (or absent)
- TypeScript type `ChatMessageInput` inferred from schema

### 2.7 Error Handling

`server/src/middleware/errorHandler.ts` — Custom `AppError` class with `statusCode`. Handler logic:

1. **`AppError`** → `res.status(err.statusCode).json({ reply: null, sessionId: null, error: err.message })`
2. **`ZodError`** → 400 with validation details
3. **Unknown errors** → logged to console, 500 response

The consistent `{ reply: null, sessionId: null, error }` format ensures the frontend always gets predictable JSON.

### 2.8 Data Model

`server/prisma/schema.prisma` — Three tables:

```
Conversation
  id        String  @id @default(uuid())
  title     String  @default("New conversation")
  createdAt DateTime @default(now())
  messages  Message[]

Message
  id             String   @id @default(uuid())
  conversationId String   FK → Conversation (cascade delete)
  role           String   "user" | "agent"
  content        String
  timestamp      DateTime @default(now())
  INDEX on conversationId

StorePolicy
  id        String   @id @default(uuid())
  topic     String   @unique  (e.g. "shipping")
  title     String   (e.g. "Shipping Policy")
  content   String   (full policy text)
  createdAt DateTime
  updatedAt DateTime @updatedAt
```

Field names (`role`/`content`, `agent` instead of `ai`) mirror OpenAI's `ChatCompletionMessageParam` format — trivial mapping in `llm.service.ts`.

### 2.9 Seed Data

`server/prisma/seed.ts` — 9 policies covering common e-commerce scenarios, India-specific:
- INR prices, UPI/COD/Net Banking/EMI payments
- Delhivery, Blue Dart, XpressBees, India Post couriers
- IST support hours, Indian holidays (Diwali, Holi, Eid, Republic Day, etc.)
- Pincode-based shipping

Re-runnable (`deleteMany()` then insert) — no duplicates.

---

## 3. Frontend Architecture

### 3.1 Framework

SvelteKit with Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`). No stores — all state is component-local. The app is a single page (`+page.svelte`).

### 3.2 State Design

All state lives in `+page.svelte`:

| Variable | Type | Purpose |
|---|---|---|
| `conversations` | `Conversation[]` | Sidebar list |
| `messagesByConversation` | `Record<string, Message[]>` | Messages keyed by conversation ID |
| `activeConversationId` | `string \| null` | Currently selected conversation |
| `sidebarOpen` | `boolean` | Mobile sidebar toggle |
| `isTyping` | `boolean` | True while waiting for AI reply (disables composer) |
| `showWelcome` | `boolean` | Shows WelcomeScreen when no conversation active |
| `isLoadingMessages` | `boolean` | Loading spinner |
| `failedMessage` | `{ text, messageId, body, retryAfter } \| null` | Failed message state for error recovery |
| `retryCountdown` | `number` | Seconds remaining before retry allowed (rate-limit) |
| `isNearBottom` | `boolean` | Whether user is near bottom of message list |
| `messageContainer` | `HTMLDivElement` | Reference to scrollable message div |

Derived: `activeConversation`, `activeMessages`.

### 3.3 Component Tree

```
+page.svelte
├── Sidebar (desktop: visible, mobile: hidden)
├── Sidebar (mobile overlay with backdrop, conditional)
├── Header
│   ├── Brand + online indicator
│   ├── Hamburger (mobile)
│   ├── Active conversation title
│   └── "+" new chat (mobile, only when in conversation)
├── Message area
│   ├── Loading spinner
│   ├── WelcomeScreen (no active conversation)
│   ├── Message list
│   │   ├── ChatMessage × N
│   │   └── Typing indicator (3 dots + avatar, hidden during errors)
│   ├── Error banner (amber countdown or red retry + button)
│   └── "Scroll to end" button (when scrolled up)
└── MessageComposer ({#key activeConversationId} — clears on switch)
```

### 3.4 Component Details

#### `Sidebar.svelte`

Props: `conversations`, `activeId`, `onNewChat`, `onSelect`, `class`
- Brand header, "New Chat" button, scrollable conversation list
- Active state highlighted (`bg-primary-50`), thin dividers, no timestamps
- Truncated titles with `title={conv.title}` for hover tooltip
- `class` prop enables `hidden lg:flex` for desktop vs nothing for overlay
- `h-full` on `<aside>` fixes overlay height bug

#### `WelcomeScreen.svelte`

Props: `onSuggestedQuestion`
- Centered layout, "How can we help you?" heading
- 4 suggestion chips: Shipping Policy, Return Policy, Refund Process, Support Hours
- Chip label sent directly as message

#### `ChatMessage.svelte`

Props: `message`
- Layout: name → bubble → timestamp + copy icon (same line, `gap-3`)
- User: right-aligned, blue, no avatar, `rounded-br-md`
- Agent: left-aligned, white card + border, "S" avatar, `rounded-bl-md`
- Timestamps: same-day shows time only; older shows date + time (`en-IN` locale)
- Copy icon always visible, turns green briefly on copy
- Agent messages rendered via `marked`; user messages are plain text

#### `MessageComposer.svelte`

Props: `onSend`, `disabled`
- Auto-growing textarea, Enter to send (Shift+Enter for newline)
- Character counter appears on first keystroke — gray normally, red only at 10,000 limit
- Red border + background when over limit
- Wrapped in `{#key activeConversationId}` — destroys/remounts on conversation switch, clearing draft

### 3.5 Optimistic UI Flow

1. Show user message instantly (optimistic update)
2. New conversations get temp ID (`new-<timestamp>`) with title `"New conversation"`
3. Call API
4. **On success**: Replace temp ID with real `sessionId`, reload conversations (title now populated), append AI reply, update URL
5. **On failure (429)**: Show amber countdown banner (minimum 30s), then switch to red error with "Retry Message" button. Typing indicator hidden during error.
6. **On failure (non-429)**: Show red error with Retry immediately
7. **On retry**: Remove failed message from local list (prevents visible duplicate), re-call `sendMessage`

### 3.6 URL Sync

`goto('/?c=' + id, { replaceState: true, noScroll: true })` on every conversation switch. On page load, checks `?c=` parameter and loads matching conversation. Deep-linking works. `replaceState` keeps browser history clean.

### 3.7 Mobile Responsiveness

At `lg` breakpoint (1024px):
- **Desktop**: Sidebar is fixed 260px column, always visible
- **Mobile**: Sidebar hidden. Hamburger opens overlay with:
  - Black backdrop (`bg-black/40`)
  - Sidebar slides from left with close (X) button
  - Backdrop click or conversation select closes
  - "+" button in header starts new chat without opening sidebar

### 3.8 Scroll Behavior

- `$effect` watches `activeMessages.length` + `isTyping` — auto-scrolls when near bottom (80px threshold)
- "Scroll to end" floating button when scrolled past threshold
- `requestAnimationFrame(scrollToBottom)` ensures smooth scroll

### 3.9 API Client

`client/src/lib/api/`:

- **`client.ts`** — Generic fetch wrapper with `PUBLIC_API_URL`. `get<T>` / `post<T>` methods. Non-ok responses thrown as `ApiError` (includes `status`, `message`, `details`, `headers`). Headers copied via `res.headers.forEach()` for `retry-after` parsing.
- **`chat.ts`** — Typed surface: `sendMessage`, `getConversations`, `getMessages`.

### 3.10 Types

`client/src/lib/types/index.ts`:
```ts
Conversation { id, title, createdAt }
Message { id, conversationId, role: 'user' | 'agent', content, timestamp }
```
Mirrors Prisma schema as plain TypeScript interfaces.

---

## 4. End-to-End Data Flow

```
User presses Enter
    │
    ▼
MessageComposer.handleSend()
    ├─ Calls onSend(text)
    ├─ Clears textarea
    │
    ▼
+page.svelte.sendMessage(text)
    ├─ isTyping = true, clear failedMessage
    ├─ Create optimistic Message (id: "opt-<timestamp>")
    ├─ OPTIMISTIC UI:
    │   Existing convo → append to messagesByConversation
    │   New convo      → create temp entry ("new-<timestamp>", "New conversation"),
    │                     set active, update URL
    │
    ├─ POST /chat/message (body: { message, sessionId? })
    │       │
    │       ▼  Express server:
    │       ├─ rateLimit (1/10s per IP)
    │       ├─ Zod validates body
    │       ├─ handleMessage()
    │       │   ├─ Create Conversation (title: "New conversation")
    │       │   ├─ Save user Message
    │       │   ├─ generateTitle(userMessage) → "Return Policy"
    │       │   ├─ UPDATE Conversation.title = "Return Policy"
    │       │   ├─ Fetch full history
    │       │   ├─ generateReply() → PolicyRepository (cached) → OpenAI
    │       │   ├─ Save agent Message
    │       │   └─ Return { reply, sessionId }
    │       └─ Response sent
    │
    ├─ SUCCESS:
    │   ├─ Reload conversations (now shows "Return Policy")
    │   ├─ Replace temp ID → real sessionId, update URL
    │   ├─ Append AI reply
    │   └─ isTyping = false
    │
    ├─ FAILURE (429):
    │   ├─ failedMessage.body + retryAfter (min 30s)
    │   ├─ Amber countdown banner, isTyping stays true
    │   └─ Countdown ends → red banner + Retry button, isTyping = false
    │
    └─ FAILURE (non-429):
        ├─ failedMessage.retryAfter = 0
        ├─ Red banner + Retry immediately
        └─ isTyping = false
```

---

## 5. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Channel architecture** | Adding WhatsApp/Instagram = new channel file, no existing code changes |
| **Policies in DB with 5-min TTL cache** | Editable without redeploy; avoids DB read on every message |
| **Auto-generated conversation titles** | Scannable sidebar like ChatGPT/Gemini; generates 2–5 word summaries |
| **`role`/`content` names** | Mirrors OpenAI API — trivial mapping |
| **`agent` instead of `assistant`** | Distinct from OpenAI's `assistant` role; clearer naming |
| **LLM service never throws** | Guarantees data consistency without Prisma transactions |
| **Optimistic UI with temp IDs** | Instant feedback; `new-<timestamp>` unique enough during brief window |
| **Conversation ID on first message** | Avoids empty conversations cluttering sidebar |
| **Rate limiting only on POST** | Reads are cheap; writes trigger OpenAI billing |
| **`Retry-After` exposed via CORS** | Client parses header on 429 for accurate countdown |
| **Minimum 30s countdown** | Ensures server rate-limit window fully resets |
| **Failed message stays visible inline** | Prevents DB duplicates on retry |
| **`{#key activeConversationId}` on composer** | Destroys/recreates component on switch, clearing draft |
| **Optimistic title = "New conversation"** | Avoids showing raw first message before AI title generation |
| **Copy icon next to timestamp** | Always visible, no hover dependency, green checkmark feedback |
| **Mobile responsive overlay sidebar** | Single codebase, no separate widget build |
| **`replaceState` for URL sync** | Clean browser history |
| **Separate frontend/backend packages** | Independent deployment, no monorepo complexity |
| **SQLite** | Zero setup for local dev |
| **20-message history, 500-token limit** | Cost control with sufficient context |
| **Title generation: separate lightweight call** | Only on first message; independent of reply generation |

---

## 6. Trade-offs & If I Had More Time

### Production additions

| Feature | Current approach | Future improvement |
|---|---|---|
| Request mutex | Client-side via `isTyping` (composer disabled during pending request) | Server-side mutex per conversation ID |
| Pagination | `take: 50/100` safety caps | Cursor-based pagination with "load more" UI |
| Auth | None | JWT bearer token |
| Logging | `console.log` | Structured logging (pino/winston) |
| Testing | None | Unit tests + component tests |

### Improvements

| Area | Current | Better |
|---|---|---|
| Policy management | Re-seed via `npm run seed` | Admin panel for editing policies |
| Message editing | None | Edit/delete for user messages |
| Feedback | None | Thumbs up/down on AI replies for fine-tuning |
| Compression | None | gzip/brotli on response bodies |
| Conversation search | None | Full-text search across messages |

### Accepted limitations

- **Full dashboard layout vs widget** — Two-panel desktop layout is more app-like. Mobile responsiveness bridges this partially
- **No real-time** — No WebSocket/polling. User must send a message to get a reply
- **SQLite concurrency** — Prisma + SQLite serializes writes. Acceptable for single-user, bottleneck under load
- **Title generation adds latency on first message** — Extra OpenAI call (~200–500ms). Acceptable because it's one-time per conversation
