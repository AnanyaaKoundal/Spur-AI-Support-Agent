# Spur AI Support — Architecture Deep-Dive

This document provides a detailed overview of the architectural decisions, data flow, backend structure, frontend design, and implementation choices behind Spur AI Support.

The goal is to explain not only how the system is built, but also why specific design decisions were made and how they support maintainability, scalability, and future extensibility.

## Architecture Goals

The architecture was designed around four primary goals:

1. Maintainability through clear separation of concerns
2. Extensibility for future communication channels
3. Reliability when interacting with external AI services
4. Responsive user experience through optimistic updates

---

### **Contents**

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
  - [2.10 Test Suite](#210-test-suite)
- [3. Frontend Architecture](#3-frontend-architecture)
  - [3.1 Framework](#31-framework)
  - [3.2 State Design](#32-state-design)
  - [3.3 Component Tree](#33-component-tree)
  - [3.4 Component Details](#34-component-details)
  - [3.5 Optimistic UI Flow](#35-optimistic-ui-flow)
  - [3.6 Error Recovery](#36-error-recovery)
  - [3.7 URL Sync](#37-url-sync)
  - [3.8 Mobile Responsiveness](#38-mobile-responsiveness)
  - [3.9 Scroll Behavior](#39-scroll-behavior)
  - [3.10 API Client](#310-api-client)
  - [3.11 Types](#311-types)
- [4. End-to-End Data Flow](#4-end-to-end-data-flow)

---

## 1. Overall Project Structure

```
project-root/
├── client/                     # SvelteKit frontend (Vite default port 5173)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api/            # HTTP client + typed endpoint modules
│   │   │   ├── components/     # Svelte 5 UI components
│   │   │   └── types/          # TypeScript interfaces
│   │   └── routes/             # +page.svelte (entire app in one page)
│   ├── .env                    # PUBLIC_API_URL for dev
│   └── package.json
├── server/                     # Express backend (default port 3001)
│   ├── prisma/
│   │   ├── schema.prisma       # 3 tables: Conversation, Message, StorePolicy
│   │   ├── seed.ts             # 9 India-specific store policies
│   │   └── migrations/         # Prisma migration (PostgreSQL)
│   ├── src/
│   │   ├── channels/           # Channel adapters (web, future: whatsapp, etc.)
│   │   │   ├── README.md
│   │   │   └── web/web.channel.ts
│   │   ├── config/             # env.ts (dotenv loader), database.ts (PrismaClient singleton)
│   │   ├── middleware/         # errorHandler.ts (AppError + centralized handler)
│   │   ├── repositories/      # policy.repository.ts (5-min in-memory TTL cache)
│   │   ├── services/           # chat.service.ts, llm.service.ts, prompt.service.ts
│   │   └── validators/         # chat.validator.ts (Zod schema)
│   ├── .env.example
│   └── package.json
├── .gitignore
├── README.md
└── ARCHITECTURE.md
```

Frontend and backend are fully independent — separate `package.json`, separate TypeScript configs, no monorepo workspace, no shared dependencies. They communicate over HTTP and are deployed separately (e.g., frontend on Vercel, backend on Render, database on Neon).

---

## 2. Backend Architecture

### 2.1 Entry Point

`server/src/index.ts` — Minimal bootstrap:

1. Imports the Express `app` from `app.ts`
2. Loads env config (which triggers `dotenv.config()`)
3. Connects Prisma to PostgreSQL via `prisma.$connect()`
4. Starts Express on `env.port` (from `process.env.PORT` or defaults to `3001`)

No clustering, no middleware setup at this level — all of that lives in `app.ts`.

### 2.2 Express App

`server/src/app.ts` — Middleware stack:

| Middleware | Purpose |
|---|---|
| `cors({ origin: env.frontendUrl, credentials: true, exposedHeaders: ['Retry-After'] })` | Restricts origin to the frontend domain; exposes the rate-limit retry header so the client can read it |
| `express.json({ limit: '100kb' })` | Parses JSON request bodies within a 100KB limit |
| Routes (`/chat/*`) | API endpoints via `web.channel.ts` |
| `errorHandler` | Centralized catch-all for AppError, ZodError, and unexpected errors |

A `GET /health` route returns `{ status: 'ok' }` for uptime checks.

### 2.3 Channel Architecture

Instead of a flat `routes/` directory, the backend uses a **channel architecture**. Each channel is a self-contained Express router representing a communication platform:

```
channels/
├── README.md
└── web/
    └── web.channel.ts   # Web chat endpoints + rate limiting
```

Each channel is responsible for:
- Parsing its platform-specific request format
- Authenticating/verifying the request source
- Calling shared service functions (`chat.service.ts`)
- Formatting the response for its platform
- Handling platform-specific errors

Adding WhatsApp or Instagram means creating `channels/whatsapp/whatsapp.channel.ts` with its own rate limiting, validation, and response formatting — no existing code changes.

#### `web.channel.ts` — Endpoints

Three endpoints (no `/api` prefix):

```
GET    /chat/conversations                   → list (max 50)
GET    /chat/conversations/:id/messages      → conversation + messages (max 100)
POST   /chat/message                         → send message, get AI reply (rate-limited)
```

**`GET /chat/conversations`** — Calls `getConversations()` from `chat.service.ts`, returns `{ data: Conversation[] }`.

**`GET /chat/conversations/:id/messages`** — Calls `getConversationMessages(id)`, returns `{ data: { conversation, messages } }`.

**`POST /chat/message`** — Rate-limited via `express-rate-limit`:

```ts
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,  // 60-second window
  max: 20,               // 20 requests per window
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: true,   // X-RateLimit-* + Retry-After headers
  message: {
    reply: null,
    sessionId: null,
    error: 'Please wait a moment before sending another message.',
  },
});
```

The route:
1. Applies `messageLimiter` middleware
2. Validates body with `chatMessageSchema.parse(req.body)` (throws ZodError on failure)
3. Calls `handleMessage(message, sessionId)` from `chat.service.ts`
4. Returns `{ reply, sessionId }` on success
5. Forwards errors to `next(error)` for the centralized handler

### 2.4 Service Layer

#### `chat.service.ts` — Core chat orchestration

```
handleMessage(message, sessionId?)
  │
  ├─ 1. Find or create conversation
  │     sessionId provided → prisma.conversation.findUnique (404 if missing)
  │     no sessionId       → prisma.conversation.create({ title: "New conversation" })
  │
  ├─ 2. prisma.message.create({ role: 'user', content: message })
  │
  ├─ 3. If new conversation → generateTitle(message)
  │     └─ prisma.conversation.update({ title: generatedTitle })
  │
  ├─ 4. prisma.message.findMany (full history, ordered by timestamp)
  │
  ├─ 5. generateReply(history, message) — always returns string, never throws
  │
  ├─ 6. prisma.message.create({ role: 'agent', content: reply })
  │
  └─ 7. Return { reply, sessionId: conversation.id }
```

Key design: The LLM call **never throws** — all errors are caught internally and returned as user-friendly strings. This guarantees data consistency without needing Prisma transactions. The user message is always saved, and the AI reply is always saved (even if the content is an error message).

**`getConversations()`** — `prisma.conversation.findMany` with `orderBy: { createdAt: 'desc' }`, `take: 50`, selecting only `id`, `title`, `createdAt`.

**`getConversationMessages(conversationId)`** — First verifies the conversation exists (404 if not), then `prisma.message.findMany` with `orderBy: { timestamp: 'asc' }`, `take: 100`, selecting `id`, `conversationId`, `role`, `content`, `timestamp`. Returns `{ conversation, messages }`.

---

#### `llm.service.ts` — OpenAI integration

**Client initialization** — Singleton pattern: `getClient()` creates the `OpenAI` instance lazily on first call using `env.openaiApiKey`.

**`generateReply(history, userMessage)`:**

1. **No API key check** — Returns a friendly message if `OPENAI_API_KEY` is not set
2. **Parallel fetch** — `Promise.all` loads the system prompt (via `prompt.service.ts`) and trims history to last 20 messages simultaneously
3. **Role mapping** — Internal roles (`user` / `agent`) are mapped to OpenAI roles (`user` / `assistant`)
4. **OpenAI call** — `gpt-4o-mini`, `max_tokens: 500`, `temperature: 0.7`, `REQUEST_TIMEOUT_MS: 15000`
5. **Result** — Returns response content trimmed, or a fallback string if empty

**Error handling — every path returns a string, never throws:**

| Error | User-facing message |
|---|---|
| No API key | "I'm sorry, the support assistant is currently unavailable. Please try again later." |
| OpenAI 429 | "I'm currently experiencing high demand. Please try again in a moment." |
| `insufficient_quota` | "The support assistant is temporarily unavailable. Please try again later." |
| Timeout (name includes 'TimeoutError' or message includes 'timeout') | "The request took too long to process. Please try again." |
| Other `OpenAI.APIError` (401, etc.) | "I'm sorry, something went wrong while processing your request. Please try again after some time." |
| Unexpected error | "I'm sorry, something went wrong. Please try again." |

**`generateTitle(userMessage)`:**

Separate lightweight OpenAI call using the same model (`gpt-4o-mini`) but with `max_tokens: 20`, `temperature: 0.3`. The system prompt asks for a 2–5 word title summarizing the user's intent. Falls back to `"New conversation"` on any error (including empty response or missing API key). Only invoked on the first message of a new conversation — never on existing conversations.

---

#### `prompt.service.ts` — System prompt builder

Fetches all policies from `PolicyRepository` and assembles the system prompt dynamically:

```
Role: You are a friendly customer support agent for Spur Shop (Indian e-commerce).

Responsibilities:
  - Help with shipping, returns, refunds, support hours, products, etc.
  - Keep responses under 150 words
  - Ask for order number for order-specific actions
  - Use store policies as primary source of truth

STRICT SCOPE LIMITATION (14 categories of forbidden topics):
  - No programming/coding help, technical tutorials, math problems
  - No homework, career, legal, medical, financial advice
  - No travel/restaurant recommendations
  - No general knowledge answers, creative writing, or off-domain content

On off-topic questions: politely acknowledge, explain scope limitation, redirect to store topics.
Includes example dialogs for "Can you teach me JavaScript?" and "Which stock should I invest in?"

Store Policies:
  --- About Spur Shop ---
  --- Shipping Policy ---
  --- Returns & Refunds Policy ---
  --- Payment Methods ---
  --- Order Management ---
  --- Account Management ---
  --- Customer Support ---
  --- Product Information ---
  --- Privacy & Security ---
```

The strict scope limitation is enforced entirely via prompt instructions, not code-level filtering.

### 2.5 Repository Layer

#### `policy.repository.ts` — Cached policy fetcher

```ts
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
let cachedPolicies: StorePolicy[] | null = null;
let lastLoaded = 0;
```

**`getAllPolicies()`**:
1. If cache is populated and `Date.now() - lastLoaded < CACHE_TTL` → return cached array (no DB hit)
2. Otherwise → `prisma.storePolicy.findMany({ orderBy: { createdAt: 'asc' } })`, store in `cachedPolicies`, update `lastLoaded`, return

This avoids a database read on every message while keeping policies editable (changes propagate within 5 minutes). An admin panel could add a `refreshPolicies()` endpoint for instant cache invalidation.

### 2.6 Validation

`server/src/validators/chat.validator.ts` — Zod schema:

```ts
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(10000, 'Message is too long'),
  sessionId: z.string().uuid().optional(),
});
```

- Empty message → 400 with `{ error: 'Validation failed', details: [...] }`
- Over 10,000 characters → 400
- `sessionId` must be a valid UUID v4 (or absent)
- TypeScript type `ChatMessageInput` is inferred from the schema via `z.infer`

### 2.7 Error Handling

`server/src/middleware/errorHandler.ts` — Custom `AppError` class:

```ts
export class AppError extends Error {
  constructor(public statusCode: number, message: string) { ... }
}
```

Handler logic:

| Error type | Status | Response body |
|---|---|---|
| `AppError` | `err.statusCode` | `{ reply: null, sessionId: null, error: err.message }` |
| `ZodError` | 400 | `{ reply: null, sessionId: null, error: 'Validation failed', details: err.errors }` |
| Unknown | 500 | `{ reply: null, sessionId: null, error: 'Internal server error' }` + console.error |

The consistent `{ reply, sessionId, error }` response shape ensures the frontend always gets predictable JSON, regardless of where the error originates.

### 2.8 Data Model

`server/prisma/schema.prisma` — Three tables, PostgreSQL:

**Conversation**
| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | UUID primary key |
| `title` | `String @default("New conversation")` | Updated by AI after first message |
| `createdAt` | `DateTime @default(now())` | |
| `messages` | `Message[]` | Relation (cascade delete) |

**Message**
| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | UUID primary key |
| `conversationId` | `String` | Foreign key → Conversation.id (cascade delete) |
| `role` | `String` | `"user"` or `"agent"` |
| `content` | `String` | Message body |
| `timestamp` | `DateTime @default(now())` | |
| `conversation` | `Conversation @relation` | |

Index: `@@index([conversationId])` — fast lookups by conversation.

**StorePolicy**
| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(uuid())` | UUID primary key |
| `topic` | `String @unique` | e.g. `"shipping"`, `"returns_refunds"` |
| `title` | `String` | e.g. `"Shipping Policy"` |
| `content` | `String` | Full policy text |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | Auto-updated by Prisma |

Field names (`role`/`content`, `agent` instead of `assistant`) mirror OpenAI's `ChatCompletionMessageParam` format — the mapping in `llm.service.ts` is trivial.

### 2.9 Seed Data

`server/prisma/seed.ts` — 9 policies covering common e-commerce scenarios. All content is India-specific:

- INR pricing on shipping (₹49, ₹149, ₹249) and free-shipping threshold (₹499)
- UPI (Google Pay, PhonePe, Paytm, BHIM, CRED), COD up to ₹10,000, EMI above ₹3,000
- Delivery partners: Delhivery, Blue Dart, XpressBees, India Post
- IST support hours (9AM–9PM Mon–Sat, 10AM–6PM Sun)
- Indian holidays: Diwali, Holi, Eid, Republic Day, Independence Day, Gandhi Jayanti, Christmas
- Phone: 1800-123-SPUR, WhatsApp: +91-98765-43210
- Customer support email: support@spurshop.com

Re-runnable — seeds with `deleteMany()` then `create()` on each topic.

### 2.10 Test Suite

`vitest` + `supertest`, 4 test files, 20 tests total:

| Test file | Tests | What it covers |
|---|---|---|
| `validators/__tests__/chat.validator.test.ts` | 6 | Empty message rejected, over 10000 rejected, exact boundary accepted, valid without sessionId, invalid UUID rejected, valid UUID accepted |
| `services/__tests__/llm.service.test.ts` | 6 | Mocked OpenAI client returns friendly strings on 401, 429, timeout, generic error; title generation returns AI response; empty content falls back to "New conversation" |
| `services/__tests__/chat.service.test.ts` | 3 | Title generated and stored for new conversations; no title for existing conversations; 404 thrown for non-existent sessionId |
| `channels/web/__tests__/web.channel.test.ts` | 5 | Empty body returns 400 with "Validation failed"; missing field returns 400; valid request returns 200 with reply + sessionId; sessionId passed to service; rate limiter returns 429 after max requests |

---

## 3. Frontend Architecture

### 3.1 Framework

SvelteKit with **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`). No Svelte stores — all state is component-local within `+page.svelte`. The entire app is a single page with no client-side routing besides URL query parameter updates.

### 3.2 State Design

All mutable state lives in `+page.svelte`:

| Variable | Type | Purpose |
|---|---|---|
| `conversations` | `Conversation[]` | Sidebar conversation list |
| `messagesByConversation` | `Record<string, Message[]>` | Messages keyed by conversation ID |
| `activeConversationId` | `string \| null` | Currently selected conversation |
| `sidebarOpen` | `boolean` | Mobile sidebar overlay toggle |
| `isTyping` | `boolean` | True while waiting for AI reply (disables composer, shows dots) |
| `showWelcome` | `boolean` | Shows WelcomeScreen when no conversation is active |
| `isLoadingMessages` | `boolean` | Loading spinner in message area |
| `failedMessage` | `{ text, messageId, body, retryAfter } \| null` | Failed message state for error recovery |
| `retryCountdown` | `number` | Seconds remaining before rate-limit retry is allowed |
| `isNearBottom` | `boolean` | Whether the user is scrolled near the bottom of the message list |
| `messageContainer` | `HTMLDivElement` | Reference to the scrollable message container div |

Derived state:

```ts
let activeConversation = $derived(
  conversations.find((c) => c.id === activeConversationId) ?? null
);

let activeMessages = $derived(
  activeConversationId ? messagesByConversation[activeConversationId] ?? [] : []
);
```

### 3.3 Component Tree

```
+page.svelte
├── Sidebar (desktop: visible via class="hidden lg:flex")
├── Sidebar (mobile overlay: conditional, with backdrop + close button)
├── Header
│   ├── Brand ("Spur AI Support" + green online dot)
│   ├── Hamburger button (mobile only)
│   ├── Active conversation title (desktop only)
│   └── "+" new chat button (mobile only, visible when in conversation)
├── Message area
│   ├── Loading spinner (isLoadingMessages)
│   ├── WelcomeScreen (showWelcome && !activeConversationId)
│   ├── Message list (activeMessages.length > 0)
│   │   ├── ChatMessage × N
│   │   ├── Error banner (failedMessage — amber countdown or red retry)
│   │   └── Typing indicator (isTyping && !failedMessage — 3 dots + avatar)
│   ├── Empty state ("No messages yet")
│   └── "Scroll to end" button (!isNearBottom && activeMessages.length > 0)
└── MessageComposer ({#key activeConversationId} — destroys/remounts on switch)
```

### 3.4 Component Details

#### `Sidebar.svelte`

**Props**: `conversations`, `activeId`, `loading`, `onNewChat`, `onSelect`, `class`

- Brand section: "S" logo on `bg-primary-600` + "Spur" text
- "New Chat" button: full-width `bg-primary-600`, plus icon, rounded
- Conversation list: scrollable, each item is a `button` with:
  - Active state: `bg-primary-50` + `text-primary-700`
  - Inactive: `hover:bg-surface-50`
  - Title truncated via `truncate` class with `title={conv.title}` for hover tooltip
  - Thin dividers (`border-b border-surface-100`) between items
- Empty state: "No conversations yet"
- Loading state: "Loading conversations..."
- `class` prop enables `hidden lg:flex` on desktop instance vs default (block) on mobile overlay

#### `WelcomeScreen.svelte`

**Props**: `onSuggestedQuestion`

- Centered vertically + horizontally
- Chat bubble SVG icon in `bg-primary-50`
- Heading: "How can we help you?"
- Subtitle: "I'm Spur, your AI support assistant..."
- 4 suggestion chips as `rounded-full` buttons with emoji icons: 🚚 Shipping Policy, 📦 Return Policy, 💳 Refund Process, 🕐 Support Hours
- Border on chips, hover → `border-primary-200 text-primary-600`

#### `ChatMessage.svelte`

**Props**: `message`

Layout per message: name line → bubble + avatar → timestamp + copy icon

- **User**: `justify-end`, blue bubble (`bg-primary-600 text-white`, `rounded-br-md`), name "You" in `text-surface-400`, no avatar, plain text content (no markdown)
- **Agent**: `justify-start`, white card (`border border-surface-100 bg-white`, `rounded-bl-md`), "S" avatar circle (`bg-primary-600`), name "Spur AI Agent" in `text-primary-600`, **markdown rendering** via `marked` library with Tailwind prose-like utilities
- **Timestamp**: `toLocaleTimeString('en-IN')` with 12-hour format. Same-day → time only. Older → `"26 Jun, 6:30 PM"` format
- **Copy button**: clipboard SVG icon, always visible (no hover dependency), placed next to timestamp on same line with `gap-3`. On click → `navigator.clipboard.writeText(message.content)` → switches to green checkmark SVG for 2 seconds. Falls back silently if Clipboard API is unavailable

#### `MessageComposer.svelte`

**Props**: `onSend`, `disabled`

**Internal state**: `text` (string), `charCount` (derived), `overLimit` (derived: `charCount > MAX_LENGTH`)

- Single-row layout: textarea + send button
- **Textarea**: `rows="1"`, `max-h-32`, `resize-none`. Enter sends (prevented via `e.preventDefault()`), Shift+Enter inserts newline
- **Character counter**: appears only after first keystroke (`{#if charCount > 0}`). Gray (`text-surface-400`) normally, `font-medium text-red-500` only when over 10,000 limit
- **Over-limit state**: `border-red-300 bg-red-50` on textarea, send button disabled
- **Disabled state**: send button gets `disabled:opacity-40` when `disabled`, `overLimit`, or `!text.trim()`
- **`{#key activeConversationId}`** in `+page.svelte` — destroys and remounts this component on conversation switch, which resets `text` to empty string automatically

### 3.5 Optimistic UI Flow

```
sendMessage(text)
  │
  ├─ isTyping = true, failedMessage = null
  │
  ├─ Create optimistic Message { id: "opt-<timestamp>", role: 'user', content: text }
  │
  ├─ If existing conversation:
  │     Append to messagesByConversation[activeConversationId]
  │
  ├─ If new conversation (no sessionId):
  │     Create temp entry: { id: "new-<timestamp>", title: "New conversation" }
  │     Prepend to conversations array
  │     Set activeConversationId = temp ID
  │     showWelcome = false, syncUrl(temp ID)
  │     messagesByConversation[tempId] = [optimistic user message]
  │
  ├─ Call API: POST /chat/message
  │
  ├─ ON SUCCESS:
  │   ├─ If was new conversation:
  │   │     loadConversations() — refreshes sidebar with generated title
  │   │     Replace temp ID → real sessionId, update URL
  │   │     Transfer messages from temp key to real key
  │   │     Delete temp key from messagesByConversation
  │   └─ If existing:
  │         Append AI reply message (id: "ai-<timestamp>")
  │
  └─ ON FAILURE:
      ├─ If new conversation (no sessionId):
      │     Remove temp entry from conversations + messagesByConversation
      │     activeConversationId = null, showWelcome = true, syncUrl(null)
      └─ If existing conversation:
            Set failedMessage with error details (see Error Recovery below)
```

### 3.6 Error Recovery

```
catch (e)
  │
  ├─ Parse error: errorBody, statusCode, retryAfter from headers['retry-after']
  │
  ├─ If new conversation (no sessionId):
  │     Clean up optimistic entry, reset to welcome screen
  │
  └─ If existing conversation (activeConversationId is set):
      │
      ├─ rate = statusCode === 429 && retryAfter > 0
      │     ? Math.max(30, retryAfter)     // minimum 30s countdown
      │     : 0
      │
      ├─ failedMessage = { text, messageId, body: errorBody, retryAfter: rate }
      │
      ├─ IF rate > 0 (rate-limit):
      │     retryCountdown = rate
      │     isTyping = true (keeps typing dots visible during countdown)
      │
      └─ FINALLY:
            If failedMessage is null or retryAfter === 0 → isTyping = false
```

**Countdown timer**: `$effect` runs `setInterval(() => retryCountdown--, 1000)` while `retryCountdown > 0`. Cleans up with `clearInterval` on teardown.

**Transition**: When `retryCountdown` hits 0 for a rate-limit error, a separate `$effect` detects `retryCountdown === 0 && failedMessage.retryAfter > 0`, sets `failedMessage.retryAfter = 0`, and sets `isTyping = false`. This switches the banner from amber countdown to red "Retry Message" button.

**UI states**:
- Rate-limit active (`retryAfter > 0`): Amber banner (`bg-amber-50 text-amber-700`) with info icon, "{errorBody} You can try again in **{N}s**."
- Retry ready (`retryAfter === 0`): Red banner (`bg-red-50 text-red-600`) with warning icon, "Your previous message wasn't processed." + "Retry Message" button
- Typing indicator: `{#if isTyping && !failedMessage}` — hidden during errors

**`retryMessage(msgId)`**: Removes the failed message from `messagesByConversation` by index (preserving message order), clears `failedMessage`, clears `retryCountdown`, and re-calls `sendMessage(text)` with the original text.

### 3.7 URL Sync

On every conversation switch:
```ts
goto('/?c=' + id, { replaceState: true, noScroll: true })
```

On page load (`browser` guard):
```ts
const urlId = new URL(window.location.href).searchParams.get('c');
if (urlId) {
  activeConversationId = urlId;
  showWelcome = false;
  loadMessages(urlId);
}
loadConversations();
```

`replaceState` keeps browser history clean — back button returns to the previous app state, not the previous conversation.

### 3.8 Mobile Responsiveness

Breakpoint: `lg` (1024px).

**Desktop** (`hidden lg:flex`):
- Sidebar is a fixed 260px column, always visible
- Main area fills remaining width

**Mobile/tablet** (below `lg`):
- Sidebar is hidden by default
- Hamburger button in header opens an overlay:
  - `fixed inset-0 z-40 bg-black/40` — semi-transparent backdrop
  - `fixed inset-y-0 left-0 z-50 w-[260px]` — sidebar slides from left
  - Close (X) button inside the overlay panel (`absolute right-3 top-3`)
  - Backdrop click → `sidebarOpen = false`
  - Conversation select → `sidebarOpen = false`
- "+" new chat button in header (visible only when `activeConversation` exists)
- Active conversation title visible on `sm:block` (above mobile, below desktop)

### 3.9 Scroll Behavior

- **`$effect` on `activeMessages.length`**: When messages change and `isNearBottom` is true, auto-scroll via `requestAnimationFrame(scrollToBottom)`
- **`$effect` on `isTyping`**: When typing finishes and `isNearBottom` is true, auto-scroll to reveal new content
- **"Scroll to end" button**: `absolute bottom-20 left-1/2 -translate-x-1/2`, visible when `!isNearBottom && activeMessages.length > 0`
- **Scroll threshold**: 80px from bottom (`scrollHeight - scrollTop - clientHeight < 80`)

### 3.10 API Client

**`client/src/lib/api/client.ts`**:

- Imports `PUBLIC_API_URL` from `$env/static/public` (build-time env var)
- Generic `request<T>(path, options)` function:
  - Constructs full URL: `"${PUBLIC_API_URL}${path}"`
  - Sets `Content-Type: application/json` header
  - On non-ok response: parses JSON body, copies all response headers via `res.headers.forEach()`, throws `ApiError`
- `ApiError` class: `status`, `message`, `details`, `headers`
- `api.get<T>(path)` and `api.post<T>(path, body)` helpers

**`client/src/lib/api/chat.ts`**:

Three typed methods wrapping the generic client:
- `sendMessage(message, sessionId?)` → `POST /chat/message`
- `getConversations()` → `GET /chat/conversations`
- `getMessages(conversationId)` → `GET /chat/conversations/:id/messages`

GET responses are wrapped in `{ data: ... }`, POST returns `{ reply, sessionId }` directly.

### 3.11 Types

`client/src/lib/types/index.ts`:

```ts
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}
```

Mirrors the Prisma schema as plain TypeScript interfaces. No shared type package — the frontend defines its own types independently.

---

## 4. End-to-End Data Flow

```
User presses Enter
    │
    ▼
MessageComposer.handleSend()
    ├─ text.trim() validation
    ├─ Calls onSend(text)
    └─ Clears textarea
    │
    ▼
+page.svelte.sendMessage(text)
    ├─ isTyping = true, clear failedMessage
    ├─ Create optimistic Message("opt-<timestamp>", role: 'user')
    │
    ├─ OPTIMISTIC UI:
    │   Existing conversation → append to messagesByConversation[convId]
    │   New conversation      → create sidebar entry ("new-<timestamp>", "New conversation"),
    │                            set activeConversationId, update URL, store message
    │
    ├─ POST /chat/message { message, sessionId? }
    │       │
    │       │  ┌── Network ──────────────────────────────────────────┐
    │       │  │                                                     │
    │       │  ▼  Express server                                     │
    │       │  ├─ rateLimit (20 req / 60s, Retry-After header)        │
    │       │  ├─ Zod validates body (min 1, max 10000, optional UUID)│
    │       │  ├─ handleMessage(message, sessionId)                   │
    │       │  │   ├─ Find/Create Conversation                       │
    │       │  │   ├─ Save user Message (role: 'user')               │
    │       │  │   ├─ If new → generateTitle(message) → "Return Policy"│
    │       │  │   │            → UPDATE Conversation.title            │
    │       │  │   ├─ Fetch full history (ordered by timestamp)       │
    │       │  │   ├─ generateReply(history, message)                 │
    │       │  │   │   ├─ buildSupportPrompt()                        │
    │       │  │   │   │   └─ PolicyRepository.getAllPolicies()      │
    │       │  │   │   │       ├─ Cache hit → return cached          │
    │       │  │   │   │       └─ Cache miss → query PostgreSQL      │
    │       │  │   │   ├─ OpenAI: gpt-4o-mini, max_tokens=500        │
    │       │  │   │   └─ Returns string (never throws)              │
    │       │  │   ├─ Save AI reply (role: 'agent')                  │
    │       │  │   └─ Return { reply, sessionId }                    │
    │       │  └─ Response sent as JSON                              │
    │       │                                                     │
    │       └─────────────────────────────────────────────────────┘
    │
    ├─ ON SUCCESS:
    │   ├─ New conversation:
    │   │     loadConversations() → sidebar refreshed with generated title
    │   │     Replace "new-<timestamp>" → real sessionId
    │   │     Transfer messages, update URL, delete temp key
    │   └─ Existing:
    │         Append AI reply message to messagesByConversation
    │   ├─ isTyping = false
    │   └─ Auto-scroll if near bottom
    │
    ├─ ON FAILURE (429 — rate limited):
    │   ├─ retryAfter = Math.max(30, parseInt(Retry-After header, 10))
    │   ├─ failedMessage.body = error message
    │   ├─ Amber countdown banner shows: "{body} You can try again in {N}s."
    │   ├─ isTyping = true during countdown (keeps dots visible)
    │   ├─ Countdown reaches 0:
    │   │     failedMessage.retryAfter = 0
    │   │     isTyping = false
    │   │     Red banner + "Retry Message" button
    │   └─ On "Retry Message" click:
    │         Remove failed message from list
    │         Call sendMessage(text) again
    │
    └─ ON FAILURE (non-429):
        ├─ retryAfter = 0
        ├─ failedMessage.body = error message
        ├─ Red banner + "Retry Message" button immediately
        └─ isTyping = false
```
