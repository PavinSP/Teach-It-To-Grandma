# API server

Express server behind the teaching flow and the quiz. It judges whether the
student genuinely explained each learning point, rather than just saying the
right keywords.

The frontend calls this on **Finish lesson**. If the server is down or slow, the
recap still renders using the existing keyword grading — the graded result only
enriches it.

## Setup

Keys are read from `titanom-hack-2026/.env` (one level up):

```bash
AI_API_KEY=...              # any OpenAI-compatible provider
AI_BASE_URL=https://api.openai.com/v1
FAST_MODEL=gpt-4o-mini     # the graded work
DEEP_MODEL=gpt-4o          # jury, closed-world recall
ELEVENLABS_API_KEY=sk_...  # voice + quiz question audio
```

That file is gitignored. Never put a key in the frontend.

Nothing here is tied to one provider: the base URL is a variable, so OpenAI,
Google Gemini, Anthropic, OpenRouter, Groq, DeutschlandGPT and a local Ollama
all work. The base URLs are tabulated in the
[root README](../README.md#running-it-locally).

Set the URL and the model names **together**. A base URL from one provider
beside a model name from another authenticates fine and then fails on the first
request, which reads as a broken key rather than a configuration mistake.

`TITANOM_API_KEY` is still read as a fallback for `AI_API_KEY`, so a deployment
predating the provider migration keeps working.

Optional:

| Variable | Default |
|---|---|
| `ELEVENLABS_VOICE_ID` | George, a slow warm narrator |
| `ALLOWED_ORIGIN` | the dev origins; comma-separate for more |
| `PORT` | `3001` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | absent, so a JSON file is used |

## Running

```bash
npm install
npm run dev          # http://localhost:3001, watches for changes
```

Other entry points:

| Command | Runs on |
|---|---|
| `npm run dev:local` | Ollama — `qwen2.5:7b` grading, `qwen2.5:14b` judgement |
| `npm run dev:local:small` | Ollama — `qwen2.5:7b` for everything |
| `npm run dev:groq` | Groq `gpt-oss-120b`; still needs `AI_API_KEY` in `.env` |
| `npm start` | no file watching |

The frontend needs its own process — `cd ../frontend && npm run dev` — and
points here automatically in development. To aim it at a deployed server
instead, set `VITE_GRADING_API` in `frontend/.env.local`.

## Bring your own key

A caller may supply their own credentials on three headers, used for that one
request and never logged, stored or echoed back:

| Header | Purpose |
|---|---|
| `x-titanom-key` | the key |
| `x-ai-base-url` | which provider to send it to |
| `x-ai-model` | which model to ask for |

All three travel together or none do, for the same reason the environment
variables do.

## Endpoints

**Teaching flow**

- `GET /health` → `{ ok, store, allowedOrigins, originConfigured }`
- `POST /api/lesson` → a topic becomes points, keywords and misconceptions
- `POST /api/grade` → `{ topicName, points[], transcript[] }`, returns
  `{ results: [{ point, understood, reason }], summary, strongestMoment, … }`
- `POST /api/explainback` — what the listener took away, in their own words
- `POST /api/challenge` — a constraint to re-explain under
- `POST /api/jury` — four listeners, four standards
- `POST /api/mirror` — the listener retells it with planted errors
- `POST /api/face` — photo to avatar dials

**Teach-Off**

- `POST /api/teachoff` · `GET /api/teachoff/:code`
- `POST /api/teachoff/:code/runs` · `GET /api/teachoff/:code/runs`

**Quiz**

- `POST /api/quiz` → fifteen questions for a topic
- `POST /api/quiz/game` · `/:code/join` · `/:code/start` · `/:code/answer`
- `POST /api/quiz/:code/voice` → pre-generates question audio in batches
- `GET /api/quiz/:code` · `/:code/state` · `/:code/stream` (SSE) ·
  `/:code/audio/:index`

Every model-backed route returns **503** with `needsKey: true` when neither the
server nor the caller has a working key, which is a different problem from a
request that failed and is reported differently.

## Storage

Upstash Redis in production, a JSON file locally. A deployed build refuses to
boot without Redis rather than half-working — the note at the top of `store.js`
explains why at length.
