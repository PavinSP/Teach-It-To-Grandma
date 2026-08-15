# Build Prompt — "Teach It To Grandma" visual + motion redesign

Paste everything below the line into a fresh Claude Code session opened at
`/Users/pavinsp/Desktop/demo/titanom-hack-2026`.

---

You are a senior creative front-end engineer — the kind who ships Awwwards Site of the Day work and also knows how to not break a live demo. You're doing a full visual and motion redesign of an existing, working React app. The app works. Your job is to make it look and move like a funded startup product instead of a hackathon build, without regressing a single behaviour.

## 0. Read before you touch anything

Read these first, in this order, and do not start writing code until you have:

- `DEMO.md` — the pitch and the demo run order. This tells you which screens matter.
- `frontend/src/App.jsx` (3,649 lines, one component, all three views live here)
- `frontend/src/App.css` (3,191 lines, hand-written, no framework)
- `frontend/src/characters.js`, `you.js`, `strings.js`, `progression.js`, `mood.js`, `features.js`
- `server/index.js` — the API shapes you are rendering

Then write me a short map of what you found — the three views, the component boundaries you intend to carve out, and anything in the current CSS you plan to delete wholesale — before you edit. I'd rather correct your plan than your diff.

## 1. What the product is

The user types any topic. The AI generates a 4-point understanding checklist plus likely misconceptions. The user picks a character — grandma, child, student, manager, expert, professor — then **teaches the topic out loud** in a live ElevenLabs voice call. The character interrupts, asks dumb-on-purpose questions, and challenges misconceptions. Live, the UI shows keyword coverage, the character's mood, and the user's progress. On "finish lesson," the backend grades the transcript and a recap screen shows the Feynman score, a jury of personas, where the explanation broke down, and blind spots the user didn't know they had.

The thesis, and every design decision must serve it: **teaching is how you measure understanding.** The UI's job is to make a judge watching from six feet away believe the machine is genuinely modelling what this person knows.

## 2. Hard constraints — read twice

- **Stack is fixed:** React 19.2, Vite 8.2, `@elevenlabs/react` ^1.12. No Tailwind, no CSS-in-JS runtime, no router, no state library. Keep it that way.
- **You may add exactly these deps, and only if you actually use them:** `motion` (Framer Motion v11+, imported via `LazyMotion` + `domAnimation` — never the bare `motion` bundle), `gsap` (+ ScrollTrigger, SplitText — all free now), `lenis`, `d3-force`. Nothing else. No `three`, no `react-force-graph`, no `lottie`, no `canvas-confetti`. If you think you need one, stop and ask.
- **Do not change any API call, payload shape, ElevenLabs wiring, scoring math, or feature-flag behaviour.** `progression.js`'s `feynmanScore`, the `?on=` / `?off=` / `?safe` / `?reset` flags, `snapshot.js` sessionStorage persistence, and the en/de strings in `strings.js` all keep working exactly as they do now. Every new string you add goes in `strings.js` in **both** languages.
- **`?safe` must degrade to a low-motion, low-GPU build** that still demos correctly on a strange projector laptop. Treat this as a real requirement, not a nicety.
- **This is a live demo.** Nothing may block on a network call, a font load, or a WebGL context. Every animated surface needs a static fallback that looks deliberate.

## 3. Refactor scope

`App.jsx` at 3,649 lines is the real obstacle. Split it — but surgically, in a way I can review:

- `src/views/Landing.jsx`, `src/views/Session.jsx`, `src/views/Recap.jsx`
- `src/components/` for the reusable pieces you extract (graph, waveform, character rail, transcript, recap cards, cursor, reveal primitives)
- `src/motion/` for shared easing tokens, spring configs, variants, the single rAF ticker, and the reduced-motion hook
- Keep all session state in `App.jsx` and pass it down. Do not introduce a store, a context tree, or a reducer refactor — that's a different PR and it will break things.
- Replace `App.css`'s literal values with CSS custom properties on `:root` (`src/styles/tokens.css`), then split the rest into per-view stylesheets. Delete dead rules as you go and tell me what you deleted.

Do this in stages and keep the app running after each stage. Never leave the tree broken.

## 4. Art direction — "Cathode Seminar"

