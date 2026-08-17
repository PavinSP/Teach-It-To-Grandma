import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import {
  createTeachoff,
  getTeachoff,
  addRun,
  rankedRuns,
  backend,
  createQuizGame,
  getQuizMeta,
  getQuizLive,
  setQuizField,
  setQuizFieldOnce,
  getQuizAudio,
  putQuizAudio,
} from "./store.js";
import { speak, voiceConfigured } from "./tts.js";

// The key lives in the project root .env, one level up from server/.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const PORT = process.env.PORT || 3001;

// Any OpenAI-compatible provider, not just the one this was built against.
//
// TitanomGPT is OpenAI-compatible, so the OpenAI SDK works against it once the
// base URL is swapped — and the same is true of OpenAI itself, OpenRouter,
// Groq, Together, a local Ollama, or anything else speaking that protocol. The
// URL was hardcoded here, which meant the app could only ever be run by
// somebody holding a key from one particular German startup. That is a strange
// thing to require of a public repository, and it stopped being theoretical
// the day this deploy's own key was archived.
//
// So the provider is three environment variables: where to send the request,
// and which model does the fast and the slow work. Change all three together —
// a base URL from one provider and a model name from another authenticates
// fine and then fails on an unknown model, which is a confusing way to
// discover a configuration mistake.
const DEFAULT_BASE_URL = "https://api.deutschlandgpt.de/v2";

const BASE_URL = process.env.AI_BASE_URL || DEFAULT_BASE_URL;
// Measured on this project's own test cases, not chosen by reputation.
//
// gemini-3.1-flash-lite grades the jargon-stuffed answer at 1/4 and the
// genuinely good one at 4/4, four runs each, at 1.7s — versus ~9s for
// claude-4.5-sonnet at the same verdicts. Two faster models were tried and
// rejected outright: claude-4.5-haiku passed the vague answer 3/4 and
// gpt-5.4-mini passed it 4/4. A grader that rubber-stamps jargon destroys
// the one thing this product claims.
//
// Judgement-heavy work (the jury's distinct personas, the closed-world
// recall) stays on the stronger model, where a wrong answer is subtle
// rather than obvious.
const FAST_MODEL = process.env.FAST_MODEL || "gemini-3.1-flash-lite";
const DEEP_MODEL = process.env.DEEP_MODEL || "claude-4.5-sonnet";
const MODEL = FAST_MODEL;

// AI_API_KEY is the name to use; TITANOM_API_KEY still works so an existing
// deployment does not break the moment this lands.
const apiKey = process.env.AI_API_KEY || process.env.TITANOM_API_KEY;

// No longer fatal. A deploy whose own key has expired is still worth serving:
// the quiz's stored games, the teach-off boards and every screen that does not
// call a model keep working, and a visitor carrying their own key can use the
// rest. Refusing to boot would take all of that down too.
if (!apiKey) {
  console.warn(
    "No AI_API_KEY set. Model-backed features will only work for callers who bring their own key."
  );
}

const client = apiKey ? new OpenAI({ apiKey, baseURL: BASE_URL }) : null;

// A caller may bring their own key, which is what keeps this demo usable after
// the key it shipped with is archived — as happened.
//
// The rules that make that safe are all about NOT keeping it. The key arrives
// on a header, is used to build a client for the life of one request, and is
// dropped when the request ends. It is never written to Redis, never persisted
// to disk, never put in a log line, and never echoed back in a response. There
// is nowhere in this process it outlives the call it came in on.
//
// It is also never accepted over anything but the app's own origins, because
// the CORS allowlist above runs first.
// A key alone is not enough to identify a provider, so the caller sends all
// three: the key, where to send it, and what to call the model. An OpenAI key
// posted at a German endpoint authenticates against nothing, and a valid key
// with the wrong model name fails on the first request — both look like "your
// key is broken" to somebody who just pasted a working key.
const BYO_HEADER = "x-titanom-key";
const BYO_BASE_HEADER = "x-ai-base-url";
const BYO_MODEL_HEADER = "x-ai-model";

// Only http(s), and only an absolute URL. This value is used to build an
// outbound request, so anything else is a request to make this server fetch
// something on the caller's behalf.
function suppliedBase(req) {
  const raw = String(req.get(BYO_BASE_HEADER) ?? "").trim();

  if (!raw) {
    return BASE_URL;
  }

  try {
    const url = new URL(raw);

    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString().replace(/\/+$/, "")
      : BASE_URL;
  } catch {
    return BASE_URL;
  }
}

// The model the caller's key can actually reach. Falls back to the server's
// own choice when unset, which is right for a visitor using the deploy's key.
function suppliedModel(req, fallback) {
  const raw = String(req.get(BYO_MODEL_HEADER) ?? "").trim();

  // Model names are short identifiers; anything long is not one.
  return raw && raw.length <= 100 ? raw : fallback;
}

function clientFor(req) {
  const supplied = String(req.get(BYO_HEADER) ?? "").trim();

  if (supplied) {
    // Built per request and thrown away with it. Deliberately not cached by
    // key: a cache keyed on a secret is a store of secrets.
    return new OpenAI({ apiKey: supplied, baseURL: suppliedBase(req) });
  }

  return client;
}

// Every route resolves its model through this, so a visitor's chosen model
// reaches the request that uses their key.
function modelFor(req, tier = "fast") {
  return suppliedModel(req, tier === "deep" ? DEEP_MODEL : MODEL);
}

// The distinction a caller needs: "this deploy has no working key" is a
// different problem from "your topic failed", and only one of them is fixable
// by the person reading the message.
// An archived, revoked or plain wrong key is not a failed request — it is a
// deploy that cannot serve anyone until somebody supplies a working key. The
// two need telling apart, because only one of them is fixable by the person
// reading the message, and the provider reports it as an ordinary 401.
function isKeyProblem(err) {
  const status = err?.status ?? err?.response?.status;
  const text = String(err?.message ?? "").toLowerCase();

  return (
    status === 401 ||
    status === 403 ||
    text.includes("archived") ||
    text.includes("invalid api key") ||
    text.includes("incorrect api key")
  );
}

function noKey(res) {
  return res.status(503).json({
    error:
      "This demo's own API key is no longer active. Pick a provider and paste your own key to carry on — it stays in your browser and is never stored.",
    needsKey: true,
  });
}

// Languages a lesson can be taught in. Validated against this list before
// a code ever reaches a prompt.
const LANGUAGES = { en: "English", de: "German" };

function languageName(code) {
  return LANGUAGES[code] ?? null;
}

// Appended to any prompt producing text the student reads. The keyword
// clause is load-bearing: German labels with English keywords would leave
// the live coverage bar permanently at zero.
function inLanguage(code) {
  const name = languageName(code);

  if (!name || code === "en") {
    return "";
  }

  return `\n\nWrite EVERY string you return in ${name} — names, descriptions, point labels, reasons, summaries, questions and notes. The "keywords" must be in ${name} too, because that is the language the student will be speaking.`;
}

// Canned answers for the "they said nothing" paths. These return without
// ever calling the model, so inLanguage() — which only appends to a prompt —
// cannot reach them. Left untranslated they were the one thing that flipped
// a German recap back to English, and an empty lesson is not exotic: it is
// what a dead microphone or an early "Finish" produces.
const EMPTY_COPY = {
  en: {
    nothingSaid: "The student did not say anything about this.",
    noExplanation: (who) => `${who} didn't hear an explanation yet.`,
    toldNothing: (who) =>
      who === "Grandma"
        ? "You haven't told me anything yet, darling."
        : "You haven't told me anything yet.",
    neverMentioned: "Never mentioned.",
  },
  de: {
    nothingSaid: "Dazu hast du nichts gesagt.",
    noExplanation: (who) => `${who} hat noch keine Erklärung gehört.`,
    toldNothing: (who) =>
      who === "Grandma"
        ? "Du hast mir noch nichts erzählt, mein Schatz."
        : "Du hast mir noch nichts erzählt.",
    neverMentioned: "Gar nicht erwähnt.",
  },
};

function emptyCopy(code) {
  return EMPTY_COPY[code] ?? EMPTY_COPY.en;
}

const app = express();

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

// A browser's Origin header never carries a trailing slash or a path, but
// the value people paste out of an address bar usually does. Matching them
// raw turns one invisible character into a site where every button silently
// does nothing, so normalise both sides instead.
function normaliseOrigin(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map(normaliseOrigin).filter(Boolean)
  : DEV_ORIGINS;

// Only the app's own origins — an open CORS policy plus an unauthenticated
// endpoint that spends API credits is an invitation.
app.use(
  cors({
    // Without naming it here the browser's preflight refuses the request and
    // a visitor's own key never reaches the server at all.
    allowedHeaders: [
      "Content-Type",
      "x-titanom-key",
      "x-ai-base-url",
      "x-ai-model",
    ],
    origin(origin, callback) {
      // No Origin header at all is curl, a health check, or a same-origin
      // request. None of those are the attack this list exists to stop.
      if (!origin || ALLOWED_ORIGINS.includes(normaliseOrigin(origin))) {
        return callback(null, true);
      }

      callback(null, false);
    },
  })
);

app.use(express.json({ limit: "1mb" }));

// Every TitanomGPT-backed endpoint spends money on arbitrary input, so
// each IP gets a budget: 30 requests per 5 minutes, then 429.
const rateWindows = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const window = rateWindows.get(key);

  if (!window || now - window.startedAt > 5 * 60 * 1000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }

  window.count++;

  if (window.count > 30) {
    return res
      .status(429)
      .json({ error: "Too many requests — take a breath and try again." });
  }

  next();
}

// Sweep stale windows occasionally so the map can't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;

  for (const [key, window] of rateWindows) {
    if (window.startedAt < cutoff) {
      rateWindows.delete(key);
    }
  }
}, 60 * 1000).unref();

