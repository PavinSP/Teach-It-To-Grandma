// Speech for the quiz game's questions.
//
// The clips are made once, at game creation, and stored — never made per
// device. Two devices generating the same sentence separately would get two
// slightly different recordings of different lengths, and the whole game is
// paced off how long the question takes to say. One file, both players, same
// timing.
//
// Plain fetch rather than the ElevenLabs SDK: this needs one POST, and a
// dependency added the week of a demo is a dependency that can fail to
// install on a deploy the week of a demo.

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

// Every one of these reads process.env when it is CALLED, never at import.
//
// A module-scope `const configured = Boolean(process.env.X)` is evaluated
// while index.js's own imports are still being hoisted — which is before the
// dotenv.config() line further down that file has run. It cost an hour: the
// key was present, the log said it had loaded two variables, and every game
// came out silent with no error anywhere, because the check had already
// decided there was no key before the key existed.
const voiceId = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

// Overridable because voice is taste, and taste is not worth a redeploy of
// code. George — a slow, warm narrator, which suits a question being asked.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

// Flash is the fast one and it is multilingual, which the German half of the
// app needs. Measured from here: 1.8s for a fourteen-word question.
const MODEL_ID = "eleven_flash_v2_5";

// Constant bit rate, and that is the point. 64 kbps is exactly 8000 bytes a
// second, so the clip's length falls out of its own file size and no decoder
// is needed to learn it. Checked against afinfo on a real clip: 25121 bytes
// predicted 3.140s against an actual 3.109s, the 31ms being the ID3 header.
// A tenth of a second of slack at the end of a spoken question is inaudible;
// a decoding dependency on the server would not have been.
const OUTPUT_FORMAT = "mp3_44100_64";
const BYTES_PER_SECOND = 8000;

// Long enough for a slow response, short enough that a hung request cannot
// eat a serverless function's whole budget and take the batch down with it.
const TIMEOUT_MS = 12000;

export const voiceConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY);

// Once the account says quota_exceeded it will say it for every request
// until the credits reset, and finding that out costs a full round trip per
// clip — fifteen doomed API calls every time a game warms its audio, each
// one delaying the 404 the client is about to fall back on. Remembered here
// for ten minutes, per instance, failing open: a topped-up account is
// noticed within minutes, and a fresh serverless instance simply tries.
const QUOTA_BACKOFF_MS = 10 * 60 * 1000;

let quotaDeadUntil = 0;

// Returns { b64, ms }, or throws. Callers treat a throw as "this question
// has no audio yet", never as a dead game — the question is on screen in
// text, so a silent round is a worse round rather than a broken one.
export async function speak(text) {
  const key = process.env.ELEVENLABS_API_KEY;

  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }

  if (Date.now() < quotaDeadUntil) {
    throw new Error("ElevenLabs quota exhausted — backing off");
  }

  // Free and starter plans cap concurrent requests, and a batch of questions
  // is exactly the shape that hits that cap. A 429 here means "you asked for
  // too many at once", not "you are out of credit", so it is worth one wait.
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `${ENDPOINT}/${voiceId()}?output_format=${OUTPUT_FORMAT}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, model_id: MODEL_ID }),
          signal: controller.signal,
        }
      );

      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);

        if (body.includes("quota_exceeded")) {
          quotaDeadUntil = Date.now() + QUOTA_BACKOFF_MS;
        }

        throw new Error(`ElevenLabs returned ${response.status}: ${body}`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());

      if (!bytes.length) {
        throw new Error("ElevenLabs returned an empty clip");
      }

      return {
        b64: bytes.toString("base64"),
        ms: Math.round((bytes.length / BYTES_PER_SECOND) * 1000),
      };
    } catch (err) {
      if (err.name === "AbortError" && attempt < 2) {
        continue;
      }

      if (attempt === 2) {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("ElevenLabs did not answer");
}