A precision measuring instrument pointed at your own brain. Dark, monospaced, quietly clinical — an oscilloscope, not a chatbot. The warmth comes entirely from the characters (the existing `peep-*.png` portraits, their real voices, their in-character copy) sitting inside a cold instrument frame. **That contrast is the brand: warm humans in a clinical rig.** Lean into it.

References: Teenage Engineering OP-1 labelling, Berkeley Graphics technical drawings, Bloomberg terminal density, Dieter Rams control panels, `btop`, Linear's dark surfaces for restraint.

Explicitly not: glassmorphism everywhere, violet→blue gradients, rounded pastel cards, emoji as icons.

### Tokens — write these to `src/styles/tokens.css` verbatim

```css
:root {
  /* ground */
  --bg-void: #08090A;
  --bg-base: #0D0F11;
  --surface: #14171A;
  --surface-raised: #1B1F23;
  --border: #262B31;
  --border-strong: #39414A;
  --inset-hi: rgba(255, 255, 255, 0.045);

  /* text */
  --text: #E8EDF2;
  --text-2: #9BA6B2;
  --text-muted: #5E6975;

  /* semantic — these four ARE the product */
  --signal: #5EE0FF;        /* live / listening / primary */
  --understood: #7CFF9B;
  --partial: #FFC66D;
  --misunderstood: #FF6B5A;
  --unexplored: #47525E;     /* deliberately dim and desaturated */
  --rec: #FF3B30;            /* recording dot only, nowhere else */

  /* easing */
  --e-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --e-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
  --e-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
  --e-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
  --e-inout-quart: cubic-bezier(0.77, 0, 0.175, 1);
  --e-emph-decel: cubic-bezier(0.05, 0.7, 0.1, 1);

  /* space */
  --s1: 4px;  --s2: 8px;  --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px; --s9: 96px;

  /* radius — small on purpose */
  --r-panel: 2px; --r-input: 4px; --r-pill: 999px;
}
```

**Type.** Three faces, no more. `Space Grotesk` 600 for display (tracking `-0.02em`). `Inter` 400/500 for prose. `JetBrains Mono` 400/500 for every number, label, timestamp, node name, and status line — uppercase at `0.06em` tracking for labels. Self-host or use `fontsource` so nothing blocks on a CDN. Scale: `11 · 12 · 13 · 15 · 17 · 21 · 27 · 35 · 46 · 64`. Line-height 1.5 prose, 1.05 display. `font-variant-numeric: tabular-nums` on every live number — non-negotiable, or the layout jitters while it ticks.

**Depth.** No soft shadows in-layout. Depth is a 1px border plus `inset 0 1px 0 var(--inset-hi)`. One real shadow, modals only: `0 24px 60px rgba(0,0,0,0.65)`.

**Texture.** A viewport-fixed grain layer — bake `feTurbulence` once to a data URI, `opacity: 0.035`, `mix-blend-mode: overlay`, `pointer-events: none`. Do not animate it per frame. 1px horizontal scanlines at 2% opacity **only inside the graph canvas**. A 40% radial vignette on the session view. Grain is the single cheapest thing that stops a build looking like a template — do not skip it.

**Ship dark only.** A half-built light mode reads as unfinished; a committed dark instrument reads as a decision.

### Alternate direction (only if I ask for it)

Keep a commented `[data-theme="vellum"]` token block in `tokens.css` implementing a warm Swiss-editorial variant — `--bg #FBF9F4`, `--bg-alt #F3EFE6`, `--surface #FFFFFF`, `--border #E2DCCF`, `--text #15130F`, `--text-2 #4A4640`, `--text-muted #8B857A`, `--understood #2F6B4F`, `--partial #B4761E`, `--misunderstood #B03A2E`, `--unexplored #B8B1A2`, `--ink #101010`, `--marker #FFE45E` (multiply blend); `Fraunces` display / `Inter` 17px/1.65 body / `IBM Plex Mono` labels; radius 0 except 3px inputs; no shadows, hairline rules only. Everything else in this prompt must work under either token set — so never hardcode a colour outside the token file.

## 5. Motion system

Write it once in `src/motion/`, use it everywhere. No ad-hoc durations in components.