// Reports which teach-off store is live, because "codes don't work across
// devices" and "the deploy is reading the local file" are the same bug, and
// this is the fastest way to tell them apart from a phone.
// Reports which teach-off store is live, and which origins the browser is
// allowed to call from. Both are things that fail silently and invisibly:
// "codes don't work across devices" and "the deploy is reading a local
// file" are the same bug, and a CORS mismatch looks exactly like a dead
// button. Neither value is a secret — the allowlist is public by
// construction, since the browser is told it on every request.
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    store: backend,
    allowedOrigins: ALLOWED_ORIGINS,
    originConfigured: Boolean(process.env.ALLOWED_ORIGIN),
  });
});

// Turns any topic the student types into a lesson: what they should cover,
// how hard it is, and what people usually get wrong about it.
app.post("/api/lesson", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const topic = (req.body?.topic ?? "").trim();
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }

  if (!topic) {
    return res.status(400).json({ error: "Expected { topic }." });
  }

  if (topic.length > 120) {
    return res.status(400).json({ error: "That topic is too long." });
  }

  const prompt = `A student wants to teach "${topic}" to someone who knows nothing about it, to find out whether they really understand it themselves.

Build the lesson plan.

Choose the 4 things the student must get across for a beginner to genuinely follow this topic. Pick the ideas the topic actually turns on, not trivia — if someone explained all 4 well, a beginner should walk away understanding it. Order them so each one builds on the last. Write each as a short noun phrase a student would recognise, like "Weights influence the output" or "Why the stopping condition matters".

For each of those, list the words or short phrases a student would almost certainly say while covering that ground. These only detect whether the subject came up at all, so favour the obvious, common wording, include plural and verb forms, and set "required" to how many of them must appear — usually 1, or 2 when a single word would be too easy to hit by accident.

Also name the misconceptions beginners most often hold about this topic.

For each point, also predict how likely a student is to explain it BADLY — "hardFor" is one of "easy", "tricky" or "hard". Judge on what makes people stumble when teaching it aloud: points that are easy to name but hard to mechanise are "hard"; points people usually parrot correctly are "easy". Give one short reason in "hardWhy" naming the specific trap.

Also assess the topic itself. "conceptDensity" is how many distinct ideas a beginner has to hold in their head at once — Low, Medium, or High. "prerequisites" is how much they need to already know before any of this can land — Low, Medium, or High. List 2-3 concrete things they'd need to already know in "prerequisiteNotes" (an empty list if there really are none).

Also write three challenges that would test whether a student really understands this topic rather than just reciting it. Each one must name a specific concept from the points above, not a generic instruction — "explain the learning rate without saying 'step'" is good, "explain it more simply" is not. Give each an id ("c1", "c2", "c3"), a kind (one of: analogy, five_year_old, no_jargon, real_world, opposite), a short label under 5 words for a button, and an instruction naming what Grandma should ask for.

If the topic is too vague to teach, or is not a real subject, set "ok" to false and say why in "problem" — otherwise set "ok" to true and leave "problem" empty.${inLanguage(language)}`;

  try {
    const completion = await ai.chat.completions.create({
      model: modelFor(req),
      max_completion_tokens: 1900,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lesson",
          schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              problem: { type: "string" },
              name: {
                type: "string",
                description: "The topic, tidied into a display name",
              },
              description: {
                type: "string",
                description:
                  "One sentence telling the student what to explain, e.g. 'Explain how a function can call itself.'",
              },
              difficulty: {
                type: "string",
                description: "Beginner, Intermediate or Advanced",
              },
              points: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    keywords: { type: "array", items: { type: "string" } },
                    required: { type: "number" },
                    hardFor: {
                      type: "string",
                      enum: ["easy", "tricky", "hard"],
                    },
                    hardWhy: { type: "string" },
                  },
                  required: ["label", "keywords", "required", "hardFor", "hardWhy"],
                  additionalProperties: false,
                },
              },
              misconceptions: { type: "array", items: { type: "string" } },
              analysis: {
                type: "object",
                properties: {
                  conceptDensity: {
                    type: "string",
                    enum: ["Low", "Medium", "High"],
                  },
                  prerequisites: {
                    type: "string",
                    enum: ["Low", "Medium", "High"],
                  },
                  prerequisiteNotes: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: [
                  "conceptDensity",
                  "prerequisites",
                  "prerequisiteNotes",
                ],
                additionalProperties: false,
              },
              challenges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    kind: {
                      type: "string",
                      enum: [
                        "analogy",
                        "five_year_old",
                        "no_jargon",
                        "real_world",
                        "opposite",
                      ],
                    },
                    label: { type: "string" },
                    instruction: { type: "string" },
                  },
                  required: ["id", "kind", "label", "instruction"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "ok",
              "problem",
              "name",
              "description",
              "difficulty",
              "points",
              "misconceptions",
              "analysis",
              "challenges",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const lesson = JSON.parse(raw);

    if (!lesson.ok) {
      return res.status(422).json({
        error: lesson.problem || "That topic can't be taught as a lesson.",
      });
    }

    if (!Array.isArray(lesson.points) || lesson.points.length === 0) {
      throw new Error("Model returned no learning points");
    }

    // A point whose `required` exceeds its keyword count could never be
    // ticked, which would strand the progress bar for the whole lesson.
    lesson.points = lesson.points.map((point) => {
      const keywords = (point.keywords ?? [])
        .map((keyword) => String(keyword).trim())
        .filter(Boolean);

      return {
        label: point.label,
        keywords,
        required: Math.min(Math.max(1, point.required ?? 1), keywords.length),
        hardFor: ["easy", "tricky", "hard"].includes(point.hardFor)
          ? point.hardFor
          : null,
        hardWhy: typeof point.hardWhy === "string" ? point.hardWhy : "",
      };
    });

    // These are additive to a screen that must never fail because of them,
    // so a malformed or missing value degrades to "nothing to show" rather
    // than breaking the response.
    lesson.analysis =
      lesson.analysis && typeof lesson.analysis === "object"
        ? lesson.analysis
        : null;

    lesson.challenges = Array.isArray(lesson.challenges)
      ? lesson.challenges.filter(
          (c) => c && typeof c.label === "string" && typeof c.instruction === "string"
        ).slice(0, 3)
      : [];

    res.json(lesson);
  } catch (err) {
    console.error("Lesson generation failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "Could not build a lesson for that topic." });
  }
});

