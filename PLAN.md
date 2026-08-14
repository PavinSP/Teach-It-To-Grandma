# Implementation Plan

Every feature from `ChatGPT-Change Claude Email Antigravity-20260814-1708.md`, one at a
time, each with what it costs, how to test it, and how to take it back out.

Testing mechanics live in [TESTING.md](TESTING.md). This file is what to build and in
what order.

---

## How we work through this

Say **"let's do #N"** and we:

1. Build it on `main`, behind its flag.
2. Run its own test from this file — including the failure case, so a pass is
   distinguishable from a coincidence.
3. Run the smoke test in TESTING.md. The demo path has to still work.
4. Commit it alone. One feature per commit, so `git revert <sha>` is one command.
5. Move the tag: `git tag -f demo-safe && git push -f origin demo-safe`.

If step 2 or 3 fails, the feature goes off at its flag and we decide whether to fix or
drop it. Nothing half-built stays on the demo path.

**Three layers of undo**, cheapest first:

| Problem | Fix | Cost |
|---|---|---|
| One feature misbehaving, mid-demo | `?off=featureName` in the URL | seconds, no rebuild |
| Everything optional is suspect | `?safe` | seconds |
| The build itself is broken | `git checkout demo-safe` | one command |

---

## Decisions to make before anything is built

Five agents planned this in parallel. Where they disagreed, the disagreement is real and
needs settling — silently picking one would bury a choice that matters.

### D1. The ElevenLabs system prompt is a shared, unversioned resource

