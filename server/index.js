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

If the topic is too vague to teach, or is not a real subject, set "ok" to false and say why in "problem" — otherwise set "ok" to true and leave "problem" empty.`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1500,
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
            },
            required: [
              "ok",
              "problem",
              "name",
              "description",
              "difficulty",
              "points",
              "misconceptions",
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

    res.json(lesson);
  } catch (err) {
    console.error("Lesson generation failed:", err);
    res.status(502).json({ error: "Could not build a lesson for that topic." });
  }
});

// Judges whether the student genuinely explained each learning point,
// as opposed to merely saying the right keywords.
app.post("/api/grade", async (req, res) => {
  const { topicName, points, transcript } = req.body ?? {};

  if (!topicName || !Array.isArray(points) || !Array.isArray(transcript)) {
    return res
      .status(400)
      .json({ error: "Expected { topicName, points[], transcript[] }." });
  }

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

  const prompt = `A student tried to explain "${topicName}" to a grandmother who knows nothing about the subject.

Here is everything the student said:
---
${studentText}
---

For each learning point below, decide whether the student GENUINELY explained the idea in a way a beginner could follow. Saying a keyword is not enough — they must actually convey the concept.

${pointList}

Respond with JSON only, in exactly this shape:
{
  "results": [
    { "point": "<the learning point, copied exactly>", "understood": true or false, "reason": "<one short sentence, addressed to the student as Grandma would say it>" }
  ],
  "summary": "<two sentences in Grandma's warm voice about how well they explained it overall>"
}`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      // Note: TitanomGPT silently ignores max_tokens — it wants this name.
      max_completion_tokens: 1024,
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
            },
            required: ["results", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = completion.choices?.[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned no content");
    }

    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("Grading failed:", err);
    res.status(502).json({ error: "Grading failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Grading server listening on http://localhost:${PORT}`);
});
