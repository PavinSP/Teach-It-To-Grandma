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
  const friction = Math.min(clarificationCount ?? 0, 4) / 4;

  return Math.round(70 * understood + 15 * covered + 15 * (1 - friction));
}

// The celebration copy derives from the score — a failing lesson gets told
// so, with the same prominence as a win. A game that congratulates you for
// failing is worse than no game. Only Grandma gets to say "darling".
export function verdictForScore(score, who = "Grandma") {
  if (score >= 85) return `${who} really got it.`;
  if (score >= 60) return `${who} mostly followed you.`;
  if (score >= 40) return `${who} got some of it.`;
  return who === "Grandma"
    ? "Grandma is still lost, darling."
    : `${who} is still lost.`;
}

export function bandForScore(score) {
  if (score >= 70) return "good";
  if (score >= 40) return "mid";
  return "low";
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

  events.push({ label: "Completed the lesson", xp: 100 });

  if (coveredCount === totalPoints) {
    events.push({ label: "Mentioned every concept", xp: 100 });
  }

  if (Array.isArray(results)) {
    const understood = results.filter((r) => r.understood).length;

    if (understood > 0) {
      events.push({
        label: `Explained ${understood} point${understood > 1 ? "s" : ""} clearly`,
        xp: 50 * understood,
      });
    }

    if (understood === results.length && results.length > 0) {
      events.push({ label: "Grandma understood all of it", xp: 100 });
    }

    if (moments?.simplifiedJargon?.happened) {
      events.push({
        label: "Dropped the jargon when asked",
        xp: 30,
        quote: moments.simplifiedJargon.quote,
      });
    }

    if (moments?.selfCorrected?.happened) {
      events.push({
        label: "Caught your own mistake",
        xp: 40,
        quote: moments.selfCorrected.quote,
      });
    }

    if (moments?.usedGoodAnalogy?.happened) {
      events.push({
        label: "Found a good analogy",
        xp: 50,
        quote: moments.usedGoodAnalogy.quote,
      });
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
    name: "Jargon Slayer",
    how: "Swap a technical term for plain language when asked",
  },
  {
    id: "approved",
    icon: "✅",
    name: "Fully Followed",
    how: "Every point understood, at most one interruption",
  },
  {
    id: "deep-thinker",
    icon: "🧠",
    name: "Deep Thinker",
    how: "Give five of their questions a real answer",
  },
  {
    id: "perfect",
    icon: "🎯",
    name: "Perfect Explanation",
    how: "Score 95 or higher",
  },
  {
    id: "speed-teacher",
    icon: "🔥",
    name: "Speed Teacher",
    how: "Every point understood in under three minutes",
  },
  {
    id: "myth-buster",
    icon: "🧨",
    name: "Myth Buster",
    how: "Catch them confidently stating a false belief",
  },
  {
    id: "analogy-master",
    icon: "🪄",
    name: "Analogy Master",
    how: "A genuine analogy in three different lessons",
  },
  {
    id: "feynman-master",
    icon: "🏆",
    name: "Feynman Master",
    how: "Ten lessons scoring 75 or higher",
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

  const hadAnalogy = Boolean(moments?.usedGoodAnalogy?.happened);
  const analogyLessons = (profile.analogyLessons ?? 0) + (hadAnalogy ? 1 : 0);
  const strongScores =
    (profile.strongScores ?? 0) + (score !== null && score >= 75 ? 1 : 0);

  const conditions = {
    "jargon-slayer": Boolean(moments?.simplifiedJargon?.happened),
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
