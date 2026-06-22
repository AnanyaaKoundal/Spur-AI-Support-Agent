# Spur AI Support

An AI-powered customer support application built for an e-commerce store. The project combines a SvelteKit frontend, an Express backend, PostgreSQL, Prisma, and OpenAI to provide conversational support while maintaining a clean and extensible architecture.

## Contents

| Section | Description |
|----------|-------------|
| [Project Objective](#project-objective) | Assignment goals and success criteria |
| [Solution Overview](#solution-overview) | Summary of the implemented solution |
| [Architecture Rationale](#architecture-rationale) | Architectural approach and system organization |
| [Key Features](#key-features) | Core capabilities delivered by the application |
| [User Interface Approach](#user-interface-approach) | UI design choices and user experience rationale |
| [Architecture Overview](#architecture-overview) | High-level system architecture and layers |
| [Design Decisions](#design-decisions) | Notable engineering and implementation decisions |
| [Technology Stack](#technology-stack) | Frameworks, libraries, and services used |
| [Project Structure](#project-structure) | Repository layout and code organization |
| [Getting Started](#getting-started) | Local development and setup instructions |
| [Environment Variables](#environment-variables) | Configuration required to run the application |
| [API Endpoints](#api-endpoints) | Available backend routes and operations |
| [Testing](#testing) | Test coverage and validation strategy |
| [Deployment](#deployment) | Hosting architecture and deployment setup |
| [Key Trade-offs](#key-trade-offs) | Engineering trade-offs and implementation compromises |
| [Future Improvements](#future-improvements) | Potential enhancements and next steps |
| [Architecture Deep Dive](#architecture-deep-dive) | Detailed technical documentation and internals |

---

## Project Objective

The goal of this project was to build a customer support application capable of:

* Answering store-related customer questions using AI
* Using store-specific knowledge instead of generic responses
* Persisting conversation history
* Providing a responsive chat experience
* Demonstrating clean architecture and maintainable code
* Supporting future expansion to additional communication channels

---

## Solution Overview

The application allows users to create and revisit conversations with an AI support agent representing Spur Shop, a fictional Indian e-commerce business.

Store policies are stored in the database and injected into the AI system prompt, allowing responses to remain aligned with business rules such as shipping, returns, refunds, payments, and support hours.

Conversations are persisted in PostgreSQL and can be reopened from the sidebar, allowing users to continue previous discussions without losing context.

The backend is organized using a channel-based architecture so that additional platforms such as WhatsApp or Instagram can be added without restructuring existing functionality.

---

## Architecture Rationale

The application was intentionally designed as two independently deployable services:

* SvelteKit frontend
* Express backend

This separation keeps user interface concerns isolated from AI and data access logic, allows independent deployment, and closely mirrors how production systems are typically structured.

Within the backend, responsibilities are separated into channels, validation, services, repositories, and persistence layers. This approach keeps the codebase maintainable, reduces coupling between components, and simplifies future expansion.

Store policies are treated as business data rather than application code. This allows support content to evolve without requiring prompt changes or application redeployment. This allows business knowledge to evolve without requiring code changes.

---

## Key Features

### AI Customer Support

* OpenAI-powered responses using GPT-4o Mini
* Store-specific knowledge injected from database policies
* Context-aware conversations using message history
* Automatic conversation title generation
* Friendly handling of AI service failures and timeouts

### Conversation Management

* Multiple conversation support
* Conversation history persistence
* Deep linking through URL parameters
* Automatically generated conversation titles
* Reload and continue existing conversations

### User Experience

* Responsive interface for desktop and mobile devices
* Optimistic message updates
* Typing indicator during AI response generation
* Copy-to-clipboard support for messages
* Scroll-to-latest shortcut
* Suggested questions for new users

### Reliability

* Input validation using Zod
* Centralized error handling
* API rate limiting
* PostgreSQL persistence
* Policy caching to reduce unnecessary database reads

---

## User Interface Approach

Customer support systems commonly appear either as embedded chat widgets or as dedicated support workspaces.

For this project, I chose a conversation-oriented layout inspired by modern AI assistants. This approach provides:

* Clear visibility into conversation history
* Faster navigation between previous interactions
* Better support for multi-conversation workflows
* A familiar experience for users already accustomed to AI chat products

On mobile devices, the layout adapts into a more compact experience through an overlay sidebar and responsive design patterns, creating an experience closer to a traditional support widget.

---

## Architecture Overview

```text
┌─────────────┐
│  SvelteKit  │
│  Frontend   │
└──────┬──────┘
       │ REST
       ▼
┌─────────────┐
│   Express   │
│   Backend   │
└──────┬──────┘
       │ Prisma
       ▼
┌─────────────┐
│ PostgreSQL  │
│    Neon     │
└─────────────┘
```

Frontend and backend are deployed independently and communicate through REST APIs.

The backend follows a layered architecture:

```text
Channels
   │
Validators
   │
Services
   │
Repositories
   │
Prisma
   │
PostgreSQL
```

A dedicated channel layer was introduced to make future platform integrations straightforward.

Additional implementation details can be found in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Design Decisions

| Decision                                                        | Why it was implemented                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Channel adapter architecture**                                | The backend is organized around channels instead of being tightly coupled to HTTP routes. The current implementation exposes a Web channel, but the same service layer can later support WhatsApp, Instagram, or other communication platforms without significant restructuring.                              |
| **Store policies stored in the database with caching**          | Support knowledge is treated as business data rather than source code. Policies can be updated without modifying prompts or redeploying the application. A 5-minute in-memory cache avoids unnecessary database reads while keeping policy updates reasonably fresh.                                           |
| **Dynamic prompt generation from policies**                     | The AI does not rely on hardcoded business information. Each request builds a system prompt from the latest policies stored in the database, ensuring responses stay aligned with current store rules and procedures.                                                                                          |
| **Strict support-only AI scope**                                | Customer support assistants should remain focused on store-related queries. Explicit prompt restrictions prevent the model from acting as a programming tutor, medical advisor, financial consultant, or general-purpose chatbot.                                                                              |
| **Conversation-centric interface instead of a floating widget** | The assignment could have been implemented as a small embedded support widget. A dedicated chat workspace provides better visibility into conversation history, easier navigation between discussions, and a stronger foundation for future features.                                                          |
| **Automatic conversation title generation**                     | Conversations become difficult to identify when every entry has the same name. A short AI-generated title is created from the first user message, making previous discussions easier to locate and revisit. Title generation is isolated from reply generation so failures never affect the primary chat flow. |
| **Conversation created only after the first message**           | Empty conversations are never persisted. This keeps the database and sidebar clean while ensuring every stored conversation contains meaningful user activity.                                                                                                                                                 |
| **LLM service never throws application-level errors**           | AI providers can fail because of rate limits, timeouts, quota issues, or service interruptions. The LLM layer converts these failures into user-friendly responses so chat processing remains predictable and conversation data remains consistent.                                                            |
| **Bounded AI context window**                                   | Only the most recent conversation history is sent to the model. Limiting context to the latest messages and enforcing a response token limit keeps latency, token usage, and operational costs predictable while preserving sufficient conversational context.                                                 |
| **Optimistic UI updates**                                       | User messages appear immediately before the server responds. Temporary message and conversation identifiers allow the interface to feel responsive while background requests complete.                                                                                                                         |
| **Inline error recovery**                                       | Failed messages remain visible inside the conversation rather than disappearing. Users can retry directly from the failed message without retyping content or losing context.                                                                                                                                  |
| **Rate limiting focused on AI-generating endpoints**            | Read operations are inexpensive, while message generation invokes OpenAI and incurs cost. Rate limiting is therefore applied only to endpoints that generate AI responses.                                                                                                                                     |
| **Server-driven retry countdown**                               | The backend exposes the `Retry-After` header and the frontend uses that value to display an accurate cooldown timer. This keeps retry behavior synchronized with the actual server rate-limit window.                                                                                                          |
| **URL-synchronized conversation state**                         | The active conversation is reflected in the URL, allowing refreshes, bookmarking, browser navigation, and direct links to preserve context without additional client-side persistence mechanisms.                                                                                                              |
| **Responsive sidebar overlay for mobile devices**               | The desktop two-panel layout is optimized for larger screens. On mobile devices, the sidebar becomes an overlay to preserve screen space while maintaining access to conversation history.                                                                                                                     |
| **Controlled auto-scroll behavior**                             | New messages automatically scroll into view only when the user is already near the bottom of the conversation. Users reading older messages are not forced back to the latest response, while a dedicated "Scroll to End" shortcut provides quick navigation when needed.                                      |
| **Separate frontend and backend applications**                  | The frontend and backend are developed and deployed independently. This mirrors common production architectures and allows each application to scale, evolve, and be hosted separately.                                                                                                                        |
| **PostgreSQL over SQLite for deployment**                       | SQLite was sufficient during early development, but production deployments often run on ephemeral filesystems. PostgreSQL provides persistent storage, better operational reliability, and a clearer path for future scaling.                                                                                  |
| **Repository layer over Prisma**                                | Database access is isolated behind repositories rather than scattered throughout the application. This keeps business logic independent from persistence details and simplifies future database changes.                                                                                                       |


---

## Technology Stack

### Frontend

* SvelteKit
* TypeScript
* Tailwind CSS

### Backend

* Node.js
* Express
* TypeScript
* Zod

### Database

* PostgreSQL
* Prisma ORM
* Neon

### AI

* OpenAI GPT-4o Mini

---

## Project Structure

```text
project-root/
├── client/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   ├── components/
│   │   │   └── types/
│   │   └── routes/
│   └── package.json
│
├── server/
│   ├── prisma/
│   ├── src/
│   │   ├── channels/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── validators/
│   └── package.json
│
├── README.md
└── ARCHITECTURE.md
```

A detailed breakdown of the architecture, data flow, services, repositories, state management, caching strategy, and implementation decisions can be found in **ARCHITECTURE.md**.

---

## Getting Started

### Backend

```bash
cd server
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

Seed store policies:

```bash
npm run seed
```

Start the server:

```bash
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

---

## Environment Variables

### Backend

Create `server/.env`

```env
PORT=<server-port>
DATABASE_URL=<postgresql-connection-string>
OPENAI_API_KEY=<openai-api-key>
FRONTEND_URL=<frontend-origin>
```

### Frontend

Create `client/.env`

```env
PUBLIC_API_URL=<backend-url>
```

---

## API Endpoints

| Method | Endpoint                         | Description                       |
| ------ | -------------------------------- | --------------------------------- |
| GET    | /health                          | Health check                      |
| POST   | /chat/message                    | Send message and receive AI reply |
| GET    | /chat/conversations              | List conversations                |
| GET    | /chat/conversations/:id/messages | Get conversation messages         |

---

## Testing

The backend includes automated tests covering:

* Request validation
* Conversation creation and retrieval
* Conversation title generation
* LLM error handling and fallback behavior
* API endpoint behavior
* Rate limiting
* Service layer workflows

The test suite currently contains approximately twenty tests built using Vitest and Supertest.

---

## Deployment

| Component | Platform        |
| --------- | --------------- |
| Frontend  | Vercel          |
| Backend   | Render          |
| Database  | Neon PostgreSQL |

The frontend, backend, and database are deployed independently. This allows each layer to be updated, scaled, and maintained without impacting the others.

---

## Key Trade Offs

| Trade-off                        | Benefit                        | Cost                                            |
| -------------------------------- | ------------------------------ | ----------------------------------------------- |
| AI-generated conversation titles | Easier navigation              | Additional LLM request on new conversations     |
| 5-minute policy cache            | Reduced DB load                | Policy updates are not immediately visible      |
| Bounded context window           | Predictable cost and latency   | Older conversation context eventually drops out |
| Dedicated chat workspace         | Better conversation management | Less compact than embedded widget               |
| Fixed page limits                | Simpler implementation         | Less scalable than cursor pagination            |

---


## Future Improvements

Given additional time, the following areas would provide the highest impact:

### AI Experience

* Streaming AI responses to reduce perceived latency and improve responsiveness.
* Retrieval-Augmented Generation (RAG) for larger and more dynamic knowledge bases instead of relying solely on prompt-injected policies.
* Conversation summarization for long-running chats to preserve context while controlling token usage.

### User Experience

* Authentication and user accounts to support personalized conversation history across devices.
* Conversation search and filtering for quicker access to previous interactions.
* Conversation deletion and archival capabilities.

### Operations and Administration

* Policy administration interface for non-technical staff to manage support content without database access.
* Structured logging and monitoring for improved observability and troubleshooting.
* Analytics dashboard for tracking common customer questions and support trends.

### Scalability

* Cursor-based pagination for conversations and messages.
* Background job processing for non-critical AI tasks such as title generation.
* Additional caching layers for frequently accessed data.

### Multi-Channel Support

* WhatsApp integration.
* Instagram integration.
* Shared conversation handling across channels through the existing channel architecture.

---

## Architecture Deep Dive

This README focuses on the project overview and design rationale.

For implementation details, service responsibilities, data flow diagrams, state management decisions, caching strategy, error handling, testing approach, and architectural trade-offs, see:

See: [ARCHITECTURE.md](ARCHITECTURE.md)
