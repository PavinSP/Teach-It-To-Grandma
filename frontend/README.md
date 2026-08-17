# Frontend

React + Vite. The whole interface: the arrival screen, the landing page, the
live voice session, the recap, and the two-player quiz.

```bash
npm install
npm run dev          # http://localhost:5173
```

It needs the API running too — `cd ../server && npm run dev` — and finds it on
`localhost:3001` automatically in development. To point at a deployed server
instead, set `VITE_GRADING_API` in `.env.local`.

See the [root README](../README.md) for what this is and how the pieces fit.

## Layout

| | |
|---|---|
| `views/` | the five top-level screens: Intro, Landing, Session, Recap, Quiz |
| `components/` | reusable pieces — the jargon ledger, theme toggle, key prompt, loading state |
| `styles/` | `tokens.css` and `theme.css` hold every colour; no component stylesheet contains a literal |
| `motion/` | the shared animation loop and reduced-motion handling, behind one barrel file |
| `strings.js` | every user-facing string, English and German |
| `features.js` | the flags, switchable from the URL — see the root README |
| `characters.js` | the six learners: voices, personas, grading strictness |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the built output locally |
| `npm run lint` | ESLint |

`npm run lint` currently reports pre-existing errors in `App.jsx` — mostly
`react-hooks` rules around setting state in effects. They are longstanding, the
build passes, and none of them affect behaviour. Worth fixing; not worth
blocking on.
