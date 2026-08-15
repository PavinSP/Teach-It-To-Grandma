// The score and XP behind the completion band (#40 + #25).
//
// One rule governs everything in this file: numbers are COMPUTED from
// booleans an engineer can point at, never emitted by a model. The same
// lesson always produces the same score — a number that changes on identical
// input isn't a measurement.

// 70% of the score is whether Grandma genuinely followed each point (the AI
// grade), 15% is keyword coverage (saying the right things), 15% is how
// little she had to stop and ask. The weighting deliberately makes a vague
// 4/4-coverage explanation land in the low double digits — the keyword bar
// alone is nearly worthless, which is the product's whole argument.
export function feynmanScore({
  understoodCount,
  coveredCount,
  totalPoints,
  clarificationCount,
}) {
  if (!totalPoints || understoodCount === null || understoodCount === undefined) {
    return null;
  }

  const understood = understoodCount / totalPoints;
  const covered = coveredCount / totalPoints;
  const earned = 85 * understood + 15 * covered;

  // Friction multiplies what was earned rather than adding to it. As a
  // separate term it paid 15 points for silence — say your name, leave,
  // and score 15 for never having been interrupted. Nothing explained
  // now scores nothing. Being asked to clarify still costs little: a
  // heavily interrupted explanation keeps 85% of its credit, because
  // needing clarification is not the same as being wrong.
  const friction = Math.min(clarificationCount ?? 0, 4) / 4;

  return Math.round(earned * (1 - 0.15 * friction));
}

// The celebration copy derives from the score — a failing lesson gets told
// so, with the same prominence as a win. A game that congratulates you for
// failing is worse than no game. Only Grandma gets to say "darling".
// Returns a string KEY, not a sentence — the caller translates it, because
// this file has no idea what language the lesson is being taught in. The
// {name} placeholder is filled from the active character either way.
export function verdictForScore(score, isGrandma = false) {
  if (score >= 85) return "verdictGot";
  if (score >= 60) return "verdictMostly";
  if (score >= 40) return "verdictSome";
  return isGrandma ? "verdictLostGrandma" : "verdictLost";
}

export function bandForScore(score) {
  if (score >= 70) return "good";
  if (score >= 40) return "mid";
  return "low";
}

// Which of a character's four recap headlines to use. Shares its thresholds
// with verdictForScore above, so the character's own line and the verdict
// under the score can never disagree about how the lesson went — a headline
// saying "well done" over a red 36 was the bug this replaces.
export function headlineBandForScore(score) {
  if (score >= 85) return "aced";
  if (score >= 60) return "followed";
  if (score >= 40) return "partial";
  return "lost";
}

// The three teaching moments, cheapest first — this is also the order they
// are listed on the recap. The xp values are the tie-break when the grader
// hangs two of them on the same sentence.
const MOMENT_AWARDS = [
  { key: "simplifiedJargon", label: "xpJargon", xp: 30 },
  { key: "selfCorrected", label: "xpSelfCorrect", xp: 40 },
  { key: "usedGoodAnalogy", label: "xpAnalogy", xp: 50 },
];

// Two quotes are the same evidence if they read the same aloud: case,
// surrounding space and internal run-on space are all noise here.
function normaliseQuote(quote) {
  return String(quote ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Which moments actually count, once duplicates are settled.
//
// One sentence can honestly be two moments at once — "actually, let me say
// that better: each connection has a dial" is a self-correction AND a dropped
// technical term. Crediting both puts the identical quote on two rows of the
// recap, which reads as a glitch rather than as credit. So a quote counts
// once, for the highest-value moment claiming it.
//
// Blank quotes never collide: the server clears any quote it could not find
// verbatim in the transcript, and two unevidenced moments are still two
// different things that happened.
//
// This is the single definition of "earned" — the XP rows and the badges both
// read it, so a badge can never celebrate something the ledger didn't pay for.
function paidMomentKeys(moments) {
  const paidQuotes = new Set();
  const earned = new Set();

  for (const award of [...MOMENT_AWARDS].sort((a, b) => b.xp - a.xp)) {
    if (!moments?.[award.key]?.happened) {
      continue;
    }

    const quote = normaliseQuote(moments[award.key].quote);

    if (quote) {
      if (paidQuotes.has(quote)) {
        continue;
      }

      paidQuotes.add(quote);
    }

    earned.add(award.key);
  }

  return earned;
}

// Converts one graded lesson into itemised XP events. Understanding XP comes
// from the AI grade, never from the keyword bar — coverage earns its own,
// visibly smaller award. Mistakes never subtract; events that didn't happen
// are omitted rather than shown at zero.
export function xpForLesson({ results, moments, coveredCount, totalPoints, saidAnything }) {
  if (!saidAnything) {
    return null;
  }

  const events = [];

  // Labels are string keys throughout; the recap translates them. A label
  // stored in an older snapshot is an English sentence, and t() returns any
  // key it does not recognise unchanged — so a restored recap still reads
  // correctly instead of showing a bare key.
  // Participation credit still has to be participation: turning up, saying
  // a name and leaving used to bank 100 XP.
  if (coveredCount > 0) {
    events.push({ label: "xpCompleted", xp: 100 });
  }

  if (coveredCount === totalPoints) {
    events.push({ label: "xpEveryConcept", xp: 100 });
  }

  if (Array.isArray(results)) {
    const understood = results.filter((r) => r.understood).length;

    if (understood > 0) {
      events.push({
        label: understood > 1 ? "xpExplainedMany" : "xpExplainedOne",
        vars: { count: understood },
        xp: 50 * understood,
      });
    }

    if (understood === results.length && results.length > 0) {
      events.push({ label: "xpUnderstoodAll", xp: 100 });
    }

    const earnedKeys = paidMomentKeys(moments);

    // Emitted in the declared order, not the order they were judged in, so
    // the recap always lists these three the same way round.
    for (const award of MOMENT_AWARDS) {
      if (earnedKeys.has(award.key)) {
        events.push({
          label: award.label,
          xp: award.xp,
          quote: moments[award.key].quote,
        });
      }
    }
  }

  return {
    events,
    total: events.reduce((sum, event) => sum + event.xp, 0),
    // When the grade never arrived, the award is coverage-only and says so —
    // understanding is never inferred from keywords to paper over an outage.
    gradedByAI: Array.isArray(results),
  };
}

// -------------------------------------------------------------------------
// Running total, kept in this browser's localStorage. Honest scope: one
// browser profile on one machine — the UI says "your total", never "your
// account". Every read is guarded; a corrupt value must degrade to a fresh
// profile, not a blank page.

const PROFILE_KEY = "teachit.profile.v1";

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && typeof parsed.xp === "number" && parsed.xp >= 0) {
      return parsed;
    }
  } catch {
    // Broken JSON or storage unavailable — start clean either way.
  }

  return { v: 1, xp: 0, lessons: 0 };
}

