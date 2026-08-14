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
// failing is worse than no game.
export function verdictForScore(score) {
  if (score >= 85) return "Grandma really got it.";
  if (score >= 60) return "Grandma mostly followed you.";
  if (score >= 40) return "Grandma got some of it.";
  return "Grandma is still lost, darling.";
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

export function commitLessonXp(earned) {
  const profile = loadProfile();

  const updated = {
    ...profile,
    xp: profile.xp + earned,
    lessons: profile.lessons + 1,
  };

  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full or blocked — the in-memory total still renders.
  }

  return updated;
}
