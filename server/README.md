# Grading server

Small Express server that asks Claude whether the student genuinely explained
each learning point, rather than just saying the right keywords.

The frontend calls this on **Finish lesson**. If the server is down or slow, the
recap still renders using the existing keyword grading — the AI result only
enriches it.

## Setup

The Anthropic API key is read from `titanom-hack-2026/.env` (one level up):

```
ANTHROPIC_API_KEY=sk-ant-...
```

That file is gitignored. Never put the key in the frontend.

## Running

Two processes are needed during development:

```bash
# terminal 1 — grading server
cd server
npm install
npm run dev        # http://localhost:3001

# terminal 2 — frontend
cd frontend
npm run dev        # http://localhost:5173
```

To point the frontend at a deployed server instead of localhost, set
`VITE_GRADING_API` in `frontend/.env.local`.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /api/grade` → `{ topicName, points[], transcript[] }`, returns
  `{ results: [{ point, understood, reason }], summary }`
