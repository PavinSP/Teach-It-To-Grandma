# API server

Express server behind the teaching flow and the quiz. It judges whether the
student genuinely explained each learning point, rather than just saying the
right keywords.

The frontend calls this on **Finish lesson**. If the server is down or slow, the
recap still renders using the existing keyword grading — the graded result only
enriches it.

## Setup

Keys are read from `titanom-hack-2026/.env` (one level up):

```
TITANOM_API_KEY=sk_...      # DeutschlandGPT — lessons, grading, quiz questions
ELEVENLABS_API_KEY=sk_...   # voice + quiz question audio
```

That file is gitignored. Never put a key in the frontend.

A caller may also bring their own key on an `x-titanom-key` header, which is
used for that one request and never logged, stored or echoed back.

## Running

Two processes are needed during development:

```bash
# terminal 1 — API
cd server
npm install
npm run dev        # http://localhost:3001

# terminal 2 — frontend
cd frontend
npm run dev        # http://localhost:5173
```

To point the frontend at a deployed server instead of localhost, set
`VITE_GRADING_API` in `frontend/.env.local`.

## Models

Requests go to DeutschlandGPT's OpenAI-compatible endpoint
(`api.deutschlandgpt.de/v2`). Graded work runs on `gemini-3.1-flash-lite`,
chosen by measurement: it scores a jargon-stuffed answer 1/4 and a good one 4/4
at ~1.7s, where two faster models passed the vague answer 3/4 and 4/4.
Judgement-heavy work — the jury, closed-world recall — uses `claude-4.5-sonnet`.

## Endpoints

**Teaching flow**

- `GET /health` → `{ ok, store, allowedOrigins }`
- `POST /api/lesson` → a topic becomes points, keywords and misconceptions
- `POST /api/grade` → `{ topicName, points[], transcript[] }`, returns
  `{ results: [{ point, understood, reason }], summary }`
- `POST /api/explainback` · `/api/challenge` · `/api/jury` · `/api/mirror` ·
  `/api/face`

**Teach-Off**

- `POST /api/teachoff` · `GET /api/teachoff/:code` · `POST|GET
  /api/teachoff/:code/runs`

**Quiz**

- `POST /api/quiz` → fifteen questions for a topic
- `POST /api/quiz/game` · `/:code/join` · `/:code/start` · `/:code/answer`
- `POST /api/quiz/:code/voice` → pre-generates question audio in batches
- `GET /api/quiz/:code/state` · `/:code/stream` (SSE) · `/:code/audio/:index`

## Storage

Upstash Redis in production, a JSON file locally. A deployed build refuses to
boot without Redis rather than half-working — see the note at the top of
`store.js` for why.
