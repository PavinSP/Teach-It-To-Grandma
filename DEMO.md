# The 3-Minute Demo

The argument in one line: **everyone's AI teaches you — ours makes you teach
it, and it can tell the difference between sounding right and being
understood.**

Every number in this script is one the system has actually produced in
testing. Nothing here is aspirational.

---

## Setup — 30 minutes before, not 3

1. Both processes up, then `./smoke-test.sh` → **5/5 or stop and fix.**
2. Open the app with the ambush armed:
   `http://localhost:5174/?on=misconceptionAmbush`
   (check the port Vite actually printed)
3. Quiet-room mic check: one full lesson, any topic, confirm her voice comes
   through the room's speakers at a volume the back row hears.
4. **Record the villain run.** Teach *Neural Networks* with the jargon
   script below, deliberately. Finish. On the recap, type
   `Pavin (jargon version)` and press **⚔️ Start a Teach-Off**.
   **Write the code down.** This run persists on disk — it survives
   restarts.
5. Reload to the landing page. Leave it there. That's your opening slide:
   six characters, an empty topic box.

### The villain run (read this badly on purpose, during setup)

> A neural network is like, a system of neurons with weighted connections
> and activation functions. The data propagates through the layers and
> then backpropagation computes the gradients. Each connection has weights
> that influence things. Then it learns by adjusting the weights during
> training with gradient descent.

Every keyword, zero understanding. Measured result: keyword bar fills,
AI grade 0/4, Feynman Score lands in the teens–30s, red band, *"Grandma is
still lost, darling."* That score sitting on the board is the trap the
whole demo springs.

---

## The 3 minutes

### 0:00 — Open on the landing page *(20 sec)*

> "Every AI product teaches you something. We built the opposite — an AI
> you have to teach. Six learners, any topic you can name. The catch:
> it can tell whether you actually understand, or just sound like you do.
> I'll prove it — this morning I taught it neural networks in confident
> jargon. It scored me 31. Let's see if I can beat myself."

*(Use your real villain score. Point at the character row while saying
"six learners" — don't click through them, it reads on its own.)*

### 0:20 — Join your own Teach-Off *(10 sec)*

Type the code and your name → **Join**. Same lesson loads instantly —
same points, same judge.

### 0:30 — Teach it properly, live *(≈70 sec)*

Press the mic. Grandma greets you by topic. Say, in your own pacing,
pausing so she can respond:

**Utterance 1:**
> A neural network is a program that learns patterns from examples
> instead of being given rules.

**Utterance 2:**
> Imagine a row of coffee filters. Water passes through each one and
> comes out a little different. That's the layers — information gets
> transformed step by step.

**Utterance 3** *(the deliberate self-correction — it earns XP and shows on
the recap with your exact words):*
> Each connection has a strength — actually, let me say that better: each
> connection has a dial, and turning it decides how much that path
> matters.

**Utterance 4:**
> Learning means checking how wrong a guess was, and nudging those dials
> so it's less wrong next time.

**Then press Shift+M.** Her next reply will be the trap — she'll
confidently claim something false, e.g. *"So it's basically a little
brain that thinks like we do, right?"*

**Catch her:**
> No — it doesn't think at all. It's just multiplication and addition
> arranged in layers. It doesn't know what anything means, it only
> adjusts numbers until its guesses get less wrong.

*(If she asks something instead of springing the trap: answer briefly —
the trap comes one reply late by design. Never say "hold on" to the AI on
stage; silence looks worse than a short answer.)*

### 1:40 — Finish lesson *(20 sec of talking over the grading)*

Press **Finish lesson**. The recap renders instantly, the grade fills in
behind you. While it loads:

> "Everything you just heard — the voice, the follow-ups, the trap she
> sprang on me — that's ElevenLabs conversational AI. The judging you're
> about to see is TitanomGPT. And it does not grade on keywords."

### 2:00 — The recap tells the story for you *(40 sec)*

Point at, in order — they're all on one screen:

1. **The score counting up** — green band, next to your villain run's red
   memory
2. **"+40 Caught your own mistake"** — with your exact dial sentence quoted
3. **"The trap Grandma set"** — ✓ You caught it, your correction quoted
4. **🧨 Myth Buster — NEW** lighting up in the badge strip
5. **The Teach-Off board** — jargon version: ~31. This run: on top. 🥇

> "Same lesson. Same judge. The jargon version filled every checkbox and
> scored thirty-one. The difference isn't what I said — it's what she
> could repeat back."

### 2:40 — Close *(20 sec)*

> "Any topic, six judges, a score you can't talk your way past. The next
> teacher just needs this code."

Leave the board on screen. If a judge wants a turn — that's the code
working. Hand them the mic and let them try to beat you.

---

## When something goes wrong on stage

| Symptom | Do this, don't debug |
|---|---|
| A feature misbehaves | `?off=<flagName>` in the URL, reload |
| Several act up | `?safe` — core loop only, still a full demo |
| Trap doesn't spring after Shift+M | Skip it — say "she usually fights back too" and finish; the villain-vs-live board still lands the thesis |
| Mic dead on the demo machine | The error now says why (padlock vs connection) — read it, it tells you the fix |
| A session gets wedged | Add `?reset` to the URL — clears the lesson, keeps your XP and badges |
| App won't render at all | Try `?reset` first (it runs before the app mounts). Still broken: `git checkout demo-safe`, restart Vite |
| Handing the laptop to someone else | `?reset=all` — clears identity and progress too |
| ElevenLabs itself is down | The recorded villain run + a finished recap in a second tab is your backup narrative — keep one open |

## What NOT to say

- Never "global leaderboard" — it's *this* Teach-Off, one machine, real runs
- Never claim she "understands" — the product's whole point is measuring that
  claim; say *"she could repeat it back"*
- Say "I recorded the jargon run this morning" plainly if asked — it's a
  real run, genuinely graded, just not performed live. That honesty is on
  brand.

## Dry-run checklist (do the full 3 minutes twice, out loud, timed)

- [ ] Villain run recorded, code written on paper, score noted
- [ ] Full run-through under 3:10 including the trap
- [ ] Shift+M sprung the trap within one reply, both rehearsals
- [ ] Recap showed: score, self-correction quote, trap card, Myth Buster
- [ ] Board showed both runs, live run on top
- [ ] Backup tab with a finished recap left open