// Judges whether the student genuinely explained each learning point,
// as opposed to merely saying the right keywords.
app.post("/api/grade", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  // `character` is strictly optional — a client that doesn't send it gets
  // the original Grandma behaviour, unchanged.
  const { topicName, points, transcript, character, ambushedMisconception } =
    req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }

  if (!topicName || !Array.isArray(points) || !Array.isArray(transcript)) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[] }." });
  }

  // Who was being taught, and how strictly they mark (#36). Without this,
  // choosing a harder character changes the questions but not the verdict —
  // which would make the characters cosmetic.
  const listenerName = character?.name || "Grandma";
  const audience =
    character?.audience || "a grandmother who knows nothing about the subject";
  const stanceLine = character?.gradingStance
    ? `\nGrade to this standard: ${character.gradingStance}\n`
    : "";

  const studentText = transcript
    .filter((line) => line.source === "user")
    .map((line) => line.message)
    .filter(Boolean)
    .join("\n");

  // The listener's side of the exchange — used only to pick out the
  // moments where they got stuck, never to judge the points.
  const listenerText = transcript
    .filter((line) => line.source === "ai")
    .map((line) => line.message)
    .filter(Boolean)
    .slice(-15)
    .join("\n");

  if (!studentText.trim()) {
    const copy = emptyCopy(language);

    return res.json({
      results: points.map((point) => ({
        point,
        understood: false,
        reason: copy.nothingSaid,
      })),
      summary: copy.noExplanation(listenerName),
      strongestMoment: { quote: "", why: "" },
      practiceThis: "",
      stumbles: [],
    });
  }

  const pointList = points.map((point, i) => `${i + 1}. ${point}`).join("\n");

  const prompt = `A student tried to explain "${topicName}" to ${audience}.

Here is everything the student said:
---
${studentText}
---

For each learning point below, decide whether the student GENUINELY explained the idea in a way that listener could follow. Saying a keyword is not enough — they must actually convey the concept.
${stanceLine}
${pointList}

Also report three teaching moments, each with the student's exact words as evidence:
- "simplifiedJargon": did the student replace a technical term with plain language, either unprompted or after being asked what a word meant?
- "selfCorrected": did the student catch and fix their own mistake mid-explanation?
- "usedGoodAnalogy": did the student give a genuine analogy that maps onto the concept? The filler word "like" on its own is not an analogy — there must be an actual comparison doing explanatory work.

For each moment, copy the student's exact phrase into "quote" when it happened, or leave "quote" empty when it did not.

Also pick the single best sentence the student actually said — the moment their teaching was at its clearest — and copy it VERBATIM into "strongestMoment.quote", with one short line in "strongestMoment.why" saying why it worked. If nothing stands out, leave both empty.

In "practiceThis", give ONE concrete action for next time — something they could do, like "Say what a gradient IS before you say what it does." Never restate a learning point as a topic name.

Here is what the listener said during the lesson:
---
${listenerText || "(the listener said nothing)"}
---

Also judge the DEPTH the explanation reached, as a ladder. Each rung requires the one below it:
- "named": they said what it is called, nothing more.
- "defined": they gave a definition — correct, but the kind you could memorise without understanding.
- "mechanism": they explained how it actually works, why one step leads to the next.
- "applied": they showed it working on a concrete case or example.
- "boundaries": they said when it fails, breaks down, or does not apply.
Set "depth.reached" to the highest rung genuinely earned. Set "depth.evidence" to the student's own words that earned it. Set "depth.next" to one sentence naming what the NEXT rung up would take. Be strict: a fluent definition is "defined", not "mechanism". Reciting a textbook line is "named" or "defined", never higher.

In "blindSpots", name up to 3 things that genuinely matter for understanding this topic which the student never touched at all — not points they explained badly, but ground they never went near. Phrase each as the thing itself ("where the training data comes from"), not as criticism. Empty list if they covered the ground.

In "stumbles", list up to 3 moments where the listener had to stop and ask what something meant or how it worked: copy the listener's question VERBATIM into "grandmaQuote", and put the single word or short phrase they were stuck on into "aboutTerm". Only real stops count — ordinary curiosity is not a stumble. Empty list if there were none.

In "turningPoints", pick up to 4 moments that decided how this lesson went, in the order they actually happened. For each, copy the student's exact sentence into "quote", and set "kind" to one of:
- "landed": the moment an idea genuinely clicked for ${listenerName}
- "lost": the moment ${listenerName} stopped being able to follow
- "recovered": the moment the student pulled it back after losing ${listenerName}
- "jargon": the moment an unexplained technical term entered the lesson
Write one short line in "note" saying what happened there, addressed to the student. Only genuine turning points count — a moment that changed nothing is not one. Empty list if the lesson had none.

In "headlines", write the line ${listenerName} would open their notes with — four versions of it, one for each level the lesson might have landed at. Each is spoken by ${listenerName} in the first person, is under 8 words, and sounds like ${audience} talking: their vocabulary, their concerns, the way they would actually put it.

Each line must point at something specific from THIS lesson — an analogy the student reached for, a word they leaned on, a step they skipped. Never a general statement about the topic that would fit any lesson about anything: "I finally understand neural networks!" is exactly the wrong shape.
- "aced": ${listenerName} genuinely followed all of it.
- "followed": ${listenerName} followed most of it, some parts still unclear.
- "partial": some of it landed and some did not.
- "lost": ${listenerName} could not follow the explanation.
Write all four regardless of how this lesson actually went — a later step measures the score and picks the one that matches. Never let a line claim more understanding than its own level allows: the "lost" line must sound genuinely unfollowing even if the student did something well along the way, and the "aced" line must not hedge.
${
  ambushedMisconception
    ? `\nMid-lesson, the listener deliberately claimed the following false belief to the student, as a test: "${ambushedMisconception}". In "misconceptionHandling", report whether the student noticed the claim was wrong ("noticed"), whether they explained why and gave the right version ("corrected"), and copy their exact correcting words into "quote" (empty if they never did). Agreeing with the claim, or ignoring it, counts as neither.\n`
    : ""
}

Respond with JSON only, in exactly this shape:
{
  "results": [
    { "point": "<the learning point, copied exactly>", "understood": true or false, "reason": "<one short sentence, addressed to the student in ${listenerName}'s own voice>" }
  ],
  "summary": "<two sentences in ${listenerName}'s own voice about how well they explained it overall>",
  "moments": {
    "simplifiedJargon": { "happened": true or false, "quote": "<their exact words, or empty>" },
    "selfCorrected": { "happened": true or false, "quote": "<their exact words, or empty>" },
    "usedGoodAnalogy": { "happened": true or false, "quote": "<their exact words, or empty>" }
  },
  "strongestMoment": { "quote": "<the student's exact sentence, or empty>", "why": "<one line, or empty>" },
  "practiceThis": "<one concrete action>",
  "stumbles": [ { "grandmaQuote": "<the listener's exact question>", "aboutTerm": "<the word they were stuck on>" } ],
  "turningPoints": [ { "quote": "<the student's exact sentence>", "kind": "landed|lost|recovered|jargon", "note": "<one short line>" } ],
  "headlines": { "aced": "<under 8 words, ${listenerName}'s voice>", "followed": "<under 8 words>", "partial": "<under 8 words>", "lost": "<under 8 words>" },
  "depth": { "reached": "named|defined|mechanism|applied|boundaries", "evidence": "<their exact words, or empty>", "next": "<one sentence>" },
  "blindSpots": [ "<something they never went near>" ]${
    ambushedMisconception
      ? `,\n  "misconceptionHandling": { "noticed": true or false, "corrected": true or false, "quote": "<their exact correcting words, or empty>" }`
      : ""
  }
}${inLanguage(language)}`;

  try {
    const completion = await ai.chat.completions.create({
      model: modelFor(req),
      // Note: TitanomGPT silently ignores max_tokens — it wants this name.
      max_completion_tokens: 1700,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grading",
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    point: { type: "string" },
                    understood: { type: "boolean" },
                    reason: { type: "string" },
                  },
                  required: ["point", "understood", "reason"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
              moments: {
                type: "object",
                properties: {
                  simplifiedJargon: {
                    type: "object",
                    properties: {
                      happened: { type: "boolean" },
                      quote: { type: "string" },
                    },
                    required: ["happened", "quote"],
                    additionalProperties: false,
                  },
                  selfCorrected: {
                    type: "object",
                    properties: {
                      happened: { type: "boolean" },
                      quote: { type: "string" },
                    },
                    required: ["happened", "quote"],
                    additionalProperties: false,
                  },
                  usedGoodAnalogy: {
                    type: "object",
                    properties: {
                      happened: { type: "boolean" },
                      quote: { type: "string" },
                    },
                    required: ["happened", "quote"],
                    additionalProperties: false,
                  },
                },
                required: [
                  "simplifiedJargon",
                  "selfCorrected",
                  "usedGoodAnalogy",
                ],
                additionalProperties: false,
              },
              strongestMoment: {
                type: "object",
                properties: {
                  quote: { type: "string" },
                  why: { type: "string" },
                },
                required: ["quote", "why"],
                additionalProperties: false,
              },
              practiceThis: { type: "string" },
              depth: {
                type: "object",
                properties: {
                  reached: {
                    type: "string",
                    enum: ["named", "defined", "mechanism", "applied", "boundaries"],
                  },
                  evidence: { type: "string" },
                  next: { type: "string" },
                },
                required: ["reached", "evidence", "next"],
                additionalProperties: false,
              },
              blindSpots: { type: "array", items: { type: "string" } },
              turningPoints: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    quote: { type: "string" },
                    kind: {
                      type: "string",
                      enum: ["landed", "lost", "recovered", "jargon"],
                    },
                    note: { type: "string" },
                  },
                  required: ["quote", "kind", "note"],
                  additionalProperties: false,
                },
              },
              headlines: {
                type: "object",
                properties: {
                  aced: { type: "string" },
                  followed: { type: "string" },
                  partial: { type: "string" },
                  lost: { type: "string" },
                },
                required: ["aced", "followed", "partial", "lost"],
                additionalProperties: false,
              },
              stumbles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    grandmaQuote: { type: "string" },
                    aboutTerm: { type: "string" },
                  },
                  required: ["grandmaQuote", "aboutTerm"],
                  additionalProperties: false,
                },
              },
              ...(ambushedMisconception
                ? {
                    misconceptionHandling: {
                      type: "object",
                      properties: {
                        noticed: { type: "boolean" },
                        corrected: { type: "boolean" },
                        quote: { type: "string" },
                      },
                      required: ["noticed", "corrected", "quote"],
                      additionalProperties: false,
                    },
                  }
                : {}),
            },
            required: [
              "results",
              "summary",
              "moments",
              "strongestMoment",
              "practiceThis",
              "stumbles",
              "depth",
              "blindSpots",
              "turningPoints",
              "headlines",
              ...(ambushedMisconception ? ["misconceptionHandling"] : []),
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const graded = JSON.parse(raw);

    // A moment's quote is shown to the student as their own words, so it has
    // to actually be their own words. A paraphrase the model invented gets
    // dropped; the moment itself survives without its quote.
    if (graded.moments && typeof graded.moments === "object") {
      const said = studentText.toLowerCase();

      for (const moment of Object.values(graded.moments)) {
        if (
          moment &&
          typeof moment.quote === "string" &&
          moment.quote &&
          !said.includes(moment.quote.toLowerCase())
        ) {
          moment.quote = "";
        }
      }
    } else {
      graded.moments = null;
    }

    {
      const said = studentText.toLowerCase();
      const heard = listenerText.toLowerCase();

      if (
        graded.strongestMoment &&
        graded.strongestMoment.quote &&
        !said.includes(graded.strongestMoment.quote.toLowerCase())
      ) {
        graded.strongestMoment = { quote: "", why: "" };
      }

      if (
        graded.depth &&
        typeof graded.depth.evidence === "string" &&
        graded.depth.evidence &&
        !said.includes(graded.depth.evidence.toLowerCase())
      ) {
        graded.depth.evidence = "";
      }

      graded.blindSpots = (graded.blindSpots ?? [])
        .filter((b) => typeof b === "string" && b.trim())
        .slice(0, 3);

      graded.stumbles = (graded.stumbles ?? [])
        .filter(
          (st) =>
            st &&
            typeof st.grandmaQuote === "string" &&
            st.grandmaQuote &&
            heard.includes(st.grandmaQuote.toLowerCase())
        )
        .slice(0, 3);

      // A turning point is placed on a timeline by finding its quote in the
      // transcript, so an invented quote has nowhere to sit. Unverified ones
      // are dropped rather than blanked — a marker with no words under it
      // would point at a moment that never happened.
      graded.turningPoints = (graded.turningPoints ?? [])
        .filter(
          (tp) =>
            tp &&
            typeof tp.quote === "string" &&
            tp.quote.trim() &&
            said.includes(tp.quote.toLowerCase()) &&
            ["landed", "lost", "recovered", "jargon"].includes(tp.kind)
        )
        .slice(0, 4);

      // The headline is the largest text on the recap, set in display type
      // that a long line would wreck. All four bands have to be present and
      // short or the whole set is dropped — the client's static table is the
      // floor, so half a set is worse than none. Truncating instead would
      // hang a cut-off sentence at 88px.
      const HEADLINE_BANDS = ["aced", "followed", "partial", "lost"];
      const written = graded.headlines;

      graded.headlines =
        written &&
        typeof written === "object" &&
        HEADLINE_BANDS.every(
          (band) =>
            typeof written[band] === "string" &&
            written[band].trim() &&
            written[band].trim().length <= 80
        )
          ? Object.fromEntries(
              HEADLINE_BANDS.map((band) => [band, written[band].trim()])
            )
          : null;
    }

    if (graded.misconceptionHandling) {
      const said = studentText.toLowerCase();
      const q = graded.misconceptionHandling.quote;

      if (typeof q === "string" && q && !said.includes(q.toLowerCase())) {
        graded.misconceptionHandling.quote = "";
      }
    }

    res.json(graded);
  } catch (err) {
    console.error("Grading failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "Grading failed." });
  }
});

