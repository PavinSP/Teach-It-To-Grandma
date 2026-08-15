# Teach It To Grandma

A voice app that tests whether you actually understand something, using the Feynman technique: explain a concept out loud to an AI "Grandma" persona who catches jargon, logic gaps, and vagueness instead of teaching it back to you.

Say a topic, any topic. Grandma listens by voice, asks follow-up questions, and occasionally states something confidently wrong to see if you catch it. At the end, a grading layer judges whether each point was genuinely explained, not just keyword-matched, and produces a score you can compare against other people teaching the same topic ("Teach-Off" mode).

## How it works

1. **Conversation** — the frontend opens a live voice session with an ElevenLabs Conversational AI agent (Gemini-backed persona, "Grandma"). She responds in character, asks questions, and occasionally plants a deliberately wrong claim to test whether the student corrects her.
2. **Live progress** — a lightweight in-browser keyword/context check tracks a per-topic checklist in real time so the session has instant feedback, independent of the network round-trip to the grading server.
3. **Finish lesson** — the full transcript is sent to a small Express server, which asks Claude 4.5 Sonnet (via an OpenAI-compatible client) whether each checklist point was *actually explained*, not just name-dropped. This never blocks the recap: if the grading call fails or is slow, the recap still renders using the live keyword grading as a fallback.
4. **Recap** — shows the AI's per-point verdict and reasoning, self-correction bonuses, whether the student caught Grandma's planted mistake, and a Teach-Off leaderboard comparing scores on the same topic.

## Stack

- **Frontend**: React + Vite, `@elevenlabs/react` for the voice session
- **Grading server**: Express, `openai` SDK pointed at an OpenAI-compatible Claude endpoint, model `claude-4.5-sonnet`
- **Persistence**: Upstash Redis (Teach-Off codes/leaderboard persist across restarts)

Two other models were evaluated for grading and rejected: a faster Claude model let a vague answer pass 3 of 4 checks, and a smaller GPT model passed it 4 of 4. A grader that rubber-stamps jargon defeats the point of the app, so the slower, stricter model was kept.

## Running locally

```bash
# terminal 1 — grading server
cd server
npm install
npm run dev        # http://localhost:3001

# terminal 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The grading server reads `ANTHROPIC_API_KEY` from a project-root `.env` (gitignored, never put it in the frontend). To point the frontend at a deployed server instead of localhost, set `VITE_GRADING_API` in `frontend/.env.local`.

Run `./smoke-test.sh` before a live demo to sanity-check both processes are up and the grading endpoint responds.

## Status

Actively in development for an upcoming hackathon demo.
