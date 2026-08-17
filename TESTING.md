# Testing

How to run the app, where to look when something misbehaves, and the checks
every new feature has to pass before it counts as done.

---

## Starting up

Two processes, two terminals. Both must be running.

```bash
# terminal 1 — grading + lesson server
cd server
npm run dev            # http://localhost:3001

# terminal 2 — the app
cd frontend
npm run dev            # http://localhost:5173 (or 5174 if 5173 is taken)
```

Vite prints the actual URL it chose. Read it rather than assuming — it moves
to 5174 when 5173 is occupied, which has caught us out before.

Confirm both are alive before touching the UI:

```bash
curl -s http://localhost:3001/health          # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

If lessons come back as a 503 asking for a key, that is the API key — the
server now boots without one on purpose and warns `No AI_API_KEY set`, so
every screen that needs no model still works. The key lives in the project-root `.env`,
not in `server/`.

---

## Where to look when something breaks

| Symptom | Where to look |
|---|---|
| Grandma won't connect, no voice | Browser console — ElevenLabs errors surface there |
| Recap shows keyword results, no AI verdict | Server terminal — a failed grade logs `Grading failed:` with the status |
| Topic rejected or lesson won't build | Server terminal — `Lesson generation failed:` |
| Blank white page | Browser console — almost always a JS error, usually a missing import or a variable used before it's defined |
| Progress bar never moves | Not necessarily broken — it is keyword coverage. Check the generated keywords: `curl` the lesson endpoint and read them |
| Everything looks stale | Hard reload (Cmd-Shift-R). Vite hot-reload occasionally holds an old module |

The server logs every failure with its cause. When something is wrong on the
AI side, that terminal tells you more than the browser does.

---

## The smoke test

Run this after **every** feature, before moving on. It is the demo path — if
any step fails, stop and fix it rather than building the next thing.

1. Load the app. The topic field is focused and empty.
2. Type `backpropagation`, press **Teach it →**. Within a few seconds the
   lesson page appears with four points and a difficulty tag.
3. Press the microphone. Grandma greets you **by topic name**.
4. Say two or three sentences. Your words appear in the transcript, and it
   scrolls itself.
5. Some checklist points tick. (Not all — that's fine, it's coverage.)
6. Press **Finish lesson**. The recap appears immediately.
7. A moment later the AI verdict fills in: a summary in Grandma's voice, and a
   per-point ✓/○ list with reasons.
8. Press **Teach something else**. You are back at an empty topic field with
   no leftover transcript, progress, or notes.

Eight steps, about ninety seconds. If you only have time for one check, this
is the one.

---

## Testing a backend change

Hit the endpoint directly before touching the UI — it isolates the failure and
is far faster than clicking through.

```bash
# generate a lesson
curl -s -X POST http://localhost:3001/api/lesson \
  -H "Content-Type: application/json" \
  -d '{"topic":"gradient descent"}' | python3 -m json.tool

# a nonsense topic should be REJECTED with a reason, not crash
curl -s -X POST http://localhost:3001/api/lesson \
  -H "Content-Type: application/json" \
  -d '{"topic":"asdfgh qwerty"}' | python3 -m json.tool

# grade a deliberately vague explanation
curl -s -X POST http://localhost:3001/api/grade \
  -H "Content-Type: application/json" \
  -d '{
    "topicName":"Neural Networks",
    "points":["Inputs are provided","Information passes through layers","Weights influence the output","The model learns by adjusting weights"],
    "transcript":[{"source":"user","message":"A neural network takes inputs and the data passes through layers. Each connection has weights that influence things. Then it learns by adjusting the weights during training."}]
  }' | python3 -m json.tool
```

What good looks like: the lesson has four points with keywords and a
`required` count no higher than the number of keywords; the nonsense topic
comes back `422` with a readable reason; the vague explanation scores **low**
on the AI grade despite containing every keyword. That last one is the whole
product thesis — if a jargon-stuffed answer starts scoring well, the grading
prompt has drifted and needs looking at.

---

## Turning a feature off mid-demo

Every optional feature sits behind a flag in `frontend/src/features.js`. You
never have to revert code while presenting:

```
?off=misconceptionAttack        one feature off
?off=xp,achievements            several off
?safe                           everything optional off, core loop only
```

Type `features()` in the browser console to see what is currently on.

## Starting over

```
?reset          clear the lesson — transcript, grades, boards, the game.
                Your name, face, XP and badges survive.
?reset=all      clear everything, including who you are and what you earned.
```

This runs before the app mounts, so it works even when the app renders
blank — which is exactly when you need it. Other parameters survive, so
`?reset&on=misconceptionAmbush` clears the lesson and keeps the ambush armed.

If the app is broken badly enough that flags don't help, fall back to the last
known-good commit:

```bash
git stash                       # keep whatever you were mid-way through
git checkout demo-safe          # the tagged working state
cd frontend && npm run dev
```

`demo-safe` is a tag that gets moved forward only after a feature has passed
the smoke test. It is always safe to land on.

---

## What every new feature must pass

Before a feature counts as done:

- [ ] `cd frontend && npm run build` — no errors
- [ ] Its own failure case has been tried, not just the happy path
- [ ] The **smoke test** above still passes end to end
- [ ] Its flag turns it off cleanly — with `?off=<flag>` the app behaves as it
      did before the feature existed
- [ ] `git commit`, then move the tag: `git tag -f demo-safe`

The fourth one matters most. A feature that can't be switched off is a feature
that can take the demo down with it.