// Grandma says back what she thinks she understood — using nothing but the
// student's own words. She is not allowed to repair a broken explanation,
// because the broken version is exactly what the student needs to see.
app.post("/api/explainback", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const { topicName, points, transcript, grandmaRecall, characterName } =
    req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }

  // Whoever is listening, the recall stays a closed world: they may only
  // use the student's own words. The Expert "knows things", but his recall
  // must not — otherwise the honesty invariant (the gap IS the product)
  // dies the moment a knowledgeable character is picked.
  const listener = characterName || "Grandma";

  if (!topicName || !Array.isArray(points) || !Array.isArray(transcript)) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[] }." });
  }

  // Lines tagged as prompts are ours, not the student's — they must never be
  // treated as part of the explanation.
  const studentText = transcript
    .filter((line) => line.source === "user" && line.meta !== "prompt")
    .map((line) => line.message)
    .filter(Boolean)
    .join("\n");

  if (!studentText.trim()) {
    const copy = emptyCopy(language);

    return res.json({
      recap: copy.toldNothing(listener),
      points: points.map((point) => ({
        point,
        recalled: "missing",
        grandmaSaid: "",
        gap: copy.neverMentioned,
      })),
      unexplainedTerms: [],
    });
  }

  const pointList = points.map((point, i) => `${i + 1}. ${point}`).join("\n");

  // She may already have said this out loud during the call. If so, analyse
  // her real words rather than inventing a second version that could
  // contradict what the student just heard.
  const spoken = typeof grandmaRecall === "string" && grandmaRecall.trim();

  const recallInstruction = spoken
    ? `You are ${listener}. A student has just finished explaining "${topicName}" to you, and you have already said back what you understood. Here is what you said:
---
${grandmaRecall.trim()}
---

Here is everything the student actually told you:
---
${studentText}
---

Copy your own words above into "recap" exactly as they are. Do not rewrite them.`
    : `You are ${listener}. For this exercise you know nothing whatsoever about "${topicName}" beyond what this student just told you — whatever you might know in real life, none of it exists here. Everything you know about it is written between the markers below. Nothing outside the markers exists to you.

---
${studentText}
---

In "recap", say back in your own plain words what you think you understood.

Rules you must not break:
1. Use only what is between the markers. Never add a fact, number, term, or example that is not there.
2. Never correct the student. Never teach. You could not if you wanted to — you only just heard about this.
3. If the student used a word without explaining it, keep the word but say plainly that you don't know what it means: "something about a gradient — I don't know what that is, you never said."
4. If they skipped a step, say the step is missing. Do not guess it.
5. If your version comes out wrong because their explanation was wrong or unclear, LEAVE IT WRONG. That is the point. Do not fix it.
6. Do not reason about whether what they told you sounds sensible. Never say what something "usually" is, what you "would expect", or that something seems odd — you have no expectations, because you have never heard of any of this. You may say you are confused; you may not say what the right answer would look like.
7. Warm and ordinary, about 120 words. No bullet points, no lecturing.`;

  const prompt = `${recallInstruction}

Then, for each learning point below, say whether what you took away is right ("correct"), muddled or only half there ("garbled"), or absent because they never told you ("missing").

${pointList}

Put the words you used for it in "grandmaSaid". In "gap", name what they left out, in one short line — leave it empty when the point is correct.

Finally, in "unexplainedTerms", list every word the student used but never explained to you. Copy those words exactly as the student said them. If they explained everything, return an empty list.${inLanguage(language)}`;

  try {
    const completion = await ai.chat.completions.create({
      // The closed world is the hard part: she must reproduce only what
      // she was told, and a weaker model quietly repairs the gaps.
      model: modelFor(req, "deep"),
      max_completion_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "explainback",
          schema: {
            type: "object",
            properties: {
              recap: { type: "string" },
              points: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    point: { type: "string" },
                    recalled: {
                      type: "string",
                      enum: ["correct", "garbled", "missing"],
                    },
                    grandmaSaid: { type: "string" },
                    gap: { type: "string" },
                  },
                  required: ["point", "recalled", "grandmaSaid", "gap"],
                  additionalProperties: false,
                },
              },
              unexplainedTerms: { type: "array", items: { type: "string" } },
            },
            required: ["recap", "points", "unexplainedTerms"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const parsed = JSON.parse(raw);

    // Every term she claims the student left undefined has to actually be a
    // word the student said. Anything else is the model inventing evidence,
    // and it gets dropped rather than shown.
    const said = studentText.toLowerCase();

    parsed.unexplainedTerms = (parsed.unexplainedTerms ?? []).filter(
      (term) => typeof term === "string" && said.includes(term.toLowerCase())
    );

    res.json(parsed);
  } catch (err) {
    console.error("Explain-back failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "Explain-back failed." });
  }
});