Three separate feature areas want to edit the same text box on agent
`agent_4301m009ej3eew6sgp492ky9s4dj`: character personas, the director channel
(#11/#15/#16/#17), and the misconception instruction (#38b). It has no version history,
no diff, and no merge. Two people editing it in one evening will silently overwrite each
other and nobody will notice until a demo.

**Before touching it:** paste the current prompt into `elevenlabs-agent-prompt.md`,
commit it. That file is the only revert path that exists.

**Then:** treat it as append-only with named sections — `## PERSONA`,
`## DIRECTOR NOTES`, `## MISCONCEPTIONS` — and change one section per commit, mirroring
every dashboard edit back into that file in the same commit.

### D2. Prompt overrides may be silently ignored

`overrides.agent.prompt.prompt` requires per-field allowlisting in the agent's Security
settings. If it is off, the session still connects and the override is **dropped without
error** — so six characters all behave as Grandma and nothing anywhere reports a
problem.

Everything in the character block (#2, #3, #36) and the mode selector (#35) assumes this
works. **Verify it in the dashboard before planning around it.** The canary: give each
character a distinct `firstMessage`. You know within two seconds of the call starting
whether overrides applied, instead of guessing three exchanges in.

### D3. What "score" means — genuinely contested

Two proposals, and they don't agree:

- **A computed score.** Deterministic, client-side, from booleans that already exist:
  70% AI-judged understanding, 15% keyword coverage, 15% how little Grandma had to
  interrupt. Reproducible, and every input is a boolean an engineer can point at.
- **An LLM-emitted score.** Ask the model for 0–100 on six dimensions (accuracy,
  clarity, structure, simplicity, adaptability, coverage).

The objection to the second is that it is uncalibrated — the same transcript scored three
times returns 78, 85, 81, and "92% of what?" has no answer. The objection is sound.

**Recommendation:** the headline number is **computed**, never model-emitted. Where a
qualitative judgment genuinely helps (#21), use four named bands — Strong / Solid /
Developing / Needs work — not numbers. Show fractions with their denominators
(`3 of 4 points`) in preference to percentages everywhere.

This is a product decision, not a technical one. Worth deciding deliberately, because
half the game layer hangs off it.

### D4. Adaptive difficulty vs characters-as-difficulty

#16 escalates Grandma mid-lesson. #36 makes the *character* the difficulty setting. Ship
both naively and they compound — Grandma becomes the Professor by point three, and
neither feature means anything.

**Resolution:** #36 owns *knowledge level* (who you're explaining to). #16 owns
*persistence* only (how many follow-ups before she accepts an answer). Orthogonal, and
they compose.

### D5. Gamification can cost more than it earns

Session 8 of `context.md` records this team deliberately removing UI that claimed
understanding it hadn't measured. That restraint is the product's credibility.

Confetti over a vague 4/4 explanation hands a judge the exact counterexample the demo
exists to deliver — from inside your own UI. Two rules keep the game layer on-thesis:

1. Understanding XP comes from the AI grade, **never** the keyword bar. Coverage earns
   its own, visibly smaller award.
2. Celebration copy derives from the score. Under 40 it says *"Grandma is still lost,
   darling"* with the same prominence as a win.

---

## Things that are true and will bite you

Found by reading the SDK and the code, not assumed:

- **`sendUserMessage()` corrupts grading.** It lands in `messages` as `source:"user"`,
  and `/api/grade` concatenates every user line as "everything the student said". Any
  injected instruction gets graded as the student's own words. Use
  `sendContextualUpdate()` for stage directions; where `sendUserMessage` is genuinely
  needed, tag it `meta:"prompt"` and filter it out of every payload built from
  `messages`.
- **Contextual updates don't trigger a turn.** A directive lands on Grandma's *next*
  reply — after the student speaks again. No UI may promise "Grandma will now ask you X."
- **`/api/grade` never sees Grandma's turns** (`server/index.js:169`). So "did they
  improve when challenged" cannot currently be judged at all. A shared `toDialogue()`
  helper fixes it for every feature that needs the exchange.
- **`aiGrade.results` is model-ordered.** Zipping it against `selectedTopic.points` by
  index is a silent corruption bug. Match by point string with an index fallback.
- **`max_completion_tokens`, never `max_tokens`.** TitanomGPT ignores the latter
  silently. A truncated response is invalid JSON and surfaces as a 502.
- **`dynamicVariables` values must be strings** — no arrays. Join them.
- **A prompt referencing `{{var}}` that the client doesn't supply kills the session.**
  Deploy the variable first, verify, *then* edit the prompt. Never the reverse.
- **`/api/lesson` is non-deterministic.** Two people typing "Neural networks" get
  different checklists, so their scores aren't comparable. Any head-to-head must store
  one lesson and have the second player fetch it.
- **`getUserMedia` needs HTTPS or localhost.** A second laptop on `http://192.168.x.x`
  is denied the microphone. Multi-machine multiplayer needs a tunnel; same-machine
  sequential is the only reliable topology.
- **`mix-blend-mode: multiply` is on `.grandma-character`** — a leftover from the old
  JPEG. Any new coloured avatar will render muddy until that's scoped to the legacy
  image.

---

## Shared foundations

Built once, before the features that need them. Not demo-visible on their own.

| ID | What | Effort | Unblocks |
|---|---|---|---|
| **F1** | `toDialogue(transcript)` — format the exchange as `STUDENT:` / `GRANDMA:` lines, keeping the last N. Fixes the dropped-Grandma-turns bug. | S | #6, #7, #10, #38c |
| **F2** | `alignToPoints(points, results)` — match grade results to points by string, index fallback. | S | everything reading `aiGrade` |
| **F3** | Director channel — `## DIRECTOR NOTES` in the agent prompt plus `director.js` string builders. See D1. | M | #11, #12, #15, #16, #17, #39 |
| **F4** | `characters.js` — the `CHARACTERS` array and `buildPersonaPrompt()`, with a shared never-changes rules block. | M | #2, #3, #26, #28, #36, #46 |
| **F5** | `history.js` — localStorage session records + `aggregate()`. | M | #21, #23, #37, #49 |
| **F6** | `store.js` — server-side in-memory arrays mirrored to `server/data/runs.json`. Survives `node --watch` restarts. | M | #29, #31, #34 |
| **F7** | Session timing + `moments` on the grade — duration, plus model-detected jargon-simplification, self-correction, analogy use. | S | #25, #27 |

**F1, F2 and F7 are worth doing regardless** — they improve grading whether or not the
features that need them ship.

`features.js` already exists and is tested. Every flag below goes in that file's
`DEFAULTS`. Do not add a second flag module.

---

## 1. Core teaching experience — **done**

| # | Feature | Status |
|---|---|---|
| 1.1 | Teach any topic | **done** — free-text field, AI/ML suggestion chips |
| 1.2 | Dynamic lesson generation | **done** — `/api/lesson` returns points, keywords, difficulty, misconceptions |
| 1.3 | Dynamic checklist | **done** — progress panel built from generated points |
| 1.4 | Feynman technique | **done** — the premise, unchanged |

Also already done and not worth re-planning: **#41 Start another lesson**
(button exists; could be promoted to a primary CTA, 5 min), **#42 Session reset**
(both paths clear all seven session variables — needs one guard added once a persisted
profile exists), **#5.1 / #44 real-time voice** and **#5.2 DeutschlandGPT**.

---

## 2. The AI layer

### #5.3 Backend orchestration · S · flag: n/a
Shared `jsonCall()` helper replacing duplicated OpenAI-SDK boilerplate, plus F1.
**Risk:** it refactors two working endpoints — do it early or not at all.
**Test:** `/api/lesson` returns the identical key set as before; one full browser session
still reaches the recap.

### #6 AI-based evaluation · M · flag: `richEvaluation`
Six dimensions on the end-of-lesson grade, judged from the full dialogue.
**Depends on:** F1 (without it, adaptability is unjudgeable). **See D3** — if the headline
number is computed rather than model-emitted, this becomes evidence-per-dimension rather
than scores-per-dimension.
**Risk:** low. Runs after the mic is off; worst case the block is absent and the recap
renders as today.
**Test:** grade a transcript where the student uses jargon, gets pushed back on, then
recovers with a good analogy. Adaptability should be high, simplicity middling. If
adaptability comes back 50 with "cannot judge", F1 isn't wired — **this looks like a
pass at a glance.**
**Revert:** flag off. Keep F1.

### #7 Live AI progress · L · flag: `liveGrading`
Re-judge the points mid-conversation; sidebar becomes ✓ ◐ ○ with a fractional score.
**Depends on:** F1, #6's rubric.
**Risk: high, the highest in the plan.** Three ways to embarrass yourself: ticks going
backwards on stage when the model changes its mind (guard: `understood` is sticky,
sequence-number every response); out-of-order responses; and 15+ calls in a rambling
demo (guard: fire every 2 student turns, min 8s apart, cap 12).
Adds **zero** latency to the voice call — it's out-of-band from the WebRTC session. Do
not make Grandma wait for it.
**Test:** a transcript where the student explains point 1 well then says "then we do
backpropagation and gradient descent" — points 2–4 must **not** be credited for naming
the mechanism. If they are, the rubric is too lenient and the feature is a lie on stage.
The ◐ state is the demo moment; if you never see one, it's collapsing to binary.
**Revert:** `?off=liveGrading` — keyword bar returns instantly.

### #19 Multilingual · M · flag: `multilingual` (default **off**)
Language picker; Grandma speaks and listens in it; lesson and grading come back in it.
**Risk: high, and entirely outside the codebase.** Three dashboard prerequisites, each of
which fails *silently*: language overrides allowlisted; the language added to the agent's
ASR config; a multilingual TTS model on the voice. Ship `false` until a rehearsal proves
all three.
**Test:** `/api/lesson` with `language:"de"` must return German labels **and German
keywords**. German labels with English keywords looks like a pass in a screenshot and
silently breaks the coverage bar.
**Revert:** flag off — everything sends `en`, identical to today.

### #20 Topic difficulty analysis · S · flag: `topicAnalysis`
Concept density, prerequisites, recommended character, alongside the existing difficulty.
**Risk:** low, additive. Keep the existing top-level `difficulty` field — the session
header reads it.
**Test:** "Quantum entanglement" → Advanced/High; "How a bicycle stays upright" →
Beginner/Low. Identical results for both means the prompt isn't discriminating and the
card is decoration.

### #38 AI-generated misconceptions · M · flag: `misconceptionAttack`
Already generated and stored, never used. Three parts in ascending risk:
**(a)** render them in the sidebar — 5 minutes, zero risk;
**(b)** have Grandma voice one mid-conversation — needs a dynamic variable *then* a
prompt edit, in that order (see D1);
**(c)** detect whether the student corrected her — needs F1.
**Honest limitation:** the flag cannot gate (b). Once the agent prompt is edited, she
does this in every session for everyone. The only off-switch is reverting the dashboard.
**Test:** "Black holes" → misconceptions should be plainly false beginner beliefs, not
generic filler like "it's complicated".

### #39 AI-generated challenges · M · flag: `challengeCards`
Three topic-specific challenges generated with the lesson, handed to Grandma on click.
**Uses `sendContextualUpdate`.** Show "Challenge sent — Grandma will ask you next" on
click; that line converts the unavoidable one-beat delay from a bug into intent.
**Test:** challenges must name concepts from *this* lesson ("explain the learning rate
without the word 'step'"), not generic instructions. And the challenge text must **not**
appear in the transcript as a `YOU` message — if it does, someone used `sendUserMessage`.

### #45 Secure architecture · S (+M) · flag: `secureVoiceToken` for the last part
Verified good: the Titanom key is server-side only, `.env` is gitignored, and the `.env`
blob in git history is **0 bytes** — nothing leaked.
Remaining, in order: **CORS is wide open** (one line); **no rate limit on the endpoint
that spends money** (~15 lines, in-memory); **dead `ANTHROPIC_API_KEY` and unused
`@anthropic-ai/sdk`** still in the tree (delete — an unused key in a shared `.env` is a
leak waiting for a screen-share); and **the ElevenLabs agent is publicly reachable** —
the browser fetches a conversation token with no auth header, so anyone can lift the
agent id and spend your credits.
For that last one use `conversationToken`, **not** `signedUrl` — `signedUrl` forces the
WebSocket transport and the app is on WebRTC. Keep an unconditional `agentId` fallback.
**Test:** `grep -rE 'sk-|xi-api-key|TITANOM' dist/assets/*.js` returns nothing after a
build. Fire 35 lesson requests; expect 429s. Without the limiter that's 35 paid calls.

---

## 3. Characters

**#2, #3 and #36 are one feature.** #2 is the picker, #3 is the text in the array rows,
#36 is one more field on the same rows. Build `characters.js` once; all three land
together. Scheduling them separately triples the estimate.

### #2 + #3 + #36 Characters, personalities, difficulty · M · flag: `characterPicker`
Six learners — Grandma, Curious Child, Student, Manager, Expert, Professor. The choice
drives voice, system prompt, greeting, avatar **and grading strictness**.
**Mechanism:** one agent, persona via `overrides.agent.prompt.prompt`, voice via
`overrides.tts.voiceId`. Personas live in the repo as data — reviewable, revertable, no
re-publish to change one. **See D2.**
**#36 is what stops characters being cosmetic** — the character's `gradingStance` goes
into `/api/grade`, so the Expert genuinely marks harder. Without it, a sharp judge notices
the verdict doesn't change and you've found your weak spot for them.
**Keep `character` optional in the grade request body** or a stale client 400s.
**Risk: high.** Overrides silently ignored (D2); a mistyped `voiceId` makes the mic button
look dead; a persona that starts teaching destroys the premise.
**Test:** same sentence, three characters. Child asks what a weight is; Manager asks what
it's worth; Expert asks which assumption you're making. Two identical questions = personas
too similar. **Any of them defining a term for you = a rules-block failure, and that's
the serious one.**

### #4 + #43 Mood and animation · M · flag: `characterMood`, `characterAnimation`
Two layers of one feature: mood as React state, animation as the CSS that reads it.
**Mechanism:** a `set_mood` client tool — the SDK supports it and `ConversationProvider`
is already mounted. The handler must return `void` and the dashboard's expects-response
must be **off**, or you've put a round-trip inside every spoken turn. A keyword heuristic
runs as a floor when the tool doesn't fire.
Rejected: a marker token (TTS speaks it aloud — "bracket confused"), and a classify call
(300–1500ms, so her face lags her voice by a full turn).
**Animation is two axes, not one enum** — "speaking" and "confused" are simultaneously
true. Mood animates on *change*, not continuously, or it fights the speaking animation.
**Test:** say something jargon-dense → mood logs `confused` within a second. Then give a
good analogy → `understanding` or `impressed`. Replies noticeably lagging after this
ships = expects-response is on.

### #26 Unlockable characters · S · flag: `characterUnlocks` (default **off**)
**Build it, ship it off.** Judges see a fresh browser and one lesson — unlocks would hide
five of your six characters at exactly the moment you want to show them. If you want the
feeling of progression, keep everything unlocked and play the unlock *animation* at
completion: the reward without the gate.

### #28 Boss characters · S · flag: `bossCharacters` (default off)
Star tiers, a BOSS ribbon on the Professor, and a per-character pass threshold. A skin
over #36's threshold plus CSS — 20 minutes for a legible stakes signal. Don't schedule it
as a system.
**Test:** with the server stopped, finish a lesson — the keyword fallback must still
produce a verdict. A `TypeError` on `aiGrade.results` means the optional chain is missing.

### #46 Custom characters · M · flag: `customCharacters` (default off)
A form producing a `CHARACTERS`-shaped row. The `interests` field is what makes it feel
alive — a learner who drags quantum computing back to gardening is memorable.
**The rules block must be concatenated *after* the user's text**, or "explain everything
to me in detail" produces a character who teaches. Cap free text at 120 chars, strip
newlines. Never put image data URLs in localStorage — one photo blows the 5MB quota and
takes the picker down.
**Demo advice:** pre-create one and show it already in the picker. Filling a seven-field
form on stage is 40 seconds of dead air.

**On character art:** let voice carry identity — ElevenLabs voices encode accent, age and
gender far more convincingly than a 200px PNG, and the agent supports 70+ languages. For
the visual layer, flat shapes distinguished by silhouette and colour rather than facial
features; the ten-minute fallback is a large glyph in a coloured circle, which is already
the pattern used by the recap avatar. For #46, a file input lets users supply their own —
the only path to genuine representation, and it costs one `<input type="file">`.

---

## 4. Challenges

Nine listed features are **five things**: the director channel, a falsehood challenge, a
timer, a card deck, and a render toggle.

### #18 Voice-only mode · S · flag: `voiceOnly`
Hide the transcript and checklist; results at the end only. **The cheapest thing here and
it makes the strongest product statement** — it says the voice loop is the product, not a
garnish.
**The bug you'd otherwise ship:** hiding the progress aside removes the only route to the
recap. Voice-only must render its own always-visible finish button. *(The general case of
this was fixed on 2026-08-14 — the button is no longer gated on full coverage — but the
voice-only layout must not re-introduce it.)*
**Test:** run the same lesson in both modes saying the same things — the recaps must be
identical. If voice-only shows "you didn't give Grandma an explanation", you conditioned
`setMessages` on the render instead of only the render.

### #11 + #17 Falsehood challenges · M · flag: `misconceptionAttack`, `findTheMistake`
**These are one engine**: AI states something false → student corrects → we grade the
correction. One `fireDirectorChallenge({kind, prompt})`, two content sources
(#11 from `misconceptions[]`, already generated; #17 from a new `wrongStatements[]`).
Building them separately doubles the failure surface for one incremental beat.
**Never let both auto-fire in one session** — two unprompted falsehoods reads as a broken
app, not a designed challenge.
**Risk: high, and the highest reward.** Add a hidden manual trigger for the demo and
rehearse the specific topic.
**Test:** the grader must return `passed:false` when the student agrees with her. If it
rubber-stamps, the feature is decorative.

### #13 60-second challenge · M · flag: `speedChallenge`
Explicit start button, never automatic. **Poll a deadline; never decrement a counter** —
a counter drifts and freezes when the tab is backgrounded.
**Honest limitation:** nothing client-side can force the agent to stay silent — turn-taking
is server-side VAD. The director note is best-effort. Don't promise judges silence.
**Test:** background the tab for 20 seconds mid-run; the countdown must reflect real
elapsed time.

### #14 Explain it three ways · S (after #15) · flag: `threeWays`
Analogy → story → real example, one at a time, three slots filling in. **Low risk** —
student-paced, no timer, no falsehood — and the three-slot panel is one of the better
judge-facing artefacts here.
**Test:** grade "Recursion is when a function calls itself" as an analogy attempt →
must come back `passed:false` with a note that it's a definition. If that passes, the
grader can't tell an analogy from a restatement, which is the entire feature.

### #15 Random challenge cards · M · flag: `challengeCards`
Shuffled deck, **fixed turn slots** (2 and 6). Random content, deterministic timing — a
demo that behaves differently every run can't be rehearsed.
**Risk: this is the visible failure mode of the whole director architecture** — the card
on screen says one thing and Grandma may say another. Nothing else puts our text and her
speech side by side for judges to compare.

### #12 No-jargon challenge · M · flag: `noJargonMode`
Forbidden list generated with the lesson; matched in-browser with a **word-boundary
regex**, not `includes` (`"ion"` matches `"function"`).
**The trap:** the model will happily put `"gradient"` in both `keywords` and `jargon`, so
Grandma interrupts the student for saying the exact word that ticks the checklist. Filter
the overlap server-side *and* instruct against it. Cap at 3 interruptions.

### #16 Adaptive difficulty · S · flag: `adaptiveDifficulty`
Escalates *persistence*, not knowledge (see D4). Uses `From now on:` director notes.
**Risk: it won't break, it'll be invisible.** Judges can't distinguish "adaptive" from
"she asked more questions". The UI chip is doing more work than the code. Without it,
this is a feature only the team knows exists.
**Watch for:** Grandma changing voice or personality after a level-up — that's the
failure that makes this actively harmful.

### #35 Game modes · M · flag: `gameModes`
**Ship three, not six.** Solo / Challenge / Speed Teach, each a **flag preset** rather
than branching logic — so the selector adds no new failure paths. Show the rest greyed as
"coming soon"; that reads as roadmap, not broken. Build last: a menu of empty rooms is
worth nothing.

---

## 5. Reflection

### #8 Grandma's Notes · S · flag: `richNotes`
**~70% done.** Missing: "your strongest moment" (a verbatim quote), and "what to
practice" as an *action* rather than a point label. Also replaces seven hardcoded
substring matches (`"what exactly"`, `"what does"`…) with model-selected quotes — that
card currently falls back to "any message with a ?" and looks broken even on a good
lesson. 25 minutes on the screen judges already see.
**Test:** `strongestMoment.quote` must be a substring of something the student actually
said. A paraphrase means the model is inventing quotes.

### #9 Grandma explains it back · M · flag: `explainBack`, `spokenRecall`
**She recalls, she does not explain.** She reproduces only what she absorbed from the
student's words — gaps, errors and all. A correct explanation from her teaches the
student nothing; a faithfully broken one shows them exactly where their teaching failed.
The gap *is* the product.
Three rules make it reliable: a closed world in the prompt, mandated non-repair (leave
wrong things wrong), and `unexplainedTerms[]` — every one of which the client verifies
appears in the student's own transcript. That turns "trust the prompt" into "we checked
her words came from yours."
**The numbers must be countable, not generated** (see D3): `covered 4/4 · followed 3/4 ·
could repeat back 2/4`, with the denominators visible.
**Voice:** one spoken line, presenter-triggered, before `finishLesson()` ends the session
— nothing can make her speak on the recap page. Then feed her *actual words* into the
analysis rather than generating a second version, so the two can't contradict each other.
**Test:** give it a transcript where the student says something wrong. She must repeat the
mistake. If she corrects it, the feature is dishonest.

### #10 Mirror mode · M · flag: `mirrorMode`
She retells it as numbered claims, some wrong, seeded from `misconceptions[]`. Student
flags the wrong ones. **Score client-side** — the server already told us which are wrong,
so it's arithmetic: zero latency, no failure mode.
**Never ship this without #9**, or Grandma starts confidently asserting falsehoods with no
prior framing that she's only parroting.

### #22 Weakness training · M · flag: `weaknessTraining`
**The highest value-per-minute feature in the reflection set**, and it needs no
persistence — the weakness comes from the lesson that just ended. "Explain it again,
without these four words", with the banned words enforced live: each renders as a chip
that **turns red the instant it appears in the transcript**. A judge watching a word go
red as the presenter says it is the best live visual here.
Banned terms must be words the student actually used — verify client-side and drop any
that aren't in the transcript.

### #21 Teaching profile · M · flag: `teachingProfile` · needs F5
**Be honest about which axes are measurable.** Concept coverage, survives-retelling and
jargon rate are countable. Clarity and accuracy are uncalibrated model opinion — omit
them. Adaptability needs per-turn grading that doesn't exist.
Show `n = 8 sessions` beside the heading, and under 3 sessions show "this needs about
three lessons to mean anything" **instead of** the bars. That guard is what stops a judge
asking "so this is from one session?"

### #49 Personal analytics · S · flag: `analytics` · needs F5
Same store as #21, different rendering. Six tiles. **Drop "best character"** — there's
one character, so the tile invites "compared to what?" with no answer. Use "hardest
topic" instead: real, from the same data, more interesting.
If time is short, **build #49 and skip #21** — tiles land harder in three minutes than
bars, and cost less.

### #23 Knowledge tree · L · flag: `knowledgeTree` · needs F5
Nested `<ul>` with CSS connectors — **no graph library**, a new dependency at hackathon
time is a build risk for a visual you can get from 40 lines of CSS.
**Two real risks:** a first-run tree is one node and looks broken (fix: ghost "suggested"
nodes from a generated `siblings[]`, clickable to start that lesson); and taxonomy drift
— `"Technology"`, then `"Tech"`, then `"Computer Science"` shatters the tree (fix: send
`knownCategories` on every lesson call and instruct reuse).
**It touches `/api/lesson`, the one endpoint every lesson depends on.** Highest
risk-to-thesis ratio in the plan. Cut first.

### #37 Adaptive journey · S · flag: `adaptiveJourney` (default off)
**Not really a separate feature** — it's #22 reading #21's cross-session aggregate
instead of the current lesson. ~15 lines. Its value is a banner: *"Across your last 3
lessons, jargon has been your weak spot."* Have the honest answer ready if a judge asks
what adapts: "the banned-word list comes from your history instead of your last lesson."

---

## 6. The game layer

**#24, #25, #27 and #40 are one system with four faces** — one score, one XP function,
one profile object, one recap band. Build as a single unit (~2h). Split across people and
you get two disagreeing score definitions.

### #25 XP · M · flag: `progression` · needs F7
Seven events from the vision, mapped to real signals. Four work today; three
(jargon-simplified, self-corrected, good analogy) need F7's `moments` field.
**Analogy detection must come from the model, not a regex** — voice transcripts are
saturated with "like" as filler.
**Guard against double-award** on re-render or a double-clicked Finish: mint a lesson id,
commit once against it.
**If grading fails**, award coverage-only and say so — never silently zero, and never
infer understanding from keywords to paper over the outage.
**Test:** the itemised list with real quotes ("+50 Found a good analogy — *'like a row of
coffee filters'*") is genuinely impressive. Floating +XP toasts are not — default them off
during the live segment.

### #24 Levels · S · flag: `progression`
Six ranks, advancing on XP **gated by recent quality** so grinding bad lessons can't level
you. From zero a demo reaches level 2 — one small badge. It's a closing beat, not a
centrepiece.

### #27 Achievements · M · flag: `achievements`
**Five of the eight are earnable.** Speed Teacher needs #13; Analogy Master and Feynman
Master need history a demo won't have; **Myth Buster is not achievable at all** until #11
ships, because nothing on stage states a misconception for the student to correct. Ship
those locked with their conditions visible — that communicates depth without awarding
anything false.
**Test:** run the vague script's profile through it. **Zero achievements should unlock.**
If anything does, a judge who tries the vague explanation gets rewarded for it.

### #40 Completion experience · M · flag: `progression`
Score reveal → existing notes → XP → achievements. **No full-screen takeover, no blocking
modal** — the recap *is* the punchline; making judges wait for it costs more than it adds.
**The hazard:** `showRecap` flips true while grading is still running. Celebrating there
can congratulate a failure in front of judges. Gate the celebration on the grade arriving,
and derive its copy from the score (see D5).
**Test:** the vague script must produce a score under 40 and copy that says she's still
lost. Any celebratory framing there is the demo losing its own argument.

---

## 7. Multiplayer

**#29, #30, #31 and #33 are all views onto #34.** Only the asynchronous form is
achievable.

### #34 Async multiplayer · L · flag: `teachOff` · needs F6
Two people teach the **same stored lesson** in sequence on one machine; each run is graded
and stored; runs shown side by side.
**The critical constraint:** store the whole lesson object and have player 2 *fetch* it —
never regenerate. Two payoffs: comparable scores, and player 2's lesson loads instantly.
Round two is faster than round one.
`challengeId` format `TEACH-XXXX` from an ambiguity-free alphabet so it can be read aloud.
**Demo staging:** doing both runs live costs ~4 minutes — the whole slot, with a judge's
microphone on the critical path. Better: do the vague run during setup (it persists in
`runs.json`), then one live run on stage for the comparison. **Say "recorded earlier" out
loud once** — it's a real explanation genuinely graded, just not performed live.
**Test the persistence specifically:** touch a server file to force a `node --watch`
restart, then re-fetch. An empty array means every server save during the demo wipes the
board.

### #29 Teach-off · S on top of #34 · flag: `teachOff`
The framing layer — a code to share, a name prompt, the word "Teach-Off". If you find
yourself writing sockets or lobbies, you've left the achievable version.

### #31 Leaderboard · S · flag: `leaderboard`
Ranked table for **one** challenge on **one** machine. Title it "This Teach-Off", never
"Leaderboard" unqualified and never "Global".
With one run, don't render a table — render "You're first. Hand someone the mic."
**Do not seed fake competitors.** Two real rows tell a truer story than five invented
ones, and "we only show runs that actually happened" is itself a good line.

### #30 Multi-player scoring · S if #6 lands · flag: `dimensionBars` (default off)
**~95% a #6 dependency** — it renders someone else's numbers. Without #6, only coverage
is real; five bars derived from one boolean array is fabrication with extra steps, and
"how do you measure adaptability?" gets an answer that damages the demo.
**Honest fallback:** two bars — score and points understood — plus the two summaries.

### #33 Speed competition · S if #13 ships · flag: `speedMode` (default off)
Parasitic on #13. A countdown over a live voice call adds pressure to whoever's speaking,
possibly a judge, and Grandma interrupting eats their clock through no fault of theirs.

### Not viable — build as slides, not code

| # | Why |
|---|---|
| **#32 Team battle** | Four live voice sessions, 6–8 minutes, four willing humans. Storage isn't the problem; the demo budget is. |
| **#47 Public challenges** | Needs deployment + persistent identity. The local `challengeId` design *is* a genuine prototype of it — that's a legitimate thing to claim on a slide. |
| **#48 Global leaderboards** | No deployment, no users, no shared store. A "global" board on a laptop is disprovable by unplugging the wifi, and one caught false claim taints the honest parts. |

A mock-up on a slide is a proposal. The same pixels inside the running app are a lie.
That distinction is worth holding.

---

## Recommended order

**Do first — improves what exists, near-zero risk (~1.5h)**
1. F1 + F2 + F7 (foundations that improve grading on their own)
2. #8 upgrade — the screen judges already see
3. #44 polish — split mic-denied from connection-failed; add a "thinking" state. The mic
   error is the single most likely failure for anyone who tries the app themselves.

**Then — the strongest additions (~4h)**
4. #18 voice-only — cheapest thing here, strongest product statement
5. #9 text half, then spoken half — the gap *is* the product
6. #22 weakness training — best live visual, no persistence needed
7. #20 + #39 + #38(a) — one prompt, one schema bump, three visible features

**Then — pick by what the demo needs**
8. #2/#3/#36 characters (verify D2 first)
9. #40 + #25 completion and XP (settle D3 first)
10. #11 misconception attack — highest risk, highest reward
11. #34 teach-off if there's a two-hour block

**Cut first if time runs short:** #23, #10 Tier 2, #19, #45's token work, #7.
**Don't build:** #32, #47, #48, #33 (unless #13 lands anyway), #26 (build it, ship it off).

---

## If only one thing ships

The moment that wins is the keyword bar reading 4/4 while the AI says she didn't follow a
word of it. Everything above is graded on whether it sharpens that moment or competes
with it.

**#9 sharpens it most** — Grandma proving, in her own voice, exactly what survived.
**#22 is the best live visual** — a banned word going red as it's spoken.
**#40's score makes it quotable** — "I got 34 and my teammate got 78" is what a judge
repeats to another judge.

One honest number is worth more than six features of celebration.
