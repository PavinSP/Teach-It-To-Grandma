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
