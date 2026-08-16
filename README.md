# Teach It To Grandma

🏆 **Winner of the ElevenLabs Sonderpreis for Best Project Built With
ElevenLabs**, awarded 3 months of ElevenLabs Scale — Student Hackathon 2026,
Titanom Solutions × DeutschlandGPT, Germering.

Every AI teaches you something. This one makes you teach it.

Name any topic, pick who you are explaining it to, and talk out loud. At the end
they tell you whether they actually understood — and the gap between sounding
right and being understood is the entire point.

**Live:** https://titanom-hackathon-8xts.vercel.app

> ⚠️ The hackathon's own API key has since been archived by the provider, so the
> deployed demo cannot generate lessons on its own. It now asks a visitor to
> paste their own TitanomGPT key, which stays in that browser tab and is never
> stored server-side. See [Bring your own key](#bring-your-own-key).

---

## The argument

Fluency is not understanding. You can read a paper, nod along, pass the exam,
and still not be able to make another person see it.

So the listener is the measurement. Six of them, each with a different voice and
a different way of failing to follow you:

| Character | How they listen |
|---|---|
| **Grandma** | Stops you the moment you use a word she does not know |
| **Curious Child** | Asks *why* until you run out of answers |
| **Student** | Knows the words, not the how |
| **Manager** | Cuts you off if you sound too academic |
| **Expert** | Knows the field next door, so analogies have to survive scrutiny |
| **Professor** | Quotes your own sentence back when you contradict yourself |

The same explanation lands differently for each. **That gap is the result.**

## How it works

1. **Lesson generation.** A topic becomes four things worth covering, the
   misconceptions people actually hold, and a prediction of which points will
   trip you up — written before you say a word, so the recap can say where it
   was right and where you beat it.

2. **The conversation.** A live ElevenLabs voice session with the chosen
   character. They interrupt, ask, and occasionally state something confidently
   wrong to see whether you catch it.

3. **Live signals.** Coverage, jargon and mood update from the transcript as you
   speak, computed in-browser so nothing waits on the network.

4. **Grading.** The transcript goes to the server, which judges whether each
   point was *genuinely explained* rather than name-dropped. The recap never
   blocks on it: if grading is slow or fails, the keyword pass still renders.

5. **The recap.** A Feynman score computed from booleans (never asked from a
   model), what the listener took away in their own words, the moments that
   decided the lesson, delivery analysis, and a four-juror panel that scores the
   same explanation by four different standards.

## Side modes

**Teach-Off** — several people teach the *same stored lesson* and land on one
board. Codes are shareable across devices, backed by Upstash Redis.

**Two-player quiz** — deliberately a *different* measurement, and deliberately
not the headline: fifteen generated questions, both players hear each one read
aloud and race to tap. Scores are hidden until the end, because being told the
answer immediately teaches nothing.

The quiz is worth reading for the timing model. Nothing runs a timer — a
serverless function exists for the length of a request, so the game's position
is **derived** from two timestamps and the clock, recomputed identically on
every request. Two devices agree because they are reading the same arithmetic,
not because messages arrived on time.

## Stack

- **Frontend** — React + Vite, `@elevenlabs/react` for the voice session
- **Server** — Express, `openai` SDK against DeutschlandGPT's OpenAI-compatible
  endpoint (`api.deutschlandgpt.de/v2`)
- **Voice** — ElevenLabs Conversational AI for the characters, and
  `eleven_flash_v2_5` TTS for the quiz's pre-generated question audio
- **State** — Upstash Redis in production, a JSON file locally

### Model choice

`gemini-3.1-flash-lite` does the graded work, chosen by measurement rather than
reputation: it scores a jargon-stuffed answer 1/4 and a genuinely good one 4/4,
four runs each, at ~1.7s. Two faster models were rejected outright —
`claude-4.5-haiku` passed the vague answer 3/4 and `gpt-5.4-mini` passed it 4/4.
**A grader that rubber-stamps jargon destroys the one thing this product
claims.** Judgement-heavy work stays on `claude-4.5-sonnet`.

## Running locally

```bash
# terminal 1 — API
cd server
npm install
npm run dev        # http://localhost:3001

# terminal 2 — frontend
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Create a project-root `.env` (gitignored):

```bash
TITANOM_API_KEY=sk_...      # DeutschlandGPT — lessons, grading, quiz questions
ELEVENLABS_API_KEY=sk_...   # voice + quiz audio
```

`./smoke-test.sh` checks both processes and the grading endpoint before a demo.

Locally the app runs on a JSON file rather than Redis. That is dev-only: a
deployed build **refuses to boot** without Redis rather than half-working, since
a file-backed board succeeds only when two requests happen to hit the same warm
instance. Check `/health` — it reports which store is live.

## Bring your own key

A visitor can supply their own TitanomGPT key when the deploy's key is dead. The
rules that make that reasonable to ask are all about not keeping it: the key
rides one request header, builds a client for the life of that call, and is
never logged, never persisted, never echoed back, and never cached — a cache
keyed on a secret is a store of secrets. In the browser it lives in
`sessionStorage`, so it dies with the tab.

## Deploying

Two Vercel projects from this one repo, so each half gets zero-config detection
— Vite on one side, Express on the other, no `vercel.json`.

| Project | Root Directory | Environment |
|---|---|---|
| Frontend | `frontend` | `VITE_GRADING_API` |
| API | `server` | `TITANOM_API_KEY`, `ELEVENLABS_API_KEY`, `ALLOWED_ORIGIN`, Upstash |

Full walkthrough, including the CORS loop and how to roll back mid-demo, is in
[DEPLOY.md](DEPLOY.md).

## Feature flags

Everything beyond the core loop sits behind a flag in `frontend/src/features.js`,
switchable from the URL without touching code:

```
?off=aiJury                    turn one feature off
?off=aiJury,achievements       turn several off
?safe                          turn everything optional off
```

The core loop is deliberately unflagged. It is the demo; if it breaks, flags
will not save it.

## Accessibility and themes

Light and dark, user-selectable, with light as the default so a first-time
visitor sees what was designed. Every colour resolves through a token — there
are no colour literals left in the component stylesheets — and both themes are
verified by a contrast audit across the landing page, the teaching flow and
every quiz screen.

## Built at

Student Hackathon 2026, Titanom Solutions, Germering — 14–15 August 2026.
Team **Epoch One**: [Pavin Sumathi Palanichamy](https://github.com/PavinSP) and
Prethebha Muthukumaran. Roughly 30 hours.
