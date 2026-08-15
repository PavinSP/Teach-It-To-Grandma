// Teach-off storage (#34): the challenges and every run against them.
//
// Two backends behind one interface, chosen by whether Upstash credentials
// are present:
//
//   Redis    — when UPSTASH_REDIS_REST_URL and _TOKEN are set. This is what
//              a deployed build uses, and it is the only way a code created
//              on a phone can be joined from a laptop.
//   JSON file — otherwise. Unchanged from the original single-machine
//              build, so `npm run dev` needs no account and no network, and
//              a laptop demo behaves exactly as it always has.
//
// The split exists because serverless has no durable disk. On Vercel the
// filesystem is read-only apart from /tmp, /tmp does not survive between
// invocations, and two concurrent instances share nothing. A file-backed
// board would appear to work whenever both requests happened to land on the
// same warm instance and fail the rest of the time — which is worse than
// failing outright, because it passes casual testing and breaks on stage.

import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const DATA_FILE = join(DATA_DIR, "teachoffs.json");

// Codes that can be read aloud across a room: no 0/O, 1/I/L confusion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// A board is worth keeping for a fortnight and no longer. On Redis this is
// a TTL, which is why the Redis path has no eviction logic of its own.
const TTL_SECONDS = 60 * 60 * 24 * 14;

const MAX_RUNS = 50;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

export const backend = redis ? "redis" : "file";

const NEEDS_REDIS =
  "Teach-off storage is not configured. This environment cannot durably " +
  "write to disk, so codes could not be shared between devices — which is " +
  "the whole point of deploying. Set UPSTASH_REDIS_REST_URL and " +
  "UPSTASH_REDIS_REST_TOKEN in the project's environment variables.";

// Refuse to boot rather than half-work. A file-backed board on serverless
// succeeds whenever two requests happen to hit the same warm instance and
// fails otherwise — it would pass every test you thought to run and then
// lose a judge's teach-off code on stage. A dead deploy with a readable
// reason is strictly better than a board that works four times in five.
//
// The test is whether this process can actually persist, not whether it
// recognises the host. `process.env.VERCEL` was the obvious check and is
// the wrong one: it only exists when "Enable access to System Environment
// Variables" happens to be ticked in project settings, so the guard would
// have been silently absent on exactly the deploys that needed it. Probing
// the filesystem asks the real question and holds on any host.
if (!redis) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(join(DATA_DIR, ".writable"), "");
    fs.unlinkSync(join(DATA_DIR, ".writable"));
  } catch {
    throw new Error(NEEDS_REDIS);
  }
}

function makeCode() {
  let code = "";

  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }

  return `TEACH-${code}`;
}

// Highest score first; equal scores rank the earlier run higher, so a
// later tie never displaces whoever set it.
export function rankedRuns(entry) {
  return [...entry.runs].sort((a, b) => b.score - a.score || a.at - b.at);
}

// ---------------------------------------------------------------------------
// File backend — the original, untouched in behaviour.

// code -> { code, lesson, createdAt, runs: [...] }
const teachoffs = new Map();

if (!redis) {
  // Load whatever survived the last process. A corrupt file starts clean —
  // losing a board is recoverable, a crashing server mid-demo is not.
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    for (const entry of raw) {
      teachoffs.set(entry.code, entry);
    }
  } catch {
    // First boot, or unreadable file — start empty either way.
  }
}

// Written synchronously on every mutation. A debounce here once cost a
// whole board: the timer was still pending when node --watch killed the
// process on a file save. Fifty small entries take microseconds — the
// window a debounce opens is worth more than the milliseconds it saves.
function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...teachoffs.values()]));
  } catch (err) {
    console.error("Could not persist teach-offs:", err);
  }
}

// ---------------------------------------------------------------------------
// Redis keys. The runs live in their own list rather than inside the entry
// JSON, so appending a run is an atomic RPUSH instead of a read-modify-write.
// Two people finishing a lesson at the same moment would otherwise race, and
// the loser's score would vanish with no error anywhere.

const metaKey = (code) => `teachoff:${code}`;
const runsKey = (code) => `teachoff:${code}:runs`;

// ---------------------------------------------------------------------------
// The interface. Both backends, async either way — a caller must never have
// to know which one is running.

export async function createTeachoff(lesson) {
  let code = makeCode();

  if (redis) {
    // Collisions are vanishingly unlikely across 31^4 codes, but a reused
    // code would silently merge two boards, so it is still checked.
    while (await redis.exists(metaKey(code))) {
      code = makeCode();
    }

    const entry = { code, lesson, createdAt: Date.now() };

    await redis.set(metaKey(code), entry, { ex: TTL_SECONDS });

    return { ...entry, runs: [] };
  }

  while (teachoffs.has(code)) {
    code = makeCode();
  }

  // Oldest boards drop first — a long session can't grow unbounded. Redis
  // does this with a TTL instead, which is why this is file-only.
  if (teachoffs.size >= 50) {
    const oldest = [...teachoffs.values()].sort(
      (a, b) => a.createdAt - b.createdAt
    )[0];

    teachoffs.delete(oldest.code);
  }

  const entry = { code, lesson, createdAt: Date.now(), runs: [] };

  teachoffs.set(code, entry);
  persist();

  return entry;
}

// Always returns the entry with its runs attached, so rankedRuns() works on
// the result whichever backend produced it.
export async function getTeachoff(code) {
  if (redis) {
    const entry = await redis.get(metaKey(code));

    if (!entry) {
      return null;
    }

    const runs = await redis.lrange(runsKey(code), 0, -1);

    // Upstash deserialises JSON values for us; older entries written as
    // strings are parsed here so a mid-demo deploy can't break the board.
    return {
      ...entry,
      runs: runs.map((run) => (typeof run === "string" ? JSON.parse(run) : run)),
    };
  }

  return teachoffs.get(code) ?? null;
}

export async function addRun(code, run) {
  const stamped = { ...run, at: Date.now() };

  if (redis) {
    if (!(await redis.exists(metaKey(code)))) {
      return null;
    }

    await redis.rpush(runsKey(code), JSON.stringify(stamped));
    // Keep the last MAX_RUNS, and expire the list alongside its board.
    await redis.ltrim(runsKey(code), -MAX_RUNS, -1);
    await redis.expire(runsKey(code), TTL_SECONDS);

    const entry = await getTeachoff(code);

    return entry ? rankedRuns(entry) : null;
  }

  const entry = teachoffs.get(code);

  if (!entry) {
    return null;
  }

  entry.runs.push(stamped);

  if (entry.runs.length > MAX_RUNS) {
    entry.runs = entry.runs.slice(-MAX_RUNS);
  }

  persist();

  return rankedRuns(entry);
}
