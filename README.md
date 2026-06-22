# Spur AI Support

AI-powered customer support chat for an Indian e-commerce store. Built with SvelteKit + Express + Prisma + OpenAI.

---

**Contents**

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Database](#database)
- [LLM Integration](#llm-integration)
- [Design Decisions](#design-decisions)
- [Trade-offs & Future Improvements](#trade-offs--future-improvements)
- [Architecture Deep-Dive](./ARCHITECTURE.md)

---

## Features

- **Chat interface** — Two-panel SaaS layout with conversation sidebar and message area
- **AI-powered replies** — OpenAI `gpt-4o-mini` answers queries about orders, shipping, returns, products, and more
- **Store policy knowledge** — 9 seeded store policies (INR/India-specific) injected into the LLM system prompt
- **Conversation management** — Multiple conversations with sidebar, active state highlighting, truncation with hover tooltip
- **Optimistic UI** — Messages appear instantly; rate-limit error recovery with countdown and retry button
- **Automatic title generation** — AI summarizes the first user message into a short, meaningful title (2–5 words)
- **Mobile responsive** — Hamburger menu overlay sidebar on mobile with backdrop and close button
- **URL sync** — `?c=<conversationId>` for deep-linking and browser back/forward
- **Markdown rendering** — AI replies rendered via `marked`; user messages as plain text
- **Copy to clipboard** — Inline copy icon next to timestamp on every message

---

## Architecture Overview

```
┌──────────────┐     REST API      ┌──────────────┐     Prisma     ┌─────────────┐
│  Frontend    │ ────────────────> │   Backend    │ ────────────> │   SQLite    │
│ localhost:5173│ <──────────────── │ localhost:3001│ <──────────── │   dev.db    │
└──────────────┘                   └──────────────┘               └─────────────┘
```

Frontend (SvelteKit) and backend (Express) are completely independent — separate `package.json`, separate configs, separate deployments. No monorepo, no shared dependencies. They communicate via REST over HTTP.

### Backend Layers

```
Channels (web.channel.ts)          ← Route handlers organized by platform
  └─> Validators (Zod)             ← Request body validation
       └─> Services                ← Business logic
            ├─> chat.service.ts    ← Message flow orchestration
            ├─> llm.service.ts     ← OpenAI integration
            ├─> prompt.service.ts  ← System prompt assembly
            ├─> repositories/      ← Data access with caching
            └─> Prisma / SQLite    ← Database
```

- **Channels** — Each platform (web, future: WhatsApp, Instagram) gets its own Express router with its own rate limiting and validation. Adding a new channel means a new file — no existing code changes.
- **Services** — `chat.service` orchestrates the message lifecycle. `llm.service` talks to OpenAI and never throws. `prompt.service` builds the system prompt with policies.
- **Repositories** — `policy.repository.ts` fetches store policies from DB with a 5-minute in-memory TTL cache.
- **Middleware** — Centralized error handler catches `AppError` (custom status codes), `ZodError` (400 with details), and unknown errors (500).

### Frontend Structure

```
+page.svelte (single-page app)
├── Sidebar.svelte                ← Conversation list + "New Chat"
├── WelcomeScreen.svelte          ← Empty state with suggestion chips
├── ChatMessage.svelte            ← Individual message bubble
└── MessageComposer.svelte        ← Textarea + send button
```

All state lives in `+page.svelte` using Svelte 5 runes (`$state`, `$derived`, `$effect`). No stores, no global state management.

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Step 1 — Clone and install dependencies

```bash
# Backend
cd server
npm install

# Frontend (separate terminal)
cd client
npm install
```

### Step 2 — Configure environment variables

**Backend** — Create `server/.env`:

```env
PORT=3001
DATABASE_URL=file:./dev.db
OPENAI_API_KEY=sk-...
FRONTEND_URL=http://localhost:5173
```

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3001) |
| `DATABASE_URL` | SQLite connection string (`file:./dev.db`) |
| `OPENAI_API_KEY` | Your OpenAI API key (required for AI replies) |
| `FRONTEND_URL` | Allowed CORS origin (default: `http://localhost:5173`) |

**Frontend** — Create `client/.env`:

```env
PUBLIC_API_URL=http://localhost:3001
```

| Variable | Description |
|---|---|
| `PUBLIC_API_URL` | Backend base URL (no `/api` prefix) |

### Step 3 — Set up the database

```bash
cd server

# Generate Prisma Client (TypeScript types + query engine)
npx prisma generate

# Run migrations (creates dev.db with all tables)
npx prisma migrate dev

# Seed 9 store policies (shipping, returns, payments, etc.)
npm run seed
```

This creates `server/dev.db` with three tables (`Conversation`, `Message`, `StorePolicy`) and populates the store policies. Re-run `npm run seed` anytime to reset policies.

### Step 4 — Start development servers

```bash
# Terminal 1 — Backend (http://localhost:3001)
cd server
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## API Endpoints

| Method | Path | Description | Rate Limited |
|---|---|---|---|
| `GET` | `/health` | Health check | No |
| `POST` | `/chat/message` | Send a message, get AI reply | Yes: 1 req / 10s per IP |
| `GET` | `/chat/conversations` | List all conversations (max 50) | No |
| `GET` | `/chat/conversations/:id/messages` | Get messages for a conversation (max 100) | No |

### `POST /chat/message`

```json
{
  "message": "What is your return policy?",
  "sessionId": "optional-uuid-or-omit-for-new-conversation"
}
```

- `message`: required, 1–10,000 characters (validated with Zod)
- `sessionId`: optional — omit to create a new conversation

Returns:
```json
{
  "reply": "Our return policy allows returns within 7 days of delivery...",
  "sessionId": "uuid-of-the-conversation"
}
```

On rate-limit (429), the response includes a `Retry-After` header (seconds until reset), which the frontend uses for its countdown timer.

---

## Database

Uses **SQLite** via Prisma (no external database server needed). The connection string is `file:./dev.db`, stored at `server/dev.db`.

### Models

| Model | Fields | Description |
|---|---|---|
| `Conversation` | `id` (UUID), `title` (default: "New conversation"), `createdAt` | A chat conversation |
| `Message` | `id` (UUID), `conversationId` (FK), `role` ("user"\|"agent"), `content`, `timestamp` | Individual message in a conversation |
| `StorePolicy` | `id` (UUID), `topic` (unique), `title`, `content`, `createdAt`, `updatedAt` | A store policy used in the LLM system prompt |

### Seed Data

9 India-specific store policies:

- Store Overview — Spur Shop catalog, sourcing, gift cards
- Shipping Policy — Pincode coverage, rates (₹49/₹149/₹249), carriers (Delhivery, Blue Dart, India Post, XpressBees)
- Returns & Refunds — 7-day policy, UPI/Card/COD refund, no exchanges
- Payment Methods — UPI, COD (up to ₹10,000), EMI, Razorpay gateway
- Order Management — Cancellation (1hr window), tracking, lost packages
- Account Management — Password reset, wishlist, account deletion
- Customer Support — Hours (Mon-Sat 9AM-9PM IST), chat/email/phone/WhatsApp
- Product Information — Apparel sizes (XS–3XL), tech accessories, care instructions
- Privacy & Security — Data collection, IT Act 2000 compliance, cookie policy

Re-seed anytime:
```bash
cd server && npm run seed
```

---

## LLM Integration

### Provider

**OpenAI** — model `gpt-4o-mini`. Chosen for cost efficiency (~$0.15/million input tokens, ~$0.0006 per exchange) while maintaining high-quality responses for customer support use cases.

### How prompting works

The system prompt is assembled dynamically on each request by `prompt.service.ts`. It has three parts:

**1. Role definition** — "You are a friendly, professional customer support agent for Spur Shop, an Indian online lifestyle and essentials store."

**2. Behavioral rules:**
- Keep responses under 150 words
- Never invent policies — use only the provided store policies
- Ask for the order number before performing account-specific actions
- Politely refuse off-topic questions (programming, finance, health, etc.) with a redirect to store-related topics
- Be concise and direct — avoid unnecessary pleasantries

**3. Store policies** — All 9 policies fetched from the database (via `PolicyRepository` with 5-minute TTL cache), formatted as numbered sections.

### Configuration

| Parameter | Value | Why |
|---|---|---|
| Model | `gpt-4o-mini` | Cost-efficient; fast |
| `max_tokens` | 500 | Limits response length and cost |
| `temperature` | 0.7 | Balances creativity and consistency |
| `max_history` | 20 messages | Controls token usage while maintaining context |
| Request timeout | 15 seconds | Fails fast on OpenAI latency |

### Title generation

A separate lightweight LLM call runs only on the first message of a new conversation. It uses `max_tokens: 20`, `temperature: 0.3`, and a system prompt requesting a 2–5 word summary of the user's intent. Falls back to `"New conversation"` on any error.

### Error handling

The LLM service (`llm.service.ts`) **never throws** — every path returns a user-friendly string:

| Scenario | Response to user |
|---|---|
| API key missing | "The support assistant is currently unavailable." |
| OpenAI 429 (rate limited) | "I'm currently experiencing high demand. Please try again." |
| Insufficient quota | "The support assistant is temporarily unavailable." |
| Request timeout | "The request took too long to process. Please try again." |
| Other OpenAI error | "Something went wrong while processing your request." |
| Unexpected error | "Something went wrong. Please try again." |

This design eliminates the need for Prisma transactions — the user message and AI reply are always consistently paired.

---

## Design Decisions

| Decision | Rationale |
|---|---|
| **Channel architecture** (channels/web/ instead of routes/) | Adding WhatsApp/Instagram = new channel file, no existing code changes. Shows future-proofing. |
| **Store policies in DB with TTL cache** | Editable without redeploying. 5-min cache avoids DB reads on every message while keeping edits responsive. |
| **Auto-generated conversation titles** | Makes the sidebar scannable like ChatGPT/Gemini. Generated via a separate lightweight OpenAI call. |
| **`role`/`content` field names** | Mirrors OpenAI API conventions — no transformation needed when calling `chat.completions.create`. |
| **LLM service never throws** | Guarantees data consistency without Prisma transactions — the user message and AI reply are always paired. |
| **Optimistic UI with temp IDs** | User message + sidebar entry appear instantly. Temp IDs (`new-<timestamp>`) are unique enough. |
| **Conversation ID on first message** | Avoids empty conversations cluttering the sidebar (unlike creating on "New Chat" click). |
| **Rate limiting only on POST /chat/message** | Read endpoints are cheap (DB only). Writes trigger OpenAI billing and should be protected. |
| **`Retry-After` exposed via CORS** | Browser makes the header visible to JavaScript on 429 responses for accurate client countdown. |
| **Minimum 30s countdown for rate limits** | Ensures the server rate-limit window has time to fully reset before allowing retry. |
| **Error recovery keeps failed message visible** | The failed message stays in the UI until retry is explicitly triggered — prevents DB duplicates. |
| **`{#key activeConversationId}` on composer** | Destroys and recreates the component on conversation switch, clearing any draft text. |
| **Copy icon next to timestamp** | Always visible (not hover-based), icon-only, green checkmark feedback on copy. |

---

## Trade-offs & Future Improvements

### What we'd add in production

| Area | Current approach | Future improvement |
|---|---|---|
| **Request mutex** | Client-side via `isTyping` — composer disabled while request is pending | Server-side mutex per conversation ID to handle rapid concurrent requests |
| **Pagination** | `take: 50/100` safety caps — simple but not scrollable | Cursor-based pagination with "load more" infinite scroll |
| **Authentication** | None — demo/assignment scope | JWT bearer token for multi-tenant usage |
| **Logging** | `console.log` statements throughout | Structured logging (pino/winston) with log levels and correlation IDs |
| **Testing** | None — built for speed | Unit tests for services, component tests with Playwright/Vitest |

### What we'd improve

| Area | Current | Better |
|---|---|---|
| **Policy management** | Re-seed via CLI (`npm run seed`) | Admin panel with inline editing + instant cache invalidation |
| **Message editing** | Not supported | Edit/delete for user messages |
| **AI feedback** | Not supported | Thumbs up/down on AI replies for fine-tuning and evaluation |
| **Response compression** | None | gzip/brotli middleware on Express |
| **Conversation search** | Not supported | Full-text search across message content |
| **Streaming** | Full response returned at once | Token streaming via SSE for faster perceived responses |

### Accepted limitations

- **Dashboard layout vs embedded widget** — The two-panel desktop layout is more app-like than a small widget. Mobile responsiveness (hamburger overlay sidebar) bridges this gap partially. A true embeddable widget would require an iframe or separate build.
- **No real-time / WebSocket** — The user must send a message to get a reply. No push notifications, no server-sent events. Acceptable for a support chat but not for real-time collaboration.
- **SQLite concurrency** — Prisma + SQLite serializes writes. Fine for single-user or low-traffic demos, but would bottleneck under load. PostgreSQL would be the production choice.
- **Title generation latency** — The first message in a new conversation incurs an extra ~200–500ms OpenAI call for title generation. Acceptable because it's one-time per conversation.

---

For a deeper dive into every layer, component, data flow, and decision, see [ARCHITECTURE.md](./ARCHITECTURE.md).
