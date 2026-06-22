# Channels

Each **channel** is an entry point that connects an external platform to the shared ChatService.

```
                     ┌──────────────────┐
  ┌──────────────┐   │  channel adapter │   ┌──────────────┐
  │ Live Chat   │──▶│  parse request   │──▶│              │
  │ (HTTP/JSON) │   │  → normalize     │   │  ChatService │
  └──────────────┘   │  → call service  │   │              │
                     │  → format reply  │   │  handle()    │
  ┌──────────────┐   │                  │   │  → reply     │
  │ WhatsApp    │──▶│  (future)        │──▶│              │
  │ (Webhook)   │   │                  │   └──────┬───────┘
  └──────────────┘   └──────────────────┘          │
                                                   │
  ┌──────────────┐                          ┌──────▼───────┐
  │ Instagram   │                          │  Services    │
  │ (Webhook)   │                          │  + Repos     │
  └──────────────┘                          └──────────────┘
```

## How to add a channel

Create a new folder under `channels/` (e.g. `channels/whatsapp/`) with:

```
channels/whatsapp/
├── whatsapp.channel.ts    ← adapter: parse, auth, call ChatService, send reply
└── routes.ts              ← Express webhook receiver (if HTTP-based)
```

The adapter is responsible for:

| Concern | Example |
|---|---|
| Entry point | Express route, message queue consumer, etc. |
| Auth / verification | WhatsApp signature, Instagram app secret, etc. |
| Payload parsing | Convert platform-specific format to `{ message, channelUserId }` |
| Session mapping | Map `{ channel, channelUserId }` to an internal conversation ID |
| Calling the service | `chatService.handleMessage(text, sessionId)` |
| Replying | Format the response for the platform and send it via their API |

## Current channels

| Channel | Adapter | Protocol |
|---|---|---|
| Web (browser) | `web/web.channel.ts` | HTTP/JSON on Express Router |
