import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

// The key lives in the project root .env, one level up from server/.
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const PORT = process.env.PORT || 3001;

// TitanomGPT is OpenAI-compatible, so the OpenAI SDK works against it
// once the base URL is swapped.
const TITANOM_BASE_URL = "https://api.deutschlandgpt.de/v2";
const MODEL = process.env.GRADING_MODEL || "claude-4.5-sonnet";

const apiKey = process.env.TITANOM_API_KEY;

if (!apiKey) {
  console.error(
    "Missing TITANOM_API_KEY. Add it to titanom-hack-2026/.env before starting the server."
  );
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL: TITANOM_BASE_URL });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Turns any topic the student types into a lesson: what they should cover,
// how hard it is, and what people usually get wrong about it.
app.post("/api/lesson", async (req, res) => {
  const topic = (req.body?.topic ?? "").trim();

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

Also assess the topic itself. "conceptDensity" is how many distinct ideas a beginner has to hold in their head at once — Low, Medium, or High. "prerequisites" is how much they need to already know before any of this can land — Low, Medium, or High. List 2-3 concrete things they'd need to already know in "prerequisiteNotes" (an empty list if there really are none).

Also write three challenges that would test whether a student really understands this topic rather than just reciting it. Each one must name a specific concept from the points above, not a generic instruction — "explain the learning rate without saying 'step'" is good, "explain it more simply" is not. Give each an id ("c1", "c2", "c3"), a kind (one of: analogy, five_year_old, no_jargon, real_world, opposite), a short label under 5 words for a button, and an instruction naming what Grandma should ask for.

If the topic is too vague to teach, or is not a real subject, set "ok" to false and say why in "problem" — otherwise set "ok" to true and leave "problem" empty.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
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
                  },
                  required: ["label", "keywords", "required"],
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
    res.status(502).json({ error: "Could not build a lesson for that topic." });
  }
});

// Judges whether the student genuinely explained each learning point,
// as opposed to merely saying the right keywords.
app.post("/api/grade", async (req, res) => {
  // `character` is strictly optional — a client that doesn't send it gets
  // the original Grandma behaviour, unchanged.
  const { topicName, points, transcript, character, ambushedMisconception } =
    req.body ?? {};

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

  if (!studentText.trim()) {
    return res.json({
      results: points.map((point) => ({
        point,
        understood: false,
        reason: "The student did not say anything about this.",
      })),
      summary: "Grandma didn't hear an explanation yet.",
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
  }${
    ambushedMisconception
      ? `,\n  "misconceptionHandling": { "noticed": true or false, "corrected": true or false, "quote": "<their exact correcting words, or empty>" }`
      : ""
  }
}`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      // Note: TitanomGPT silently ignores max_tokens — it wants this name.
      max_completion_tokens: 1400,
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
    res.status(502).json({ error: "Grading failed." });
  }
});

// Grandma says back what she thinks she understood — using nothing but the
// student's own words. She is not allowed to repair a broken explanation,
// because the broken version is exactly what the student needs to see.
app.post("/api/explainback", async (req, res) => {
  const { topicName, points, transcript, grandmaRecall, characterName } =
    req.body ?? {};
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
    return res.json({
      recap:
        listener === "Grandma"
          ? "You haven't told me anything yet, darling."
          : "You haven't told me anything yet.",
      points: points.map((point) => ({
        point,
        recalled: "missing",
        grandmaSaid: "",
        gap: "Never mentioned.",
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

Finally, in "unexplainedTerms", list every word the student used but never explained to you. Copy those words exactly as the student said them. If they explained everything, return an empty list.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
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
    res.status(502).json({ error: "Explain-back failed." });
  }
});

// Diagnoses the one weakness that actually shows up in this lesson, and for
// jargon specifically, builds a banned-word list the student can be held to
// on a re-run — enforced live, client-side, against words they used.
app.post("/api/challenge", async (req, res) => {
  const {
    topicName,
    points,
    transcript,
    unexplainedTerms,
    priorWeakness,
    characterName,
  } = req.body ?? {};
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
}`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
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
    res.status(502).json({ error: "Could not build a challenge." });
  }
});

app.listen(PORT, () => {
  console.log(`Grading server listening on http://localhost:${PORT}`);
});