**Bezier vs spring.** Bezier when start and end are known and the motion must land on a beat — reveals, text masks, scroll scrubs, choreographed sequences. Spring when the target changes mid-flight or the element is under direct manipulation — cursor follow, drag, a graph node the simulation keeps nudging, a coverage meter that gets a new value every 400ms. Springs interrupt gracefully; beziers restart and look broken. Never spring a scroll-scrubbed value.

**Spring configs:**
- micro (button press, toggle, cursor dot): `stiffness 500, damping 32, mass 1` → ~180ms
- panel / card entrance: `stiffness 240, damping 28, mass 1` → ~420ms, faint overshoot
- heavy (full-screen sheet, graph recentre): `stiffness 120, damping 22, mass 1.4` → ~700ms
- magnetic cursor: `stiffness 150, damping 15, mass 0.1` — the low mass is what makes it weightless

**Duration ↔ distance:** `duration_ms = clamp(140, 90 + 0.55 * distance_px, 520)`. Opacity-only fades 120–200ms in. **Exits are always ~70% of the enter duration** and use a flatter curve. `ease-in-*` only for things leaving the viewport; never `ease-in-out` on an entrance.

**Stagger:** base step 40ms for lists, 25–30ms for dense grids, but cap the sequence — `step = min(base, 500 / (n - 1))`. Stagger grids from an origin (`delay = dist(i, origin) / maxDist * 350ms`), not by index. Children start at ~30–40% of the parent's duration, not after it.

**Reveal budget — enforce this.** One hero moment per viewport, two or three supporting reveals, everything else static or input-responsive. Max ~6 elements animating simultaneously. Max ~800ms total reveal time per viewport. Never animate two things competing for the same eye position. Below-the-fold reveals fire once (`IntersectionObserver`, `once: true`) and never replay.

## 6. Screen-by-screen

### Landing — "the live rig, running"

Kill the centred hero. Split the viewport **42/58**.

Left column is fixed and does not scroll: product name at 64px display, one 21px sentence (keep the existing `strings.js` line — "If you can't explain it to {name}, do you really understand it?"), a single `[ START TEACHING ]` button with a blinking mono caret, and a small status strip (`STATUS: 6 LISTENERS ONLINE`).

Right column is a full-bleed looping preview of a real session — waveform pulsing, nodes precipitating, a character interrupting — clipped inside a 2px-bordered panel with scanlines. The eye lands on motion first, reads the promise second. Prerecord this as a muted `<video>` or drive it from a canned transcript fixture; do **not** hit the API on page load.

Scrolling advances only the right column through three frozen session states with mono captions. The "how it works" section *is* the product running, not three feature cards. Run a hairline technical-drawing ruler with tick marks down the page edge.

Keep the existing topic input, topic suggestions, `you-*` avatar widget, and teach-off join — restyle them into this grid, don't remove them.

### Topic picker — "command index"

Two-pane, full height, nothing centred, flush-left against a 64px margin. Left: a 560px typeahead over a dense monospace list grouped by discipline, keyboard-first with visible `↑ ↓ ⏎` hints. Free-text entry is a first-class row, not a fallback. Right: a live preview that populates as you type — "PROBABLE PROBES," 4–5 questions the AI is likely to ask, plus a difficulty meter. Wire the right pane to the existing `POST /api/lesson` response (`analysis.conceptDensity`, `prerequisites`, `misconceptions`, `points[].hardFor`) — debounce it, and show the skeleton state, never a spinner.

### Character select — "casting strip"

Four to six full-bleed vertical panels filling `100dvh`, edge to edge, no gaps, 1px rules between. Hover or focus expands a panel to ~46% while the others compress, revealing the `peep-*.png` portrait, a three-line voice bio in prose, a button that plays an actual voice sample, and a mono spec block: `PATIENCE: LOW / INTERRUPTS: OFTEN / TARGETS: JARGON`. Derive those from each character's existing `audience` and `gradingStance`. Use each character's `color` as their panel accent — it is the one place warm colour is allowed to dominate.

Selection collapses the unpicked panels into a persistent 48px left-edge stack you can switch from mid-session.

### Live session — the hero moment

