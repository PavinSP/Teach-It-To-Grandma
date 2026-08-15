// #22 — how the explanation was DELIVERED, as opposed to whether it was
// understood. Everything here is counted from the transcript, never asked
// from a model, so the same lesson always produces the same numbers.
//
// Scope is deliberately narrow. The idea file that proposed this flagged the
// risk itself: pace and hesitation are one short step from sounding like a
// personality reading. Nothing here infers a state of mind — it counts words
// that were said and reports the count. "You hedged eleven times" is a fact
// about the transcript; "you sounded unsure" is not, and is not on this card.

// Sounds that fill a gap while the next thought arrives. Kept separate from
// hedges below so a lesson can be fluent and uncommitted, or halting and
// definite, without the two collapsing into one number.
const FILLERS = [
  "um", "umm", "uh", "uhh", "er", "erm", "ah", "mm", "mmm", "hmm",
  "like", "basically", "actually", "literally", "obviously", "right",
  "you know", "i mean", "so yeah",
];

// Words that back away from the claim being made. A teacher who hedges every
// sentence gives a listener nothing to hold onto, which is a teaching problem
// rather than a confidence one — that is the framing this card uses.
const HEDGES = [
  "sort of", "kind of", "kinda", "sorta", "i think", "i guess",
  "i believe", "maybe", "perhaps", "probably", "possibly",
  "i'm not sure", "not really sure", "or something", "more or less",
  "pretty much", "i suppose",
];

function escapeForRegex(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word matching only. Without the boundaries "er" would fire inside
// "layer" and "gradient descent" would read as two hesitations.
function countTerms(haystack, terms) {
  const hits = [];
  let total = 0;

  for (const term of terms) {
    const matches = haystack.match(
      new RegExp(`\\b${escapeForRegex(term)}\\b`, "g")
    );

    if (matches?.length) {
      total += matches.length;
      hits.push({ term, count: matches.length });
    }
  }

  return { total, hits: hits.sort((a, b) => b.count - a.count) };
}

// Rates are per 100 words rather than raw counts, because a raw count only
// says the lesson was long. Bands are generous: ordinary confident speech
// carries filler, and a card that calls normal speech a problem gets ignored.
export function analyseDelivery(userMessages, durationMs) {
  const messages = (userMessages ?? []).filter(
    (message) => typeof message === "string" && message.trim()
  );

  if (messages.length === 0) {
    return null;
  }

  const text = messages.join(" ").toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 20) {
    return null; // Too little said for any rate to mean anything.
  }

  const fillers = countTerms(text, FILLERS);
  const hedges = countTerms(text, HEDGES);

  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const longestRun = messages.reduce(
    (longest, message) =>
      Math.max(longest, message.split(/\s+/).filter(Boolean).length),
    0
  );

  const minutes = durationMs ? durationMs / 60000 : null;

  return {
    wordCount,
    // Only counted when the lesson was long enough for a rate to be stable.
    // A 20-second burst extrapolates to a nonsense words-per-minute figure.
    wordsPerMinute:
      minutes && minutes >= 0.5 ? Math.round(wordCount / minutes) : null,
    fillerCount: fillers.total,
    fillerRate: (fillers.total / wordCount) * 100,
    topFillers: fillers.hits.slice(0, 3),
    hedgeCount: hedges.total,
    hedgeRate: (hedges.total / wordCount) * 100,
    topHedges: hedges.hits.slice(0, 3),
    sentenceCount: sentences.length,
    avgSentenceWords: sentences.length
      ? Math.round(wordCount / sentences.length)
      : wordCount,
    longestRun,
  };
}

// Each reading gets a band and a line that describes what was counted, never
// what it says about the speaker. "good" is not praise and "high" is not a
// failure — they only pick the colour.
export function deliveryReadings(delivery) {
  if (!delivery) {
    return [];
  }

  const readings = [];

  if (delivery.wordsPerMinute !== null) {
    const wpm = delivery.wordsPerMinute;

    readings.push({
      id: "pace",
      label: "Pace",
      value: `${wpm}`,
      unit: "words per minute",
      band: wpm > 185 || wpm < 75 ? "watch" : "good",
      note:
        wpm > 185
          ? "Quick. A beginner needs longer to catch up than a peer does."
          : wpm < 75
            ? "Unhurried — which suits a listener meeting this for the first time."
            : "A steady conversational pace.",
    });
  }

  readings.push({
    id: "fillers",
    label: "Filler words",
    value: `${delivery.fillerCount}`,
    unit: delivery.topFillers.length
      ? `most often "${delivery.topFillers[0].term}"`
      : "none counted",
    band: delivery.fillerRate > 6 ? "watch" : "good",
    note:
      delivery.fillerRate > 6
        ? `${delivery.fillerRate.toFixed(1)} per 100 words — enough that they carry into the explanation.`
        : "Within the range of ordinary spoken explanation.",
  });

  readings.push({
    id: "hedges",
    label: "Hedging",
    value: `${delivery.hedgeCount}`,
    unit: delivery.topHedges.length
      ? `most often "${delivery.topHedges[0].term}"`
      : "none counted",
    band: delivery.hedgeRate > 3 ? "watch" : "good",
    note:
      delivery.hedgeRate > 3
        ? "Softened claims give a beginner less to hold onto than a plain statement does."
        : "Claims were mostly stated plainly.",
  });

  readings.push({
    id: "sentences",
    label: "Sentence length",
    value: `${delivery.avgSentenceWords}`,
    unit: "words on average",
    band: delivery.avgSentenceWords > 28 ? "watch" : "good",
    note:
      delivery.avgSentenceWords > 28
        ? "Long sentences ask a listener to hold several ideas at once."
        : "Short enough to follow one idea at a time.",
  });

  return readings;
}
