# Claude Code Session Context

Running log of work done on this project via Claude Code, kept separate from `chatgpt export.md` (the original ChatGPT planning/build conversation).

---

## Session 1 — Repo setup

- Initialized a fresh git repo rooted at `titanom-hack-2026/` (not the parent `demo/` folder).
- Excluded `frontend/node_modules` and `frontend/dist` via the existing `frontend/.gitignore`.
- Pushed initial commit to `https://github.com/PavinSP/demo.git` on `main`.

## Session 2 — ChatGPT export analysis

- User shared a ChatGPT conversation link (share URL) recounting the full original build process of "Teach It To Grandma." WebFetch couldn't render the JS-based share page, so the user exported the conversation manually as `chatgpt export.md` (~12,127 lines) and added it to the repo.
- Read the export intensively across 4 parallel agents (each covering ~3000 lines) and consolidated findings:
  - **Project**: Feynman-technique voice app — student explains a concept to an AI "Grandma" persona who catches jargon, logic gaps, and vagueness, never teaches back.
  - **Stack**: React + Vite frontend, ElevenLabs Conversational AI agent (Gemini 2.5 Flash LLM, voice "Grandma Rachel"), `@elevenlabs/react` SDK, no backend/database.
  - **Grading**: Deliberately kept as plain-JS keyword matching (`calculateProgress()` in `App.jsx`) rather than LLM-based grading, for demo reliability. "Smarter AI grading" explicitly postponed indefinitely.
  - **Topics**: Recursion, Neural Networks, Mitosis, Supply & Demand — each with 4 checklist points driven by keyword/context checks.
  - **Build history**: scaffolding → ElevenLabs agent setup → SDK wiring (fixed 2 blank-page bugs) → live transcript → dynamic checklist (fixed a false-positive exploit) → recap screen ("Grandma's Notes") → topic-aware dynamic variables → Grandma speaking/listening animation (pivoted from mouth-overlay to whole-image movement; fixed a white-background flash bug by switching `grandma.jpeg` → transparent `grandma.png`) → responsive CSS → production build confirmed working.
  - **End state per the export**: all core features complete; only remaining items were smarter AI grading (deferred) and a hard-coded transcript greeting placeholder (deferred to "final cleanup"). Last stated next step: one quiet-room voice test, then prep the 3-minute demo.

## Session 3 — Quiet-room test scripts

- Cross-checked the actual `checks`/`keywords`/`required` values in `frontend/src/App.jsx` (not `data/topics.json`, which is empty) to make sure scripts would trip every checklist point.
- Created `script.md` with a read-aloud script per topic (Recursion, Neural Networks, Mitosis, Supply & Demand), each written to hit all 4 keyword checks, plus a test checklist (topic select → greeting → transcript → 4/4 progress → Finish lesson → recap → restart).
- Committed and pushed.

## Session 4 — Agent swap

- User provided a new ElevenLabs agent link: `agent_4301m009ej3eew6sgp492ky9s4dj` (with a `branch_id` query param, which is only relevant to ElevenLabs' own preview/testing UI — not used by the app's `startSession()` call).
- Updated `AGENT_ID` constant in `frontend/src/App.jsx` from the old agent (`agent_8901kzzhzexhe2qt3903amp09nnq`) to the new one.
- Noted: if the new agent is still a draft, it needs to be published in ElevenLabs before the live app can connect.

## Session 5 — Transcript auto-scroll

- User noticed the transcript didn't auto-scroll while talking.
- Added a `transcriptEndRef` + `useEffect` in `App.jsx` that smooth-scrolls to the latest message whenever `messages` updates, plus an anchor `<div>` at the bottom of the `.transcript` list.
- Confirmed working by the user.

## Session 6 — Quiet-room test run

- User ran the full quiet-room test (all 4 topics from `script.md`) against the new agent with auto-scroll live. Confirmed working end-to-end.
- Remaining open items per the ChatGPT export's original end-state: hard-coded transcript greeting placeholder (deferred cleanup), 3-minute demo script/rehearsal never written, smarter AI grading (intentionally out of scope).

## Session 7 — Intelligent AI grading (the long-deferred feature)

Built the one feature the original plan kept postponing: LLM-based grading that judges whether the student *genuinely explained* each point, versus merely saying the keywords.