Fixed, `100dvh`, **no page scroll**. Grid: `56px` status strip / body / `88px` bottom bar. Body columns `320px | 1fr | 360px`.

- **Left rail:** the character, large. Portrait fills the column top, reacting continuously — idle blink, lean-in when confused, brow raise. Keep the existing two-frame `peep-*` / `peep-*-talk` cross-fade driven by `getOutputVolume()`, but drive it off the shared rAF ticker, not a `setInterval`. Below it a live state line: `CONFUSED ABOUT: "entropy"`.
- **Centre, dominant (~55% of width):** the understanding graph on a dark canvas with a faint 24px dot-grid and scanlines. Nodes are 2px-bordered rounded-rect chips with mono labels, coloured by the four semantic states. Edges are 1px with animated dash-flow while a link is being established. Build it from the existing `points[]` and `keywords[]` and the client-side coverage logic — one node per checklist point, child nodes per keyword.
- **Right rail:** live transcript, auto-scrolling, newest at bottom. User speech in `--text`, character lines in `--signal`. Last three lines at full opacity, older ones stepping down to 40%.
- **Bottom bar:** full-width real-time waveform, elapsed timer in tabular mono, coverage percentage, large hold-to-mute. `--rec` dot pulsing at 1s in the status strip.

Keep every existing control: difficulty readout, concept-density meter, prerequisite chips, challenge banner, confidence ask, recall button, end-call button, `Shift+M` misconception ambush, pause. Restyle, don't remove.

**Graph implementation.** `d3-force` alone — `forceManyBody().strength(-260)`, `forceLink().distance(90).strength(0.6)`, `forceCollide(r + 6)`, `velocityDecay(0.4)`. Render to canvas, not SVG or DOM. On node insert: `simulation.alphaTarget(0.3).restart()`, then `.alphaTarget(0)` after ~600ms — that beat is the graph coming alive. Run the sim in a Web Worker if you can do it without fragility; on canvas set `dpr = Math.min(devicePixelRatio, 2)`.

**Waveform.** `AnalyserNode`, `fftSize: 2048`, `smoothingTimeConstant: 0.75` for the wave and `0.5` for punchy meters. `getByteTimeDomainData` + RMS for level, `getByteFrequencyData` for spectrum. Bucket **logarithmically** into 24–32 bands or it looks dead, and emphasise the speech band 85–3400Hz. Apply asymmetric smoothing — `v = max(target, prev * 0.90)` — fast attack, slow release. That's what makes a meter feel musical instead of twitchy.

### Recap — "the ledger"

First screen is a locked full-bleed verdict: one enormous number (160px+, spring-tweened count-up on mount, tabular mono) with a one-line verdict from `headlines`, and the finished graph ghosted at 12% behind it.

Then scroll:

1. **Horizontal timeline ribbon** — the session left-to-right, each moment a vertical tick coloured by state, breakdown points spiking above the axis, clickable to replay that transcript segment. Feed it from `turningPoints` and `stumbles`.
2. **"GAPS YOU DIDN'T KNOW YOU HAD"** — a numbered editorial index list, not cards. Big serial numbers, flush-left titles, right-aligned severity. From `blindSpots`.
3. **Character-by-character debrief quotes** — the jury verdicts, each in that character's accent colour, with `spread` / `toughest` / `kindest` called out.

Sticky mini-graph pinned top-right through the whole scroll so context never leaves. The other ~19 existing recap cards stay — group them under mono section rules, apply the reveal budget so they arrive in ordered waves, and cut any card that doesn't earn its place (tell me which ones you cut and why).

## 7. The four signature moments — build them in this order

These are what gets screenshotted. Everything else is support.

