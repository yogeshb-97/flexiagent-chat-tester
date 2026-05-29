# Test App — FlexiAgent Chat Tester

## Project Purpose
Minimal chatbot UI to test whether FlexiAgent handles inbound messages correctly via webhook. Messages flow: Browser → Node/Express backend → FlexiAgent webhook → response rendered in chat UI.

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (no build step, no framework)
- **Backend**: Node.js + Express
- **History**: `memory.md` in project root (append-only log, human-readable)
- **Config**: `.env` file — `PORT`, `FLEXI_AGENT_WEBHOOK_URL`, `FLEXI_AGENT_API_KEY`

## File Map
```
/Test app/
├── CLAUDE.md           ← this file
├── memory.md           ← conversation history (auto-appended by server)
├── .env                ← secrets (not committed)
├── package.json
├── server.js           ← Express API + webhook proxy
└── public/
    ├── index.html      ← chat UI shell
    ├── style.css       ← WhatsApp/Telegram style
    └── app.js          ← frontend JS (fetch → /api/chat)
```

## API Contract
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve chat UI |
| POST | `/api/chat` | Receive `{message, sessionId}`, forward to FlexiAgent, return `{reply}` |
| GET | `/api/history` | Return full conversation log as JSON array |
| POST | `/webhook/incoming` | Receive push from FlexiAgent (if it calls back async) |

## Conversation History Format (memory.md)
Each turn is appended as:
```
## [2026-05-29 14:32:01] Session: abc123
**User:** Hello, what can you do?
**Agent:** I can help you with...
---
```

---

## Embedded Skills

### 🎨 Frontend Developer Mode
When working on `public/` files:
- Mobile-first, clean design. No libraries unless essential.
- Chat UI: messages list scrolls up, input pinned at bottom.
- User messages: right-aligned, accent color bubble.
- Bot messages: left-aligned, neutral bubble, avatar icon.
- Typing indicator (animated dots) while waiting for response.
- Auto-scroll to latest message.
- Enter to send, Shift+Enter for newline.
- Timestamps on every message (HH:MM format).
- Error state: red inline message if webhook fails.

### ⚙️ Backend Developer Mode
When working on `server.js`:
- Keep it simple: Express + built-in `fetch` (Node 18+), no extra HTTP clients.
- All errors return `{error: string}` with appropriate HTTP status.
- Log every request to console with timestamp.
- Forward to FlexiAgent: POST with `Content-Type: application/json`, include API key in `Authorization: Bearer` header.
- On FlexiAgent timeout (>15s): return 504 with `{error: "Agent timeout"}`.
- Write to `memory.md` AFTER getting the reply (not before), so partial sessions aren't logged.
- Session IDs: `crypto.randomUUID()` generated client-side, passed in every request.

## Dev Commands
```bash
npm install        # install deps
npm start          # node server.js (port from .env or 3000)
npm run dev        # nodemon server.js
```
