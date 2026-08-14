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
