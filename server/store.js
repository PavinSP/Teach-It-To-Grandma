// Teach-off storage (#34): the challenges and every run against them.
//
// A plain in-memory map, mirrored to a JSON file — because `npm run dev`
// uses node --watch, and every server-file save during a demo would
// otherwise wipe the board mid-presentation. No database: for one machine
// passing a microphone around, a file is the honest amount of
// infrastructure.

import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const DATA_FILE = join(DATA_DIR, "teachoffs.json");

// code -> { code, lesson, createdAt, runs: [{player, score, understoodCount,
//           totalPoints, summary, at}] }
const teachoffs = new Map();

// Codes that can be read aloud across a room: no 0/O, 1/I/L confusion.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode() {
  let code = "";

  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }

  return `TEACH-${code}`;
}

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

// Written synchronously on every mutation. A debounce here once cost a
// whole board: the timer was still pending when node --watch killed the
// process on a file save. Fifty small entries take microseconds — the
// window a debounce opens is worth more than the milliseconds it saves.
// (--watch only restarts on changes to imported modules, so writing this
// data file does not itself trigger a restart.)
function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...teachoffs.values()]));
  } catch (err) {
    console.error("Could not persist teach-offs:", err);
  }
}

export function createTeachoff(lesson) {
  // Oldest boards drop first — a long session can't grow unbounded.
  if (teachoffs.size >= 50) {
    const oldest = [...teachoffs.values()].sort(
      (a, b) => a.createdAt - b.createdAt
    )[0];

    teachoffs.delete(oldest.code);
  }

  let code = makeCode();

  while (teachoffs.has(code)) {
    code = makeCode();
  }

  const entry = { code, lesson, createdAt: Date.now(), runs: [] };

  teachoffs.set(code, entry);
  persist();

  return entry;
}

export function getTeachoff(code) {
  return teachoffs.get(code) ?? null;
}

export function addRun(code, run) {
  const entry = teachoffs.get(code);

  if (!entry) {
    return null;
  }

  entry.runs.push({ ...run, at: Date.now() });

  if (entry.runs.length > 50) {
    entry.runs = entry.runs.slice(-50);
  }

  persist();

  return rankedRuns(entry);
}

// Highest score first; equal scores rank the earlier run higher, so a
// later tie never displaces whoever set it.
export function rankedRuns(entry) {
  return [...entry.runs].sort((a, b) => b.score - a.score || a.at - b.at);
}