// Diagnoses the one weakness that actually shows up in this lesson, and for
// jargon specifically, builds a banned-word list the student can be held to
// on a re-run — enforced live, client-side, against words they used.
app.post("/api/challenge", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const {
    topicName,
    points,
    transcript,
    unexplainedTerms,
    priorWeakness,
    characterName,
  } = req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }

  const coach = characterName || "Grandma";

  if (!topicName || !Array.isArray(points) || !Array.isArray(transcript)) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[] }." });
  }

  const studentText = transcript
    .filter((line) => line.source === "user" && line.meta !== "prompt")
    .map((line) => line.message)
    .filter(Boolean)
    .join("\n");

  if (!studentText.trim()) {
    return res.status(422).json({
      error: "There's nothing to diagnose yet — teach a lesson first.",
    });
  }

  const pointList = points.map((point, i) => `${i + 1}. ${point}`).join("\n");

  const terms = Array.isArray(unexplainedTerms) ? unexplainedTerms : [];
  const termsLine = terms.length
    ? `\nWords the student used but never defined: ${terms.join(", ")}.`
    : "";

  const priorLine = priorWeakness
    ? `\nThis student's recurring weakness across recent sessions has been "${priorWeakness}". Prefer targeting that again unless this transcript clearly points somewhere else.`
    : "";

  const prompt = `A student just tried to explain "${topicName}" to a listener called ${coach}.

Here is everything the student said:
---
${studentText}
---

The learning points they were meant to cover:
${pointList}${termsLine}${priorLine}

Diagnose the ONE weakness that best explains where this explanation fell short, choosing exactly one of: "jargon" (leans on technical words without explaining them), "missing-steps" (skips the reasoning between ideas), "no-examples" (stays abstract, never grounds it in something concrete), "too-abstract" (correct but never made tangible).

Then design a short re-run challenge that specifically targets that weakness. If the weakness is "jargon", list 3-5 banned terms the student must avoid on the re-run — every one of these MUST be a word or short phrase the student actually said above, copied exactly. If the weakness is anything else, return an empty bannedTerms list.

Respond with JSON only, in exactly this shape:
{
  "weakness": "jargon" | "missing-steps" | "no-examples" | "too-abstract",
  "diagnosis": "<one or two sentences, addressed to the student in ${coach}'s own voice, naming the actual pattern>",
  "challengeTitle": "<a short punchy name for the re-run, 2-5 words>",
  "instruction": "<one sentence telling the student what to do differently this time>",
  "bannedTerms": ["<word actually used above>", "..."],
  "successCriterion": "<one sentence describing what success on the re-run looks like>"
}${inLanguage(language)}`;

  try {
    const completion = await ai.chat.completions.create({
      model: modelFor(req),
      max_completion_tokens: 600,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "challenge",
          schema: {
            type: "object",
            properties: {
              weakness: {
                type: "string",
                enum: ["jargon", "missing-steps", "no-examples", "too-abstract"],
              },
              diagnosis: { type: "string" },
              challengeTitle: { type: "string" },
              instruction: { type: "string" },
              bannedTerms: { type: "array", items: { type: "string" } },
              successCriterion: { type: "string" },
            },
            required: [
              "weakness",
              "diagnosis",
              "challengeTitle",
              "instruction",
              "bannedTerms",
              "successCriterion",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const parsed = JSON.parse(raw);

    // A banned term the student never actually said is an unfair, unwinnable
    // constraint — it can never be enforced live, since it will never appear
    // in the transcript to flag.
    const said = studentText.toLowerCase();

    parsed.bannedTerms = (parsed.bannedTerms ?? []).filter(
      (term) => typeof term === "string" && said.includes(term.toLowerCase())
    );

    res.json(parsed);
  } catch (err) {
    console.error("Challenge generation failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "Could not build a challenge." });
  }
});

// The jury: four listeners judge ONE explanation through their own
// lenses, in parallel. Not four opinions of the same thing — the Expert
// marks precision, the Child marks whether it was made tangible, and a
// wide spread between them is itself the finding.
app.post("/api/jury", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const { topicName, points, transcript, jurors } = req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }


  if (
    !topicName ||
    !Array.isArray(points) ||
    !Array.isArray(transcript) ||
    !Array.isArray(jurors) ||
    jurors.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[], jurors[] }." });
  }

  const studentText = transcript
    .filter((line) => line.source === "user" && line.meta !== "prompt")
    .map((line) => line.message)
    .filter(Boolean)
    .join("\n");

  if (!studentText.trim()) {
    return res.status(422).json({ error: "There's nothing to judge yet." });
  }

  const pointList = points.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const judge = async (juror) => {
    const prompt = `A student explained "${topicName}" to ${juror.audience}.

Here is everything the student said:
---
${studentText}
---

The four things worth getting across:
${pointList}

You are ${juror.name}. Judge this explanation ONLY as you would, by your own standard: ${juror.gradingStance}

Give "score" out of 100 by that standard alone — do not moderate toward what another kind of listener would say. Then one sentence in your own voice saying what decided it, and the single word or short phrase that most defines your verdict as "headline".${inLanguage(language)}`;

    const completion = await ai.chat.completions.create({
      // Four jurors have to stay four distinct people, not one voice with
      // four scores — that separation is what the panel is for.
      model: modelFor(req, "deep"),
      max_completion_tokens: 300,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "verdict",
          schema: {
            type: "object",
            properties: {
              score: { type: "number" },
              headline: { type: "string" },
              verdict: { type: "string" },
            },
            required: ["score", "headline", "verdict"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);

    return {
      id: juror.id,
      name: juror.name,
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      headline: parsed.headline,
      verdict: parsed.verdict,
    };
  };

  try {
    // In parallel: four sequential calls would make the panel feel slow
    // on a screen the student is already waiting on.
    const settled = await Promise.allSettled(
      jurors.slice(0, 6).map((j) => judge(j))
    );

    const verdicts = settled
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    if (verdicts.length === 0) {
      throw new Error("Every juror failed");
    }

    // The spread is the point: agreement means the explanation worked for
    // everyone, a wide gap means it only worked for some kinds of listener.
    const scores = verdicts.map((v) => v.score);
    const spread = Math.max(...scores) - Math.min(...scores);

    res.json({
      verdicts,
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      spread,
      toughest: verdicts.reduce((a, b) => (b.score < a.score ? b : a)).name,
      kindest: verdicts.reduce((a, b) => (b.score > a.score ? b : a)).name,
    });
  } catch (err) {
    console.error("Jury failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "The jury couldn't reach a verdict." });
  }
});

// Mirror mode (#10): the listener retells the topic as numbered claims,
// a fixed number of them deliberately wrong — planted from the lesson's
// own misconceptions, never from material the student skipped. The client
// scores the flagging itself (it knows which claims were planted), so
// this endpoint runs once per game, before it starts.
app.post("/api/mirror", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const {
    topicName,
    points,
    transcript,
    misconceptions,
    characterName,
    errorCount,
  } = req.body ?? {};
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return res.status(400).json({ error: "Unsupported language." });
  }


  if (!topicName || !Array.isArray(points) || !Array.isArray(transcript)) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[] }." });
  }

  const listener = characterName || "Grandma";
  const wanted = Math.min(Math.max(1, errorCount ?? 2), 3);

  const studentText = transcript
    .filter((line) => line.source === "user" && line.meta !== "prompt")
    .map((line) => line.message)
    .filter(Boolean)
    .join("\n");

  if (!studentText.trim()) {
    return res
      .status(422)
      .json({ error: "There's nothing to retell yet — teach a lesson first." });
  }

  const pool = (Array.isArray(misconceptions) ? misconceptions : [])
    .filter((m) => typeof m === "string" && m.trim())
    .slice(0, 6);

  const prompt = `You are ${listener}. A student just explained "${topicName}" to you. Here is everything they said:
---
${studentText}
---

Retell the topic back to them as exactly 6 short claims, each one sentence in your own plain voice. Exactly ${wanted} of the claims must be WRONG; the other ${6 - wanted} must be faithful paraphrases of what the student actually said.

The wrong claims must be drawn from these known beginner misconceptions — reworded into your voice, but keeping the same false idea:
${pool.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Rules:
- Never invent an error about material the student did not cover — a wrong claim must contradict something they actually taught, or be one of the misconceptions above.
- Each wrong claim is wrong in ONE specific, correctable way. Nothing arguable, nothing subtle to the point of debate.
- For every claim, "why" explains in one line what makes it right or wrong. For correct claims, "why" may be one short line confirming the source in the student's words.

Respond with JSON only:
{
  "intro": "<one line in ${listener}'s voice offering to tell it back>",
  "claims": [
    { "id": "c1", "text": "<the claim>", "isWrong": true or false, "why": "<one line>" }
  ]
}${inLanguage(language)}`;

  try {
    const completion = await ai.chat.completions.create({
      model: modelFor(req),
      max_completion_tokens: 900,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mirror",
          schema: {
            type: "object",
            properties: {
              intro: { type: "string" },
              claims: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    isWrong: { type: "boolean" },
                    why: { type: "string" },
                  },
                  required: ["id", "text", "isWrong", "why"],
                  additionalProperties: false,
                },
              },
            },
            required: ["intro", "claims"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const parsed = JSON.parse(raw);
    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    const wrongCount = claims.filter((c) => c.isWrong).length;

    // A game with zero planted errors is unplayable, and one with too many
    // is unscoreable chaos. Retry once before giving up.
    if (claims.length < 4 || wrongCount < 1 || wrongCount > 3) {
      throw new Error(
        `Model returned ${claims.length} claims with ${wrongCount} wrong`
      );
    }

    res.json(parsed);
  } catch (err) {
    console.error("Mirror generation failed:", err);
    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res.status(502).json({ error: "Could not build the retelling." });
  }
});

// Turns a photo into avatar-builder SETTINGS — never into an image. The
// model only chooses which of the existing dials best match, so the result is
// always the same Open Peeps art the manual builder already produces and can
// never come back off-style.
//
// The photo is used for exactly one request and then dropped: never written
// to disk, never logged, never attached to a lesson or a teach-off.
app.post("/api/face", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const { image, options } = req.body ?? {};

  if (
    typeof image !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(image)
  ) {
    return res
      .status(400)
      .json({ error: "Expected { image } as a PNG, JPEG or WebP data URL." });
  }

  // express.json caps the body at 1mb. Catching it here leaves room for the
  // option lists and says something the client can act on, rather than
  // failing inside the body parser with nothing useful attached.
  if (image.length > 700000) {
    return res
      .status(413)
      .json({ error: "That photo is too large — resize it and try again." });
  }

  // The enums are built from the client's own option lists rather than a copy
  // kept here, so this schema cannot drift away from the builder. A value the
  // builder doesn't know is therefore unrepresentable, not merely unlikely.
  const DIALS = ["skin", "head", "facialHair", "accessories", "face"];
  const lists = {};

  for (const dial of DIALS) {
    const values = options?.[dial];

    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.length > 40 ||
      !values.every((v) => typeof v === "string" && v.length <= 40)
    ) {
      return res
        .status(400)
        .json({ error: `Expected options.${dial} as a list of option values.` });
    }

    lists[dial] = values;
  }

  // Note: TitanomGPT rejects an empty string inside a JSON-schema enum with a
  // bare 500, and two of these dials use "" for "none". Swapping in a
  // sentinel keeps the quirk here rather than forcing the client to send
  // option values that don't match its own builder.
  const NONE = "__none__";
  const wire = Object.fromEntries(
    DIALS.map((dial) => [dial, lists[dial].map((v) => (v === "" ? NONE : v))])
  );

  const prompt = `Someone is building a cartoon avatar of themselves in an illustrated style, and has supplied a photo to start from.

For each setting below, choose the value from its own list that best matches the photo, so the finished cartoon resembles them. This is a styling choice for that person's own avatar — pick the closest available option rather than describing or identifying anyone.

skin — skin tone swatch: ${lists.skin.join(", ")}
head — hair style, or a head covering: ${lists.head.join(", ")}
facialHair — "${NONE}" means clean-shaven: ${wire.facialHair.join(", ")}
accessories — glasses; "${NONE}" means none: ${wire.accessories.join(", ")}
face — expression: ${lists.face.join(", ")}

Where something is not visible, or you are unsure, choose the most neutral option in that list rather than guessing. Never return a value that is not in its list.`;

  try {
    const completion = await ai.chat.completions.create({
      model: modelFor(req),
      max_completion_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "avatar",
          schema: {
            type: "object",
            properties: Object.fromEntries(
              DIALS.map((dial) => [dial, { type: "string", enum: wire[dial] }])
            ),
            required: DIALS,
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    const parsed = JSON.parse(raw);

    for (const dial of DIALS) {
      if (parsed[dial] === NONE) {
        parsed[dial] = "";
      }
    }

    // The schema should already guarantee this, but the avatar is written to
    // the student's saved profile — an unrecognised value there would render
    // a broken face until they cleared their storage.
    for (const dial of DIALS) {
      if (!lists[dial].includes(parsed[dial])) {
        throw new Error(`Model returned an unknown value for ${dial}`);
      }
    }

    res.json({
      params: Object.fromEntries(DIALS.map((dial) => [dial, parsed[dial]])),
    });
  } catch (err) {
    // Deliberately does not log the error object — on a vision call it can
    // carry the request body, and that body is someone's photograph.
    console.error("Face matching failed:", err.message);
    res.status(502).json({ error: "Could not read that photo." });
  }
});

// ---------------------------------------------------------------------
// Teach-off (#34): several people teach the SAME stored lesson in turn.
// The lesson generator is non-deterministic, so the second player must
// fetch player one's exact lesson — regenerating it would make the two
// scores incomparable.

app.post("/api/teachoff", async (req, res) => {
  const lesson = req.body?.lesson;

  if (!lesson || !Array.isArray(lesson.points) || !lesson.name) {
    return res.status(400).json({ error: "Expected { lesson }." });
  }

  const entry = await createTeachoff(lesson);

  res.json({ code: entry.code, lesson: entry.lesson });
});

app.get("/api/teachoff/:code", async (req, res) => {
  const entry = await getTeachoff(req.params.code.toUpperCase());

  if (!entry) {
    return res.status(404).json({ error: "No teach-off with that code." });
  }

  res.json({
    code: entry.code,
    lesson: entry.lesson,
    runCount: entry.runs.length,
  });
});

app.post("/api/teachoff/:code/runs", async (req, res) => {
  const { player, score, understoodCount, totalPoints, summary } =
    req.body ?? {};

  if (typeof player !== "string" || !player.trim() || typeof score !== "number") {
    return res.status(400).json({ error: "Expected { player, score }." });
  }

  const runs = await addRun(req.params.code.toUpperCase(), {
    // Rendered as text by React, but cap and trim it anyway.
    player: player.trim().slice(0, 24),
    score: Math.max(0, Math.min(100, Math.round(score))),
    understoodCount: understoodCount ?? null,
    totalPoints: totalPoints ?? null,
    summary: typeof summary === "string" ? summary.slice(0, 200) : "",
  });

  if (!runs) {
    return res.status(404).json({ error: "No teach-off with that code." });
  }

  res.json({ ok: true, runs });
});

app.get("/api/teachoff/:code/runs", async (req, res) => {
  const entry = await getTeachoff(req.params.code.toUpperCase());

  if (!entry) {
    return res.status(404).json({ error: "No teach-off with that code." });
  }

  res.json({ code: entry.code, runs: rankedRuns(entry) });
});

// ---------------------------------------------------------------------------
// The quiz game (#side mode). Deliberately a different measurement from the
// rest of this app: a lesson asks whether you can explain something, a quiz
// asks whether you can recognise the right answer under time pressure. Those
// are not the same thing and the product's whole argument is that they are
// not — so this lives beside the teaching flow, never in front of it.
//
// Questions are generated per topic, the same way lessons are, so the game
// works for anything somebody names rather than a fixed bank.

const QUIZ_COUNT = 15;

// Generation lives in a function rather than inside the route because the
// game creates its questions the same way a bare /api/quiz call does, and
// two copies of this prompt would drift apart the first time either was
// tuned. Throws with .status set, so both callers can pass the distinction
// between "that topic is not quizzable" and "something broke" straight on.
async function generateQuiz(topic, language, ai, model = MODEL) {
  const prompt = `Write ${QUIZ_COUNT} multiple-choice questions about "${topic}" for a fast two-player game. Both players hear each question read aloud and then race to tap an answer, so every question must work when HEARD rather than read.

Keep each question under 18 words and answerable in a few seconds. Four options, each under 8 words.

THE FOUR OPTIONS MUST BE THE SAME KIND OF THING. Four organelles, or four gases, or four colours — never a mix of categories, and never a yes/no question padded out with adverbs. "Do plants only photosynthesise? No / Only at night / Yes / Never" is exactly the failure: heard aloud at speed it is noise. If the four options do not belong to one category, the question is wrong and you must rewrite it.

THE QUESTION MUST HAVE EXACTLY ONE DEFENSIBLE ANSWER. A knowledgeable person should not be able to argue for a second option. Do not ask a broad question and then reward a narrow step inside it — "what is the process of making food?" is answered by photosynthesis, not by one stage of it, so if your intended answer is a stage then ask about the stage.

Make exactly 5 of the ${QUIZ_COUNT} tricky, and set "tricky" true on precisely those.

A tricky question is one where THE MISCONCEPTION IS ON SCREEN AND IS THE MOST TEMPTING OPTION. Test it like this: if a room of reasonably informed people answered fast, most of them would pick the wrong one. If the correct answer is also the obvious answer, the question is not tricky, however neatly you can name a misconception afterwards.

"Which gas do plants release?" is NOT tricky — oxygen is correct and obvious, and nobody was ever going to pick helium. "Which colour of light do plants use LEAST?" IS tricky, because green is correct and almost everyone expects the opposite. "Which molecule powers the Calvin cycle?" is NOT tricky — it is recall with a long word in it.

Build each tricky question backwards: start from a wrong belief people actually defend out loud, make that belief one of the four options, and write the question so that belief looks right.

Building backwards from a belief does NOT license a yes/no question. The four-options-one-category rule still binds here and binds hardest here. "Do plants respire? Yes, constantly / Only at night / Never" is forbidden however real the misconception behind it — turn it into a choice between four comparable things instead, such as asking WHEN a plant respires and offering four times of day, or WHICH process the plant uses at night and offering four named processes.

The other 10 are ordinary recall, and the first three should be easy enough to build confidence. Difficulty climbs after that.

Every distractor must be plausible enough to punish guessing. Three obviously silly options measure nothing.

Vary which option is correct.

For each question write "why" — one sentence, under 25 words, saying what makes the right answer right. These appear together at the end of the game rather than between questions, so each must stand on its own. For a tricky one, name the misconception it caught.

If the topic is too vague or is not a real subject, set "ok" to false and say why in "problem".${inLanguage(language)}`;

  const completion = await ai.chat.completions.create({
    model,
    max_completion_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "quiz",
        schema: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            problem: { type: "string" },
            name: { type: "string", description: "The topic, tidied for display" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 4,
                    maxItems: 4,
                  },
                  correct: {
                    type: "integer",
                    description: "Index 0-3 of the correct option",
                  },
                  tricky: { type: "boolean" },
                  why: { type: "string" },
                },
                required: ["question", "options", "correct", "tricky", "why"],
                additionalProperties: false,
              },
            },
          },
          required: ["ok", "problem", "name", "questions"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = completion.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("Model returned no content");
  }

  const quiz = JSON.parse(raw);

  if (!quiz.ok) {
    const err = new Error(
      quiz.problem || "That topic can't be turned into a quiz."
    );

    err.status = 422;

    throw err;
  }

  // Never trust and serve. A question whose "correct" index points outside
  // its own options is unanswerable, and one with duplicate options has no
  // single right answer — both would only surface mid-game, on stage, with
  // two people staring at a timer.
  const questions = (quiz.questions ?? [])
    .filter(
      (q) =>
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every((o) => typeof o === "string" && o.trim()) &&
        new Set(q.options.map((o) => o.trim().toLowerCase())).size === 4 &&
        Number.isInteger(q.correct) &&
        q.correct >= 0 &&
        q.correct <= 3
    )
    .map((q, i) => {
      // Shuffle, because the model has a positional bias and asking it
      // nicely not to does not fix that. A generated set put the answer
      // at position 1, 2 or 3 five times each and never at 4 — in a game
      // where two people are racing a clock, "never the last one" is a
      // pattern somebody learns by question six and then exploits.
      // Shuffling makes the distribution a property of the code rather
      // than a hope about the model.
      const shuffled = q.options.map((o, index) => ({ o: o.trim(), index }));

      for (let k = shuffled.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));

        [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
      }

      return {
        id: `q${i + 1}`,
        question: q.question.trim(),
        options: shuffled.map((entry) => entry.o),
        correct: shuffled.findIndex((entry) => entry.index === q.correct),
        tricky: Boolean(q.tricky),
        why: typeof q.why === "string" ? q.why.trim() : "",
      };
    });

  if (questions.length < 5) {
    throw new Error(
      `Only ${questions.length} of ${quiz.questions?.length ?? 0} questions survived validation`
    );
  }

  return { name: quiz.name || topic, questions };
}