1. **Crystallization.** As the user speaks, a node is *born from their voice*: a particle detaches from a waveform peak in the bottom bar, travels a bezier up into the graph canvas, snaps to a grid position with a one-frame white flash, then settles to `--partial` amber. When the grade confirms understanding, amber→green with a 400ms ring pulse and the edge to its parent draws in via `stroke-dashoffset`. This needs a shared coordinate system between the waveform and the canvas — build that first; everything else here is polish.
2. **The Interruption.** The character raises a hand. Canvas desaturates to 35% and blurs 2px, waveform flatlines to a 1px line, ambient audio ducks, and a question card slides up from the character rail with their line in 27px display type over a 220ms window. The room stops. Nothing else in the demo will feel this alive. Trigger it off the existing `set_mood` client tool and `[DIRECTOR]` contextual updates.
3. **The Blind Spot Reveal.** Throughout the session, unexplored territory exists as dim `--unexplored` silhouette nodes with redacted labels (`████ ██████`) at the graph's edge — visible, unreadable, quietly menacing. On the recap they light up one by one, 80ms apart, labels decoding character-by-character.
4. **The Receipt.** The final score as a thermal-printer receipt: monospace, 380px wide, torn edge via CSS `mask-image`, printing line by line top-down — topic, duration, coverage, per-character verdicts, three gaps, a barcode of the session hash. Built to be screenshotted and posted. Add `[ COPY RECEIPT ]`.

## 8. Technique menu — use what serves the above, ignore the rest

Custom cursor with **state variants** driven off voice state (`default | text | grab | listening | muted`) — a plain lagging dot with no states is worse than no custom cursor. Magnetic buttons: translate the target by `(pointer − centre) * 0.25`, clamped to 12px. Kinetic type via `SplitText` or `Intl.Segmenter` into `overflow: hidden` line wrappers, children translating `100% → 0` on `--e-out-expo` at 40ms stagger — per-word for headlines, per-line for paragraphs, per-character only for 3–6 word display type (and always set `aria-label` on the container, `aria-hidden` on the fragments). Scroll-driven reveals via native `animation-timeline: view()` where supported, feature-detected with an IntersectionObserver fallback — not a JS scroll listener. GSAP `ScrollTrigger` with `scrub: 1` for the landing's pinned right column; pin one section per page only. Lenis for scroll feel, driven from GSAP's ticker. `@property`-registered custom properties so gradients and numeric values interpolate on the compositor path. Spotlight borders via `--mx/--my` updated by an rAF-throttled `pointermove` on the *container*, not per card. Tilt clamped to ±8deg with `perspective: 900px`. `document.startViewTransition()` for view swaps where supported.

If you use glass anywhere, do it properly: `backdrop-filter: blur(20px) saturate(180%)`, a 6–10% fill, a 1px inner highlight (`inset 0 1px 0 rgba(255,255,255,0.12)`), and a real shadow — and cap it at two surfaces per screen, because it's one of the most expensive properties in the browser.

Plain CSS beats a library outright for hover/focus states, tickers, ambient loops, and any single-shot state change. If a component needs one transition, reaching for a library is a regression.

## 9. Performance — hold this line

- Animate `transform` and `opacity` only. Never `width/height/top/left/margin/box-shadow`. `filter` and `backdrop-filter` are budgeted, not free.
- `will-change` applied on hover / pre-animation and removed on completion. More than ~10 concurrent hints hurts.
- Batch all `getBoundingClientRect` / `offsetWidth` reads before any writes in a frame. Use `ResizeObserver` and `IntersectionObserver`, never measurement inside scroll handlers.
- **One global rAF ticker** in `src/motion/`, fanning out to subscribers. The `getOutputVolume()` poll, the waveform, the graph render, and the cursor all ride it. N independent loops means N times the scheduling overhead and non-deterministic ordering.
- Gate every canvas and loop on `IntersectionObserver` plus `visibilitychange`. `content-visibility: auto` with `contain-intrinsic-size` on long off-screen recap sections.
- Verify: DevTools Performance → Frames, plus the Frame Rendering Stats overlay, at **4× CPU throttle**. No long task over 50ms. INP under 200ms — a beautiful site that drops input while someone is mid-sentence is a failed product.

## 10. Accessibility — not optional here