**Security fix first**: `.env` was tracked by git and the root `.gitignore` was empty. Untracked `.env` (`git rm --cached`) and wrote a real `.gitignore`. The earlier commits contain `.env` but it was empty at the time, so no secret is in history. Verified the built bundle contains zero `sk-ant` occurrences.

**Architecture**:
- `server/` — small Express server (`index.js`), reads `ANTHROPIC_API_KEY` from the project-root `.env` via dotenv. Endpoint `POST /api/grade` takes `{topicName, points[], transcript[]}`, sends the student's lines to Claude, returns `{results: [{point, understood, reason}], summary}` in Grandma's voice.
- `frontend/src/App.jsx` — `gradeWithAI()` fires on Finish lesson but **never blocks the recap**; keyword grading still drives the live in-session progress bar and acts as the fallback if the call fails. New state: `aiGrade`, `isGrading`, both reset on topic switch and "Start another lesson". API base URL from `VITE_GRADING_API`, defaults to `http://localhost:3001`.
- Recap UI: AI summary replaces the keyword verdict in the "GRANDMA SAYS" card when available; new "Did Grandma really understand?" card shows the per-point breakdown with reasons.

**Verified**: server health check OK, live grading call returned sensible strict results (rejected points where keywords were present but the explanation assumed prior knowledge — exactly the intended Feynman behavior), production build passes.

**Dev now needs two processes**: `cd server && npm run dev` (3001) and `cd frontend && npm run dev` (5173). Documented in `server/README.md`.

## Session 8 — TitanomGPT, honest labelling, then any-topic lessons