// Shared by both callers: the endpoint below and game creation.
function readTopic(req) {
  const topic = (req.body?.topic ?? "").trim();
  const language = req.body?.language ?? "en";

  if (!languageName(language)) {
    return { error: "Unsupported language." };
  }

  if (!topic) {
    return { error: "Expected { topic }." };
  }

  if (topic.length > 120) {
    return { error: "That topic is too long." };
  }

  return { topic, language };
}

app.post("/api/quiz", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const { topic, language, error } = readTopic(req);

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    res.json(await generateQuiz(topic, language, ai, modelFor(req)));
  } catch (err) {
    console.error("Could not build quiz:", err);

    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res
      .status(err.status ?? 500)
      .json({ error: err.status ? err.message : "Could not build a quiz for that topic." });
  }
});

// ---------------------------------------------------------------------------
// The game around those questions: two devices, one code, one clock.
//
// Where the time comes from
// -------------------------
// Nothing here runs a timer. There is no process to run one on — a serverless
// function exists for the length of a request and then stops, so a setTimeout
// that advances a game would fire into a dead instance, or fire twice on two
// live ones.
//
// So the game's position is not stored and advanced, it is DERIVED. The only
// timestamps written are the moment the host pressed start and, when both
// players answer early, the moment a round ended. Everything else — which
// question is live, when it closes, whether the game is over — is a pure
// function of those and the clock, computed identically on every request.
//
// That is also what makes the two devices agree. They are not being kept in
// step by messages arriving on time; they are each reading the same arithmetic
// off the same timestamps. A device that misses ten seconds of updates and
// reconnects lands exactly where the other one already is.

const LEAD_IN_MS = 3000;

// How long the answering window stays open after the question stops being
// read aloud. The clip's own length is added to this, so a long question
// does not eat the thinking time a short one gets.
const THINK_MS = 9000;

// Used only for a question whose audio never arrived. Roughly what the
// generator's own limit — under 18 words — takes to say.
const SILENT_QUESTION_MS = 4500;

const ROUND_GAP_MS = 1800;

// An answer sent before the deadline can still land after it. Refusing it
// would mean a slow connection, not a slow player, decided the round — and
// the fix is one number, because points here do not depend on speed.
const ANSWER_GRACE_MS = 1200;

const QUIZ_PLAYERS = 2;

// Each request voices at most this many questions. The ceiling exists
// because a Vercel function is killed at its maxDuration and the zero-config
// deploy this project documents has no vercel.json to raise it — fifteen
// clips in one request would be a coin toss against that limit. The client
// calls this until it reports done, which also gives the lobby something
// truthful to show while it waits.
const VOICE_BATCH = 5;

// ElevenLabs caps concurrent requests per plan, and a batch is exactly the
// shape that trips it. Three at a time keeps a batch near two seconds
// without leaning on the retry path.
const VOICE_CONCURRENCY = 3;

// Long enough to be worth holding open, short enough to close cleanly before
// any platform decides to close it for us. See the stream route.
const SSE_WINDOW_MS = 8000;