export function commitLessonXp(earned, extras = {}) {
  const profile = loadProfile();

  const updated = {
    ...profile,
    xp: profile.xp + earned,
    lessons: profile.lessons + 1,
    analogyLessons:
      (profile.analogyLessons ?? 0) + (extras.hadAnalogy ? 1 : 0),
    strongScores:
      (profile.strongScores ?? 0) + (extras.strongScore ? 1 : 0),
    achievements: {
      ...(profile.achievements ?? {}),
      ...Object.fromEntries(
        (extras.newAchievements ?? []).map((id) => [id, Date.now()])
      ),
    },
  };

  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or blocked — the in-memory total still renders.
  }

  return updated;
}

// -------------------------------------------------------------------------
// Achievements (#27). Every condition is a boolean over data that already
// exists — nothing here is awarded on vibes, and a vague lesson earns
// nothing. Myth Buster was impossible when the plan was written (nothing
// ever stated a misconception); the ambush changed that.

export const ACHIEVEMENTS = [
  {
    id: "jargon-slayer",
    icon: "🗣️",
    name: "achJargonSlayer",
    how: "achJargonSlayerHow",
  },
  {
    id: "approved",
    icon: "✅",
    name: "achApproved",
    how: "achApprovedHow",
  },
  {
    id: "deep-thinker",
    icon: "🧠",
    name: "achDeepThinker",
    how: "achDeepThinkerHow",
  },
  {
    id: "perfect",
    icon: "🎯",
    name: "achPerfect",
    how: "achPerfectHow",
  },
  {
    id: "speed-teacher",
    icon: "🔥",
    name: "achSpeed",
    how: "achSpeedHow",
  },
  {
    id: "myth-buster",
    icon: "🧨",
    name: "achMythBuster",
    how: "achMythBusterHow",
  },
  {
    id: "analogy-master",
    icon: "🪄",
    name: "achAnalogyMaster",
    how: "achAnalogyMasterHow",
  },
  {
    id: "feynman-master",
    icon: "🏆",
    name: "achFeynmanMaster",
    how: "achFeynmanMasterHow",
  },
];

// Returns the ids newly earned by this lesson — already-earned ones never
// re-fire. `profile` supplies the cross-lesson counters.
export function evaluateAchievements(lesson, profile) {
  const {
    results,
    moments,
    score,
    clarificationCount,
    durationMs,
    mythCaught,
    deepAnswers,
  } = lesson;

  const allUnderstood =
    Array.isArray(results) &&
    results.length > 0 &&
    results.every((r) => r.understood);

  // Badges read the same ledger the XP rows do. A moment whose quote was
  // already credited to a higher award is not a second achievement — without
  // this, the recap can hand out Jargon Slayer for a sentence it visibly
  // declined to pay a jargon award for.
  const credited = paidMomentKeys(moments);

  const hadAnalogy = credited.has("usedGoodAnalogy");
  const analogyLessons = (profile.analogyLessons ?? 0) + (hadAnalogy ? 1 : 0);
  const strongScores =
    (profile.strongScores ?? 0) + (score !== null && score >= 75 ? 1 : 0);

  const conditions = {
    "jargon-slayer": credited.has("simplifiedJargon"),
    approved: allUnderstood && (clarificationCount ?? 99) <= 1,
    "deep-thinker": (deepAnswers ?? 0) >= 5,
    perfect: score !== null && score >= 95,
    "speed-teacher":
      allUnderstood && durationMs !== null && durationMs < 180000,
    "myth-buster": Boolean(mythCaught),
    "analogy-master": analogyLessons >= 3,
    "feynman-master": strongScores >= 10,
  };

  const already = profile.achievements ?? {};

  return ACHIEVEMENTS.filter(
    (a) => conditions[a.id] && !already[a.id]
  ).map((a) => a.id);
}