- `prefers-reduced-motion: reduce` produces a **designed alternative**, not `animation: none`. Keep 150ms opacity crossfades and colour transitions. Remove parallax, scroll-jacking, continuous loops, rotation, scale above 1.05, and the particle travel. The graph renders a precomputed layout instantly instead of simulating. The waveform becomes a static bar meter updating in discrete steps. Also ship an in-app toggle — most users never set the OS flag — and wire `?safe` to force it.
- On view change, move focus to the new `<h1>` (`tabIndex={-1}`) and announce via a polite live region. Apply `inert` to the outgoing view during its exit so focus can't land on a fading element. `:focus-visible` rings appear instantly and are never animated away: `0 0 0 2px var(--bg-base), 0 0 0 4px var(--signal)`.
- Score and coverage updates go in `aria-live="polite"` **throttled to one announcement per ~3s** or a screen reader becomes unusable. The graph and waveform are decorative — `aria-hidden="true"` plus a text summary ("14 concepts, 3 gaps identified"). Misconception alerts are the one case for `assertive`.
- Any text over a moving surface gets a static scrim so contrast never drops below 4.5:1 at the loop's *brightest* frame, not its average.
- Vestibular care: ambient motion stays calm and non-competitive **while the user is speaking**. Save the expressive choreography for state changes — session start, concept unlocked, misconception surfaced, results.

## 11. Craft details

- **Empty states:** pre-speech graph shows one pulsing `--signal` node labelled with the topic and `WAITING FOR SIGNAL…`. Transcript shows a blinking caret, not "No messages yet."
- **Loading:** staged reveal, never a centred spinner. Mic permission → connection → character wake-up, each a mono status line ticking to `OK` in green. Skeletons only where the shape is known; no shimmer anywhere — it reads generic.
- **Errors:** inline, specific, `--misunderstood` on a 1px strip. `MIC DENIED — enable in browser settings`. `CONNECTION LOST — reconnecting (3s)` with a visible countdown. Never a modal mid-session.
- **Sound:** three cues, each under 120ms at 15% volume, mutable — node confirmed (soft sine blip), character interrupt (filtered knock), session end (two-tone descending). Duck the character's TTS 6dB while the user is speaking.
- **Favicon:** a single amber node on `#0D0F11`, switching to green while a session is live. OG image: the graph mid-crystallization with the tagline in JetBrains Mono, 1200×630 on `#08090A`.
- **Micro-copy:** terse, second person. Labels shout in mono (`SESSION 04 · ENTROPY`); prose is plainspoken. "you never explained why it's irreversible" beats "Knowledge gap detected." No "Oops!", no exclamation marks, no em-dash-heavy AI cadence. Character lines stay in voice — grandma says "slow down, dear"; the manager says "so what do I tell the board." Mirror every new string into German in `strings.js`.

## 12. Things that will make me reject the work

A uniform `0.3s ease` on everything, with no hierarchy between a hover and a view transition. Violet→blue gradients. Gradient text on headings. Emoji as icons, or icons mixed across two families. A centred hero with three feature cards. A bouncing scroll arrow or "Scroll to explore." Everything fading up 20px, including elements already in the initial viewport. Counters that re-count on every scroll-in. `ease-out-back` as a global default. Full-page confetti. Glass with no border and no shadow over a flat background. 16px body text and 72px headings with no scale in between. Perfectly even 24px padding everywhere and zero asymmetry. Animations that replay on scroll-direction change. Dark mode that's `#000` and pure `#fff`.

## 13. How to work

Stage the build and keep the app running and demo-able after every stage:

1. Tokens, fonts, grain, global motion module, the rAF ticker, reduced-motion plumbing.
2. Extract the three views into files. No visual change yet. Verify nothing broke.
3. Session view — it's the hero and the demo spends most of its time there. Graph, then waveform, then the Crystallization moment, then the Interruption.
4. Recap — verdict screen, timeline ribbon, blind-spot reveal, receipt.
5. Landing, topic picker, character select.
6. Perf pass at 4× throttle, a11y pass, `?safe` verification, then a full run through `DEMO.md`'s script start to finish.

After each stage, tell me in two or three sentences what changed and what you're uncertain about. Where a design decision is genuinely ambiguous, pick the more restrained option and flag it — don't stall, and don't ask me four questions at once.

Show me stage 1 and your file map before writing anything else.

Two things worth knowing before you fire it off: this is a substantial refactor of a working demo, and your memory notes say the rehearsal isn't done yet. The prompt stages the work so the app stays runnable after each step and ends with a full DEMO.md run-through — but if you'd rather not touch the session view before rehearsing, tell Claude to do stages 1–2 and 5 only.