// The two backends disagree about JSON, and this is where that stops.
//
// Upstash deserialises any value that parses, so an array written as a
// string comes back an array; the JSON file hands back the string exactly as
// written. JSON.parse() on the array throws, which would have been a 500 on
// every request — on the deployed build only, since local development runs
// the file backend and would never have shown it.
function readFrozen(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return null;
}

// Flat hash to something a projection can use. Everything is normalised here
// so no caller has to care that Upstash and the JSON file disagree about
// whether a number came back a number.
function readLive(live) {
  const players = [];
  const answers = new Map();
  const ends = new Map();
  const durations = new Map();

  for (const [field, raw] of Object.entries(live ?? {})) {
    const value = typeof raw === "string" && raw.startsWith("{") ? JSON.parse(raw) : raw;

    if (field.startsWith("p:")) {
      players.push(value);
    } else if (field.startsWith("a:")) {
      answers.set(field.slice(2), Number(value));
    } else if (field.startsWith("e:")) {
      ends.set(Number(field.slice(2)), Number(value));
    } else if (field.startsWith("d:")) {
      durations.set(Number(field.slice(2)), Number(value));
    }
  }

  players.sort((a, b) => a.joinedAt - b.joinedAt);

  return {
    players,
    answers,
    ends,
    durations,
    startedAt: live?.run ? Number(live.run) : null,
    // Frozen at the moment the host started, deliberately. A clip generated
    // late — because a voicing batch failed and the fallback filled in —
    // would otherwise change how long a question had been open for, moving
    // a deadline that had already passed.
    frozen: readFrozen(live?.dur),
  };
}

function project(meta, live, now) {
  const state = readLive(live);
  const count = meta.questions.length;

  if (!state.startedAt) {
    return { ...state, phase: "lobby", index: 0 };
  }

  let opensAt = state.startedAt + LEAD_IN_MS;

  if (now < opensAt) {
    return { ...state, phase: "countdown", index: 0, opensAt };
  }

  for (let i = 0; i < count; i++) {
    const spoken = state.frozen?.[i] ?? state.durations.get(i) ?? SILENT_QUESTION_MS;
    const full = opensAt + spoken + THINK_MS;

    // A round can only ever be cut short, never extended, and never to
    // before it began — an end written by a clock that disagreed with this
    // one cannot rewind the game.
    const closesAt = Math.max(opensAt, Math.min(full, state.ends.get(i) ?? Infinity));

    if (now < closesAt) {
      return { ...state, phase: "question", index: i, opensAt, closesAt, spoken };
    }

    if (now < closesAt + ROUND_GAP_MS) {
      return {
        ...state,
        phase: "gap",
        index: i,
        opensAt,
        closesAt,
        spoken,
        resumesAt: closesAt + ROUND_GAP_MS,
      };
    }

    opensAt = closesAt + ROUND_GAP_MS;
  }

  return { ...state, phase: "over", index: count - 1 };
}

// +100 right, -50 wrong, nothing for a question that timed out. Computed
// here rather than trusted from a device, and only ever sent once the game
// is over.
function scoreGame(meta, state) {
  const players = state.players.map((player) => {
    let score = 0;
    let right = 0;
    let wrong = 0;

    meta.questions.forEach((question, i) => {
      const choice = state.answers.get(`${i}:${player.id}`);

      if (choice == null || Number.isNaN(choice)) {
        return;
      }

      if (choice === question.correct) {
        score += 100;
        right++;
      } else {
        score -= 50;
        wrong++;
      }
    });

    return {
      ...player,
      score,
      right,
      wrong,
      missed: meta.questions.length - right - wrong,
    };
  });

  return {
    players,
    questions: meta.questions.map((question, i) => ({
      ...question,
      picks: Object.fromEntries(
        state.players.map((player) => [
          player.id,
          state.answers.get(`${i}:${player.id}`) ?? null,
        ])
      ),
    })),
  };
}

// What both devices are told, and the only thing they are told. Note what is
// missing while the game runs: no correct indices, no scores, not even which
// option the other player picked — only THAT they picked one. The product's
// own argument is that being told the answer immediately teaches nothing, so
// the summary at the end is where all of it arrives, and a network tab is
// not a way around that.
// A player's id says WHO they are and is shared with the room. Their pass
// says they ARE that person and never leaves the device it was issued to.
//
// The two were one thing until a review pointed out what that meant: ids are
// published to both devices so the screen can say who has answered, and the
// answer route authorised on nothing more than "is this id in the game". So
// either player could read the other's id off /state and answer AS them —
// and because the first answer per player per question wins and cannot be
// overwritten, the victim's real tap was then thrown away as a duplicate.
// One player quietly picking the other's answers, with the summary blaming
// the victim for them.
function makePass() {
  let pass = "";

  for (let i = 0; i < 24; i++) {
    pass += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }

  return pass;
}

const ALPHANUMERIC =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Answers to "is this really them", and the only place that question is
// asked. A player rejoining after a reload presents the pass they kept.
function isReally(state, id, pass) {
  const player = state.players.find((entry) => entry.id === id);

  return Boolean(player && pass && player.pass === pass);
}

function publicState(meta, live, now) {
  const state = project(meta, live, now);
  const answered = state.players
    .filter((player) => state.answers.has(`${state.index}:${player.id}`))
    .map((player) => player.id);

  return {
    code: meta.code,
    name: meta.name,
    language: meta.language,
    hostId: meta.hostId,
    count: meta.questions.length,
    voiced: state.durations.size,
    phase: state.phase,
    index: state.index,
    opensAt: state.opensAt ?? null,
    closesAt: state.closesAt ?? null,
    resumesAt: state.resumesAt ?? null,
    players: state.players.map(({ id, name }) => ({ id, name })),
    answered,
    results: state.phase === "over" ? scoreGame(meta, state) : null,
  };
}

// Both halves of a game in one place, since every route needs both.
async function loadGame(code) {
  const meta = await getQuizMeta(code);

  if (!meta) {
    return null;
  }

  return { meta, live: (await getQuizLive(code)) ?? {} };
}

app.post("/api/quiz/game", rateLimit, async (req, res) => {
  const ai = clientFor(req);

  if (!ai) {
    return noKey(res);
  }

  const { topic, language, error } = readTopic(req);

  if (error) {
    return res.status(400).json({ error });
  }

  const id = String(req.body?.player?.id ?? "").trim().slice(0, 64);
  const name = String(req.body?.player?.name ?? "").trim().slice(0, 24);

  if (!id || !name) {
    return res.status(400).json({ error: "Expected { player: { id, name } }." });
  }

  try {
    const quiz = await generateQuiz(topic, language, ai, modelFor(req));

    const meta = await createQuizGame({
      topic,
      language,
      name: quiz.name,
      questions: quiz.questions,
      hostId: id,
    });

    const pass = makePass();

    await setQuizField(meta.code, `p:${id}`, {
      id,
      name,
      joinedAt: Date.now(),
      pass,
    });

    res.json({
      code: meta.code,
      name: meta.name,
      count: meta.questions.length,
      pass,
    });
  } catch (err) {
    console.error("Could not start a quiz game:", err);

    if (isKeyProblem(err)) {
      return noKey(res);
    }

    res
      .status(err.status ?? 500)
      .json({ error: err.status ? err.message : "Could not build a quiz for that topic." });
  }
});

// Makes the audio that does not exist yet, a few questions at a time, and
// says how far along it is. No rate limiter on purpose: it can only ever
// voice questions belonging to a game that already exists, and creating one
// of those IS rate limited, so the spend is already bounded upstream.
// Throttling it here would instead strand a half-voiced game.
app.post("/api/quiz/:code/voice", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const game = await loadGame(code);

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  const { durations } = readLive(game.live);
  const total = game.meta.questions.length;

  if (!voiceConfigured()) {
    // Not an error. The questions are on screen either way, and a silent
    // game is a worse game rather than no game at all.
    return res.json({ voiced: durations.size, total, done: true, silent: true });
  }

  const missing = game.meta.questions
    .map((question, index) => ({ question, index }))
    .filter(({ index }) => !durations.has(index))
    .slice(0, VOICE_BATCH);

  let failed = 0;

  for (let i = 0; i < missing.length; i += VOICE_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + VOICE_CONCURRENCY).map(async ({ question, index }) => {
        try {
          await putQuizAudio(code, index, await speak(question.question));
        } catch (err) {
          console.error(`Could not voice question ${index + 1}:`, err.message);
          failed++;
        }
      })
    );
  }

  const voiced = readLive((await getQuizLive(code)) ?? {}).durations.size;

  res.json({
    voiced,
    total,
    // A batch that produced nothing new is not going to start producing on
    // the next identical request — say done and let the game begin, with
    // the missing clips falling back to text.
    done: voiced >= total || missing.length === 0 || failed === missing.length,
  });
});

app.get("/api/quiz/:code", async (req, res) => {
  const game = await loadGame(req.params.code.toUpperCase());

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  // Questions without their answers. Every device gets all fifteen up front
  // so a question can never fail to arrive at the moment it is asked, which
  // is the one moment it must not.
  res.json({
    code: game.meta.code,
    name: game.meta.name,
    language: game.meta.language,
    hostId: game.meta.hostId,
    questions: game.meta.questions.map(({ id, question, options }) => ({
      id,
      question,
      options,
    })),
  });
});