**Grading moved to TitanomGPT** (DeutschlandGPT, the sponsor's API) at
`https://api.deutschlandgpt.de/v2` — OpenAI-compatible, so it uses the OpenAI
SDK with a swapped base URL. Note their API silently ignores `max_tokens`
(wants `max_completion_tokens`) and supports `json_schema`, which replaced the
JSON fence-stripping hack. Key is `TITANOM_API_KEY` in the root `.env`.
Two earlier 403s were a teammate's key, not a format problem.

**Stopped the UI claiming understanding it hadn't measured.** The keyword
checklist reports *coverage*, so a vague answer could fill it to 4/4 while
Grandma was still asking what the words meant. "YOUR PROGRESS" → "POINTS
MENTIONED", "Grandma understands!" → "You covered all four points", and the
recap now derives its headings and point lists from the AI grade when present,
with keyword results as fallback. The keyword grader filling on vague input is
the strawman the AI knocks down — that contrast is the demo, not a bug.

**Any topic + generated lessons** (feature 1.1–1.4 of the 50-feature vision in
`ChatGPT-Change Claude Email Antigravity-*.md`). The four hardcoded topics are
gone; the landing page takes free text plus AI/ML suggestion chips. New
`POST /api/lesson` sends the topic to TitanomGPT and gets back the four things
worth covering, keywords for live coverage detection, a difficulty, and the
misconceptions beginners hold (stored, unused so far — they're the input for
the Misconception Attack feature). Nonsense topics are rejected with a reason.
`toLesson()` in `App.jsx` flattens the response into the `{points, checks}`
shape the existing progress and recap code already expected, so nothing
downstream changed. `required` is clamped to the keyword count, since a point
needing more keywords than it has could never tick.

**Reverted before this**: the Teacher character and the swappable-Grandma
picker (commit 83bbb1a, reverted in 7906baa). Recoverable from history.

## Session 9 — Grandma explains it back (#9)

The first feature off `PLAN.md`. She says back what she absorbed, using only
the student's own words, and the recap shows what survived.

**The design decision**: she recalls, she does not explain. A correct
explanation from Grandma teaches the student nothing; a faithfully broken one
shows them exactly where their teaching failed. `POST /api/explainback` gives
the model a closed world — the student's lines between markers, and nothing
else exists to it — plus a rule that wrong things stay wrong.

Rule 6 was added after testing. With rules 1-5 she held a false explanation
("backpropagation makes the error bigger") but closed with "usually you'd want
errors to get smaller" — common-sense reasoning that happened to supply the
exact point the student had missed. She may now say she is confused; she may
not say what the right answer would look like.

`unexplainedTerms` is filtered server-side against the transcript, so a term
she claims went undefined must actually be a word the student said. That turns
"trust the persona prompt" into a checkable property.

**The spoken half** (`spokenRecall`, separately killable) asks her live via
`sendUserMessage`, before `finishLesson` ends the session — nothing can make
her speak on the recap page. Her answer is then fed back into the analysis as
`grandmaRecall`, so the written version can't contradict what the room just
heard. The injected prompt is tagged `meta:"prompt"` and filtered out of
grading, live coverage, and the recap's "your explanation" — otherwise our own
line would be graded as the student's words.

**Measured**: a jargon-dense but technically correct explanation of overfitting
scored 0/4 recalled with five undefined terms.

## Session 10 — Weakness training (#22)

Second feature off `PLAN.md`. Diagnoses the one thing that actually went wrong
in a lesson, then sends the student back into the same topic to fix
specifically that.

**One weakness, not a checklist**: `POST /api/challenge` picks exactly one of
`jargon | missing-steps | no-examples | too-abstract` from the transcript,
rather than listing everything wrong — a single named pattern is something a
student can act on, six caveats aren't.

**Banned terms must be words the student actually said.** For a jargon
diagnosis the model proposes 3-5 terms; the server strips any that don't
literally appear in the transcript before responding, and the client repeats
the same check before rendering. A banned word the student never said would be
an unwinnable, unenforceable constraint — it could never appear in the
transcript to flag as a slip.

**Live enforcement is pure re-render, no extra state.** `bannedHits` is
recomputed every render straight from `messages` — a term shows red and
struck-through the instant its word appears in what the student just said, no
polling, no separate tracking array to fall out of sync.

**Reuses #9's `unexplainedTerms`** as one input signal when available, rather
than re-deriving jargon detection from scratch — the two features compose.

Verified: a jargon-heavy neural-networks explanation correctly diagnosed
`jargon` with 4 banned terms, all verifiably said; a same-length recursion
explanation missing a worked example correctly diagnosed `no-examples` with
an empty banned list (no live enforcement for non-jargon weaknesses, by
design — there's nothing to check a word against).

## Session 11 — Topic analysis, challenge cards, misconceptions rendered (#20 + #39 + #38a)

Third and fourth features off `PLAN.md`, grouped as the plan suggested — one
prompt paragraph and one schema bump on `/api/lesson`, three visible results.

**This is the one endpoint every lesson depends on**, so both new fields are
defensively defaulted after parsing (`analysis` to `null`, `challenges`
filtered and capped at 3) rather than trusted — the json_schema `required`
list is advisory, not enforced, so a malformed response degrades to "nothing
extra to show" instead of a 502 on the landing page.

**#20 discriminates for real, not just on paper.** Tested against topics
picked to be unambiguous either way: "how a doorbell works" came back
Beginner/Medium/Low, "general relativity" came back Advanced/High/High. A
bicycle-balance topic returned High concept density on both meters at first,
which looked like a rubber-stamp until checked against a genuinely simple
comparison — bicycles really do involve several interacting forces, so it
was a correct reading, not a discrimination failure.

**#39's challenges use `sendContextualUpdate`, never `sendUserMessage`** —
confirmed the send path never calls `setMessages`, so an accepted challenge
can't leak into the transcript as a fake `YOU` line the way an injected
`sendUserMessage` would. Because contextual updates don't force a turn, the
button shows "Challenge sent — Grandma will ask you next" immediately, so the
one-beat delay before she actually asks reads as intent, not a broken button.

**#38(a) is just rendering** — `misconceptions` has been generated and
carried on every lesson since session 8 with nothing ever reading it. This
is the "render what already exists" half only; the harder half (b) — having
Grandma voice one mid-conversation via a dashboard prompt edit — is
deliberately deferred, per D1 in `PLAN.md`, until the shared-prompt
coordination question is settled.

## Session 12 — Feynman Score and XP (#40 + #25)

The completion band: a score, itemised XP, and a running total on the recap.

**D3 settled: the score is computed, never model-emitted.** `feynmanScore()`
in `frontend/src/progression.js` is 70% AI-judged understanding, 15% keyword
coverage, 15% how little Grandma had to interrupt — every input a boolean an
engineer can point at, so identical lessons always score identically. The
weighting makes a vague 4/4-coverage explanation land around 15-30, which is
the product's own argument expressed as arithmetic.

**D5 held: understanding XP comes from `aiGrade`, never the keyword bar.**
Coverage earns its own visibly smaller award (+100 for saying it, up to +300
for being understood). Celebration copy derives from the score — under 40 it
says "Grandma is still lost, darling" with the same prominence as a win. The
band renders a skeleton while grading runs; celebrating before the grade
lands can congratulate a failure.

**F7 shipped with it**: `/api/grade` now reports three teaching moments
(simplified jargon, self-corrected, used a real analogy), each with the
student's verbatim quote — verified server-side against the transcript, same
pattern as #9, so a paraphrase the model invented is dropped rather than
shown as the student's words. The filler word "like" was explicitly tested
and does not count as an analogy.

**Pay-out is once per attempt**: an id minted at Finish (only when none is in
flight, so double-clicks can't mint twice) and a commit effect that refuses
ids it has already paid. Grading outage → coverage-only XP with "Grandma
couldn't mark this one" — understanding is never inferred from keywords to
paper over the outage. Storage failures (missing, corrupt JSON, wrong types,
quota) all tested to degrade to a fresh default instead of a blank page.

**Tested**: 16 unit cases across score/verdict/XP branches, a live contract
test (real grade response → 620 XP with verbatim quotes), storage-failure
matrix, flags, smoke test. One arithmetic dispute during testing was mine,
not the code's (36.25 rounds to 36, not 37).

## Session 13 — Six characters, one agent (#2 + #3 + #36)

The trunk of the character system. Grandma, Mia (curious child), Sam
(student), Marcus (manager), Victor (expert), and Professor Ellis — all
played by the one ElevenLabs agent via per-session overrides: system prompt,
greeting, and voice. Personas live in `frontend/src/characters.js` as data,
so a personality change is a git commit, not a dashboard edit.

**The shared rules block is the load-bearing part.** Every persona ends with
an identical NEVER_CHANGES section (learner never teacher, keep your
knowledge to yourself, 1-2 sentences) — verified byte-identical across all
six at test time, because the failure mode of "six personalities" is the
Expert starting to teach.

**#36 is what keeps them from being cosmetic.** Each character carries an
audience line and a grading stance into `/api/grade` — measured on the same
transcript: baseline 2/4, Professor 3/4 (coherent, no contradictions — his
axis), Mia 0/4 (too abstract for a seven-year-old — hers). Different
characters judge along different axes, not a single difficulty dial.
`character` stays strictly optional in the request; the no-character
regression returns the original Grandma behaviour.

**The recall invariant survives personas**: whoever is listening,
`/api/explainback` keeps the closed world — Victor "knows things" in
conversation, but his recall may only use the student's words. Re-proved
both #9 tests (no knowledge leak, no repairing a wrong student) after the
prompt rewording.

**Every Grandma string went character-aware** — 44 sites swept with
per-replacement assertions: recap headings, indicators, mic statuses,
pronouns (CHALLENGE HER → CHALLENGE HIM for the four male-voiced learners),
avatars (glyph in a coloured circle where there's no art, with the
mix-blend-mode:multiply legacy scoped back to the Grandma PNG). Verdicts
drop "darling" for everyone except Grandma.

**Dashboard dependency, stated honestly**: the override toggles (System
prompt / First message / Voice) were enabled by the user in the ElevenLabs
Security panel; publish state unconfirmed at build time. The distinct
greetings are the canary — hear Grandma's greeting after picking Mia, and
the toggles aren't live. The designed fallback is "everyone is Grandma",
never a crash. Voice IDs came from the user's My Voices (Jessica, Chris,
Daniel, George, Bill); a wrong ID fails the session with the error naming
the character.

## Session 14 — Character portraits

The user supplied five downloaded images; on inspection two were PNGtree
watermarked previews (unlicensed, watermarks baked in), one was a JPEG with
the transparency checkerboard baked into its pixels, one clashed with Mia's
voice and pronouns (a boy), and collectively they spanned five art styles.
All five deleted.

Replaced with a consistent set generated from **Open Peeps** (Pablo Stanley,
CC0 — no attribution required) via DiceBear's API, composed per character
rather than random-seeded: grey bun + glasses for Grandma, afro-puffs for
Mia, flat-top grin for Sam, glasses for Marcus, goatee + aviators for
Victor, bald + moustache + old face for Professor Ellis. Each carries its
character's palette colour as a baked background, cropped to a circle in
CSS. The legacy `mix-blend-mode: multiply` (which served the old
white-background grandma.jpeg and would have tinted the baked colours) is
removed; `grandma.png` stays in the repo unused as the mascot.

## Session 15 — Voice-only mode (#18)

A toggle that hides the transcript and the whole progress sidebar
mid-lesson: just the character, the mic, and one line of copy. Everything
still records and grades identically — `voiceOnlyActive` is referenced only
at render sites, never in state or data logic, so the recap is byte-identical
between modes.

The one landmine PLAN.md called out is handled: the usual finish button
lives inside the sidebar this mode removes, so the voice-only stage renders
its own, visible from the first real student message. It's a view
preference, not session state — survives topic changes, resets nothing.

## Session 16 — Misconception ambush (#11)

The riskiest feature in the plan: mid-lesson, the character confidently
states one of the lesson's pre-generated misconceptions as if it were their
own conclusion, and the student has to catch it. Ships **default off** —
`?on=misconceptionAmbush` to arm it — because it makes the AI wrong on
purpose in front of people; the flag system gained `?on=` support for
exactly this staged-rollout case.

**Mechanism**: `sendContextualUpdate` with a `[DIRECTOR]` stage direction,
never `sendUserMessage` (which would put our words into the graded
transcript as the student's own). Director Notes ship inside every generated
persona in `characters.js` — a realisation that removed the dashboard
dependency, since with the picker on our persona replaces the dashboard
prompt entirely. The dashboard copy of the block is written in
`elevenlabs-agent-prompt.md` (committed before any of this, per D1) for the
`?off=characterPicker` fallback path, not yet pasted into the dashboard.

**Timing**: auto-fires when the 4th student utterance lands; Shift+M fires
it manually so a rehearsal never depends on counting turns. A shared
`directorTurnRef` mutex keeps it ≥2 student turns away from any challenge
card — two stage directions in one context window produce garbage.

**The catch is judged from what we know, not what she said**: the grade
request carries the exact claim she was directed to make, so the grader
judges the student's response to a known statement — no need to parse her
transcript line. Verified: a correction returns noticed+corrected with the
student's verbatim words (same server-side quote check as everything else);
agreeing with her returns both false; and with no ambush the response block
is absent entirely (the schema is assembled per-request).

**Transcript hygiene**: the on-screen "she's about to get something wrong"
beat is a `source:"system"` row — rendered as a centred stage note, excluded
from grading payloads, keyword coverage, and the recap's quote lists.

## Session 17 — Rich notes (#8)

The recap upgrade the plan ranked "do first" and we leapfrogged. Three
additions to `/api/grade`, all verified server-side before display:

**"Your strongest moment"** — the model copies the student's single best
sentence verbatim into a quote card, with one line on why it worked. The
quote is checked against the transcript; a paraphrase is dropped to empty
and the card simply doesn't render.

**"What to improve" now leads with one concrete action** — "Define technical
terms in plain language BEFORE using them", never a restated point label.

**"Where ___ needed help" shows real stumbles.** Previously seven hardcoded
substrings (`"what exactly"`, `"what does"`…) matched against her lines —
when she phrased things differently the card fell back to "no major
questions", making good lessons look like the feature failed. Now the model
picks up to 3 actual stuck-moments from the listener's own lines (passed to
the prompt as a separate labelled section — the per-point grading paragraph
still reads only the student's words), each verbatim-verified with the
stuck term as a chip. The old substring path survives as the fallback when
the AI grade hasn't arrived.

Verified with a staged exchange: strongest moment verbatim, practiceThis an
action, both stumbles verbatim with correct terms; a monologue returns an
empty stumble list; the character path (Mia) carries all three fields.

## Session 18 — Voice-call polish (#44)

Three error-path fixes, deliberately unflagged (a kill switch on an error
handler is a liability, per PLAN.md):

**A blocked microphone now says so** — `NotAllowedError` gets "click the
padlock in the address bar", `NotFoundError` gets "no microphone found",
and only genuine connection failures get the connection message. The
blocked-mic case is the most likely failure when anyone new opens the app,
and its fix is a browser permission no generic error would ever lead them to.

**A deliberate hang-up is no longer logged like a crash** — `onDisconnect`
reads the SDK's `reason` (verified in the type: "error" | "agent" | "user")
and only surfaces a banner for "error".

**The silence before her reply has a state** — when the last real
conversational line is the student's, the mic status reads "💭 ___ is
thinking..." instead of looking frozen. System stage-notes are skipped in
that derivation, since they land right after a student turn and would mask
it.

## Session 19 — Teach-off (#34/#29/#31), and the character rail

**Layout first** (user request mid-build): the session sat in a 1200px
column with dead gutters. The portrait moved out of the header into a
sticky left rail (portrait, name, speaking/listening), the session widened
to 1500px, three columns. Also compacted the start-of-lesson view so the
mic sits above the fold: header text at label size, transcript capped at
38vh, misconceptions collapsed behind a count. Earlier the mic needed
scrolling to find.

**Teach-off**: several people teach the SAME stored lesson in sequence on
one machine; every run is graded identically and lands on one board.

- `server/store.js` — in-memory map mirrored to `server/data/teachoffs.json`
  (gitignored). **The debounced write was a real bug caught in testing**:
  runs posted, the 300ms timer still pending, `node --watch` killed the
  process on a file save — board gone. Persist is now synchronous on every
  mutation; the retest survives an immediate restart. (`--watch` only
  restarts on imported modules, so writing the data file doesn't cycle it.)
- Codes read aloud across a room: `TEACH-XXXX` from an alphabet without
  0/O/1/I/L. Lowercase entry accepted.
- FINDING B honoured: the joiner receives the creator's lesson object
  byte-identical (round-trip verified) — never regenerated, so the scores
  are comparable. Joining also skips lesson generation entirely: round two
  starts faster than round one.
- Ranking: score desc, earlier run wins ties — a later tie never displaces
  whoever set it.
- Honesty rules from the plan: the board is titled "This Teach-Off", never
  "Leaderboard"; a single-run board renders "You're first. Hand someone the
  mic." instead of a one-row table; no seeded competitors, ever.
- The creator's own run posts with their already-computed Feynman Score;
  the joiner's posts automatically when their attempt commits (inside the
  once-per-attempt guard, so double-Finish can't double-post).

## Session 20 — Achievements (#27)

Eight badges on the completion band: earned ones lit with a NEW tag, locked
ones dimmed with their unlock condition as the tooltip. Every condition is
a boolean over existing data — moments, grade, computed score, ambush
verdict — and "a vague lesson earns nothing" is an explicit unit test, not
a hope. Already-earned badges never re-fire; cross-lesson counters
(analogies in 3 lessons, ten 75+ scores) accumulate in the localStorage
profile.

Two things the plan got to update: Myth Buster was marked impossible when
the plan was written — the ambush (#11) made it real, catching the
deliberate lie unlocks it. And Speed Teacher brought the first session
clock (mic's first press stamps the attempt).

## Session 21 — Mirror mode (#10), and two reset defects fixed

**Mirror mode**: after the recap, a "Now check her work" card. The listener
retells the lesson as exactly 6 one-sentence claims, exactly 2 deliberately
wrong — planted from the lesson's own misconceptions, reworded into the
character's voice, never invented about material the student skipped
(that would be testing them on something they were never given). The
student flags suspects and locks in; scoring is pure client arithmetic
since we know which were planted — zero latency, no API on the scoring
path, `why` lines reveal after submission so every verdict defends itself.
Counts only, no percentage, per A2. The server retorts 502 if the model
returns an unplayable board (0 or >3 planted). Fetch fires on the button,
never at Finish — the recap is never delayed.

**Found while building** — the teach-off session's "3 reset sites"
replacement had matched `takeChallenge` instead of the back-button:
a challenge re-run wrongly wiped the board (contradicting the documented
intent that a re-run is another attempt on it), and backing out of a
session left the teach-off set (harmless only because startLesson happens
to reset it on every new-lesson path). Both fixed: re-runs keep the board,
the back-button clears it.

## Session 22 — Security pass (#45's remaining items)

Three fixes, deliberately unflagged like the error handlers (a kill switch
on a security control is a hole):

- **CORS closed**: only the app's own dev origins (localhost/127.0.0.1 on
  5173/5174, overridable via ALLOWED_ORIGIN). Verified: an evil origin gets
  no allow header, ours does.
- **Rate limiting**: every TitanomGPT-backed endpoint (lesson, grade,
  explainback, challenge, mirror) shares a per-IP budget of 30 requests per
  5 minutes — verified tripping at 31. In-memory, swept periodically. Note:
  running the limit test spends localhost's own budget; a server restart
  clears it.
- **Dead credential removed**: ANTHROPIC_API_KEY deleted from .env (unused
  since the TitanomGPT migration in session 8 — an unused key in a shared
  .env is a leak waiting for a screen-share; the key itself remains valid
  in the Anthropic console if ever needed). @anthropic-ai/sdk uninstalled.
- Bundle re-checked: zero secrets in dist.

Deliberately NOT done: the ELEVENLABS voice-token proxy (#45 gap 1). It
requires an ElevenLabs API key we don't have server-side, changes how the
demo's one critical connection authenticates, and the plan itself says to
flip it after the demo, not before.

## Session 23 — Your character (#46, student half)

The user asked for Snapchat-style self-customisation before starting: a
name and a chosen face. Design call: no male/female toggle — a grid of 12
Open Peeps faces spanning hair styles, all five available skin tones,
beards and glasses; you pick the one that looks like you, and no option
carries a demographic label. Stored in `teachit.you.v1` (same
corrupt-storage matrix as the profile: 7 unit checks). Where it shows:
the landing hero (chip with face + name, click to edit), the transcript
(their name instead of YOU), and the teach-off name fields pre-filled.
A convenience, never a gate — everything works untouched for someone who
never sets it up.

## Session 25 — Mood and reaction (#4 + #43)

The listener's feeling about the explanation, and the avatar reacting to
it. **Works with no dashboard setup**, which was the design goal — two
layered sources:

1. A `set_mood` client tool the agent calls itself (accurate, needs the
   tool registered on the agent).
2. A keyword heuristic over what she just said (crude, needs nothing).

The heuristic is a floor, not a rival: it only acts when the tool has been
silent for 15s, so a configured agent is never second-guessed by a regex.
The instruction to call the tool ships inside every generated persona, so
the character path needs no prompt edit; `elevenlabs-agent-prompt.md`
documents the optional dashboard step.

**Two axes, never one enum** — she is routinely confused *and* speaking.
Channel state (idle/listening/thinking/speaking) loops on the outer
element; mood plays ONCE on the inner shell, which React remounts via
`key={mood}`. Putting both on one element would have them fighting over
`transform` forever. Everything sits inside a `prefers-reduced-motion`
guard.

A caption ("lost", "following you", "impressed") sits under her name —
without it the reaction is subliminal and a judge can't tell the avatar
is responding to anything.

Heuristic tuned against this project's own transcripts: her analogy-check
("so the weight is like how important each ingredient is") reads as
understanding via a pattern, not a literal string; and "go on" was
removed after it misread her neutral opener as interest. Neutral lines
return null, which HOLDS the current mood — resetting on every neutral
sentence would make the avatar flicker constantly.

Rejected, both per the plan: a marker token in her replies (TTS reads it
aloud) and a classify call per turn (her face would lag her voice by a
full turn).

## Session 26 — Thinking time (pause)

A "🤔 Let me think" button beside the mic. Muting alone was never enough:
session 25's own transcript shows the student pausing and Grandma asking
"Are you still there, dear?" three times — exactly the pressure a pause is
meant to remove. So pausing does two things at once: mutes the mic, and
sends a `From now on` stage direction telling her to wait in silence and
not check on you.

Resuming unmutes and releases her, with an instruction not to comment on
the pause.

Named `paused`, not `thinking` — the channel axis already uses "thinking"
for HER composing a reply, and one word for both would read as one thing.
While paused she is visually at rest: no ambient animation (a breathing
avatar reads as impatience), dimmed, and the mood caption is replaced by
"waiting for you" since she isn't feeling anything about the explanation
just then.

Deliberately not snapshotted: the voice session dies on refresh, so a
restored pause would claim a state that no longer exists.

One desync closed — manually unmuting while paused now resumes properly,
rather than leaving a live mic with a character still under orders to be
silent. The paused+unmuted combination is unreachable by design.

Note on the Speed Teacher badge: paused time counts as wall time, so a
long think costs the badge. That is the honest reading of "under three
minutes" and needs no special handling.

**Follow-up — the stage direction alone did not work.** Live test: the
pause UI was correct and she still asked "are you still there, dear?"
twice. The cause is that the line does not come from the model choosing
to speak; it comes from the agent's **turn timeout**, which forces a turn
after a few seconds of silence. A forced turn never consults the system
prompt, so no instruction could have stopped it. The fix is
`conversation.sendUserActivity()` on a 3s heartbeat for as long as the
pause lasts — the event exists precisely to reset that timer. The stage
direction stays as belt-and-braces for the model's own judgement; the
heartbeat is what actually holds the silence.

## Session 27 — The escape hatch (?reset)

Three things persist now — the per-tab lesson snapshot, the XP/badge
profile, and the student's name and face — so a wedged or corrupt state
had no exit except devtools.

`?reset` clears the lesson only; `?reset=all` clears identity and progress
too. It runs at import time in `main.jsx`, **before React mounts**, which
is the whole design: the state most likely to need clearing is state that
breaks rendering, and a button inside a blank page saves nobody.

The parameter strips itself afterwards (so a later refresh doesn't
silently wipe a fresh session) while leaving other parameters intact —
`?reset&on=misconceptionAmbush` clears the lesson and keeps the ambush
armed. Blocked storage is caught rather than thrown.

Documented in TESTING.md and in DEMO.md's on-stage failure table, where
"App won't render at all" now says to try `?reset` before falling back to
`git checkout demo-safe`.

**Also as buttons** — a quiet footer on the landing page: "Clear saved
lesson" and "Reset everything". The URL stays the emergency hatch (it's
the only thing that works when the page won't render); the buttons are
for the ordinary case where nobody should need to know a URL. Only the
destructive one confirms — deleting earned XP and badges is real loss,
while clearing a stuck lesson costs nothing. Labelled by what they clear
rather than "start fresh", which read as "start a lesson" next to the
topic box.

## Session 28 — Mouths that move (workaround for real lip-sync)

The characters' mouths now move in time with their actual speech. Not
true lip-sync — there are no visemes to work from — but two frames
cross-faded by live output volume, which is the classic 2D cartoon
approach and reads as talking.

**Note the history**: the original build already tried a mouth overlay
and abandoned it for whole-image movement (session 2). This attempt only
worked because it was verified empirically rather than eyeballed.

**What the measurements ruled out.** Swapping whole face variants was the
obvious approach and it is dead: of 22 open-peeps faces tested against
`smile`, **not one changes only the mouth** — every variant also moves the
eyes, all starting at y≈109. Swapping them would make the eyes flicker.
`smileLOL` in particular closes the eyes (it is a laugh), which is why an
early band that reached up to y=120 was contaminated.

**What worked**: compositing only the mouth band. Eye changes occupy
y=109-144 and mouth changes y=145-188 with no quiet gap between them, but
they sit in different columns, so a horizontal cut at y=145 is clean.
Pasting `smileBig`'s y=145-195 onto `smile` gives, for all six
characters, 1100-1800px of mouth change and **exactly 0px of eye
change**, with boundary discontinuity identical to the original image
(i.e. no seam).

**Rendering**: both frames sit in the DOM and only opacity changes. A src
swap would hit the network on first paint and flicker. The rAF loop runs
only while `isSpeaking` and never while paused. Volume is eased toward
its target (factor 0.45), which measures as ~33ms to half-open and ~84ms
to close — fast enough to track syllables, smooth enough not to strobe
(max per-frame jump 0.35).

## Session 29 — A backdrop that pictures the topic

The lesson now has a quiet moving background matched to what it is
about: a connected network behind neural networks, travelling waves
behind sound, a splitting tree behind recursion.

**Not fetched images.** A stock-photo API would mean licensing, an
external dependency mid-demo, and whatever the search happened to return.
Instead `/api/lesson` picks a `motif` from eight shapes we designed —
network, waves, particles, orbits, flow, grid, branches, pulse — chosen
on the topic's underlying structure rather than its words. Verified
live: sound waves→waves, recursion→branches, digital images→grid, how
the heart beats→pulse.

**CSS animations on SVG, never canvas.** Transforms and opacity only, so
the browser runs them on the compositor. A canvas rAF loop would compete
with the live voice call for the main thread, and there is already one
running for the mouth. Everything sits inside a `prefers-reduced-motion`
guard, at ~13% opacity in ink rather than colour, `position: fixed` and
`pointer-events: none` so it never scrolls oddly or swallows a click.

Looping is by construction rather than by fade: the wave path is two
periods wide and slides exactly one, the pulse trace is duplicated and
slides half its width.

An unknown motif value degrades to no backdrop rather than breaking the
lesson, same as `analysis` and `challenges`.