app.post("/api/quiz/:code/join", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const game = await loadGame(code);

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  const id = String(req.body?.id ?? "").trim().slice(0, 64);
  const name = String(req.body?.name ?? "").trim().slice(0, 24);

  if (!id || !name) {
    return res.status(400).json({ error: "Expected { id, name }." });
  }

  // The pass is minted here, never accepted from the body on a first join —
  // a client-chosen secret is only as unguessable as the client bothered to
  // make it, and the whole point is that the other device cannot produce it.
  const offered = String(req.body?.pass ?? "").trim().slice(0, 64);
  const { players } = readLive(game.live);
  const existing = players.find((player) => player.id === id);

  // A returning player is not a third player. Without this, a refresh mid
  // game locks you out of your own game.
  if (!existing && players.length >= QUIZ_PLAYERS) {
    return res.status(409).json({ error: "That game already has two players." });
  }

  // Coming back to a seat means proving it was yours. Rejoining is the one
  // route that must accept a player who already exists, so without this it
  // would be the way around every other check: claim the opponent's id,
  // receive their seat, and answer as them for the rest of the game.
  if (existing && existing.pass && existing.pass !== offered) {
    return res.status(403).json({ error: "That player is someone else's." });
  }

  const seat = {
    id,
    name,
    joinedAt: existing?.joinedAt ?? Date.now(),
    pass: existing?.pass ?? makePass(),
  };

  await setQuizField(code, `p:${id}`, seat);

  res.json({
    // Sent once, to the device that owns it, and never included in the
    // state both players can read.
    pass: seat.pass,
    ...publicState(game.meta, (await getQuizLive(code)) ?? {}, Date.now()),
  });
});

app.post("/api/quiz/:code/start", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const game = await loadGame(code);

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  const id = String(req.body?.id ?? "").trim();
  const pass = String(req.body?.pass ?? "").trim();
  const live = readLive(game.live);
  const { players, durations } = live;

  if (id !== game.meta.hostId || !isReally(live, id, pass)) {
    return res.status(403).json({ error: "Only the player who made the game can start it." });
  }

  if (players.length < QUIZ_PLAYERS) {
    return res.status(409).json({ error: "Waiting for the second player." });
  }

  // Freeze the clip lengths into the run, so the timeline cannot be moved
  // afterwards by a clip that arrived late.
  //
  // Set-once for the same reason "run" is. This wrote unconditionally at
  // first, which meant a second POST — a retry, a double tap, a proxy
  // replaying the request — re-froze the durations of a game already in
  // progress. Every clip voiced since the real start would join the array,
  // every round after the current one would move, and the two devices would
  // disagree about when the question they were both looking at closed.
  await setQuizFieldOnce(
    code,
    "dur",
    JSON.stringify(
      game.meta.questions.map((_, i) => durations.get(i) ?? SILENT_QUESTION_MS)
    )
  );

  // Once. A second tap on Start would otherwise rewind a running game.
  await setQuizFieldOnce(code, "run", Date.now());

  res.json(publicState(game.meta, (await getQuizLive(code)) ?? {}, Date.now()));
});

app.post("/api/quiz/:code/answer", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const game = await loadGame(code);

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  const id = String(req.body?.id ?? "").trim();
  const pass = String(req.body?.pass ?? "").trim();
  const index = Number(req.body?.index);
  const choice = Number(req.body?.choice);

  if (!Number.isInteger(index) || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return res.status(400).json({ error: "Expected { id, index, choice }." });
  }

  const now = Date.now();
  const state = project(game.meta, game.live, now);

  // Being in the game is not enough — the other player is also in the game,
  // and their id is on this player's screen.
  if (!isReally(state, id, pass)) {
    return res.status(403).json({ error: "You are not in that game." });
  }

  // The server decides what "in time" means, and it decides it once, from
  // its own clock. A device whose clock is wrong, or whose request spent a
  // second in the air, is judged the same as one that is not.
  const inTime =
    state.index === index &&
    (state.phase === "question" || state.phase === "gap") &&
    now <= state.closesAt + ANSWER_GRACE_MS;

  if (!inTime) {
    return res.status(409).json({ error: "That question has closed." });
  }

  // First answer stands. Nothing is revealed between questions, so there is
  // no information to change your mind on — only a race to overwrite, which
  // would make the last packet to arrive the one that scored.
  const accepted = await setQuizFieldOnce(code, `a:${index}:${id}`, choice);

  const live = (await getQuizLive(code)) ?? {};
  const after = readLive(live);

  // Both in: close the round now rather than making two people who have
  // already answered watch the rest of a countdown.
  const everyone = after.players.every((player) =>
    after.answers.has(`${index}:${player.id}`)
  );

  if (everyone && after.players.length >= QUIZ_PLAYERS) {
    await setQuizFieldOnce(code, `e:${index}`, Date.now());
  }

  res.json({
    accepted,
    ...publicState(game.meta, (await getQuizLive(code)) ?? {}, Date.now()),
  });
});

app.get("/api/quiz/:code/state", async (req, res) => {
  const game = await loadGame(req.params.code.toUpperCase());

  if (!game) {
    return res.status(404).json({ error: "No quiz with that code." });
  }

  res.json({
    ...publicState(game.meta, game.live, Date.now()),
    serverNow: Date.now(),
  });
});

// The mp3 for one question. Both devices fetch this same URL and get the
// same bytes, which is the point — two separately generated readings of the
// same sentence would be two different lengths, and the pacing is built on
// that length.
//
// Generated here too if a voicing batch missed it, so a game is never stuck
// waiting for audio that failed once.
app.get("/api/quiz/:code/audio/:index", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const index = Number(req.params.index);
  const game = await loadGame(code);

  if (!game || !Number.isInteger(index) || !game.meta.questions[index]) {
    return res.status(404).json({ error: "No such question." });
  }

  let audio = await getQuizAudio(code, index);

  if (!audio && voiceConfigured()) {
    try {
      audio = await speak(game.meta.questions[index].question);
      await putQuizAudio(code, index, audio);
    } catch (err) {
      console.error(`Could not voice question ${index + 1}:`, err.message);
    }
  }

  if (!audio) {
    return res.status(404).json({ error: "That question has no audio." });
  }

  const bytes = Buffer.from(audio.b64, "base64");

  res.set({
    "Content-Type": "audio/mpeg",
    "Content-Length": bytes.length,
    // A given code and index is one recording forever, so the second device
    // to ask, and the same device asking again after a reload, can both be
    // answered from the browser's own cache.
    "Cache-Control": "public, max-age=21600, immutable",
  });

  res.send(bytes);
});

// How long to wait before looking at the game again.
//
// Every poll is a Redis command against a free tier that counts them, and a
// game held open for three minutes by two devices adds up fast. But the one
// event that cannot be predicted from the clock — both players answering
// early — can only happen once somebody has answered. So the loop only pays
// for a fast tick during the window where it might learn something.
function nextPollDelay(state, now) {
  if (state.phase === "over") {
    return 3000;
  }

  if (state.phase === "lobby") {
    return 500;
  }

  // Sleep until the projection changes rather than on a fixed tick. The
  // moment a question opens or closes is arithmetic, known exactly, so
  // there is no reason to find out about it late.
  //
  // A flat delay here meant a device could be told about a new question up
  // to a second and a half after it began. It still landed on the right
  // question — the timeline is derived, not pushed — but the audio had
  // already been running that long, and the client seeks to where the round
  // is rather than restarting a sentence. So a player heard a question with
  // its first few words missing while the other player, whose tick happened
  // to fall closer to the boundary, heard all of it.
  const boundary =
    state.phase === "countdown"
      ? state.opensAt
      : state.phase === "gap"
        ? state.resumesAt
        : state.closesAt;

  // The one thing the clock cannot predict is the round ending early, and
  // that can only happen once somebody has answered.
  const cap = state.answered.length > 0 ? 500 : 1500;

  return Math.max(100, Math.min(cap, (boundary ?? 0) - now));
}

// Sync, such as it is.
//
// The stream carries no game logic — every device could work this out from
// the timestamps alone, and does exactly that between messages. This is only
// how a device finds out that something happened which the clock could not
// have told it: a player joined, the host started, the other one answered.
//
// It ends itself after eight seconds and the browser reconnects, because a
// serverless function does not get to hold a connection open indefinitely
// and the failure mode of finding that out on stage is a stream that dies
// silently. A stream that always ends the same way, on purpose, is one whose
// reconnect path is exercised every eight seconds in front of us instead.
// Nothing is lost across the gap: answers travel by POST, and state is
// re-derived rather than accumulated.
app.get("/api/quiz/:code/stream", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const meta = await getQuizMeta(code);

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Proxies that buffer would hold a message until the response ended,
    // which for a stream means holding it forever.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  if (!meta) {
    res.write(`event: gone\ndata: {"error":"No quiz with that code."}\n\n`);
    return res.end();
  }

  // Reconnect fast — the default is three seconds, which is a third of a
  // question.
  res.write("retry: 500\n\n");

  let live = true;
  let last = "";

  req.on("close", () => {
    live = false;
  });

  const startedAt = Date.now();

  while (live && Date.now() - startedAt < SSE_WINDOW_MS) {
    const state = publicState(meta, (await getQuizLive(code)) ?? {}, Date.now());
    const signature = JSON.stringify(state);

    // serverNow rides along on every message, changed or not, because it is
    // how the other end learns what this clock says. It is deliberately not
    // part of the signature — it changes every tick and would make every
    // tick look like news.
    if (signature !== last) {
      last = signature;
      res.write(`data: ${JSON.stringify({ ...state, serverNow: Date.now() })}\n\n`);
    } else {
      // A named event rather than a `:` comment, because a comment is
      // invisible to EventSource and this one has a job: it is how the
      // other end knows the stream is alive and delivering promptly. That
      // matters because a platform is free to buffer a streamed response
      // until the function returns, which looks identical to a working
      // stream from here and like a frozen game from there. Silence is the
      // signal the client falls back on, so silence has to mean something.
      res.write(`event: tick\ndata: ${JSON.stringify({ serverNow: Date.now() })}\n\n`);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, nextPollDelay(state, Date.now()))
    );
  }

  res.end();
});

// On Vercel the platform imports this module and owns the
// socket — binding a port there would throw. Locally, nothing imports this
// file, so it starts its own listener exactly as it always did.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(
      `Grading server listening on http://localhost:${PORT} — teach-off store: ${backend}`
    );
  });
}

export default app;
