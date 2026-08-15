// How the listener is feeling about your explanation (#4), which the
// avatar then reacts to (#43).
//
// Two sources, deliberately layered:
//
//   1. A `set_mood` client tool the agent calls itself. Accurate, because
//      it's the model's own judgement — but it only fires once the tool is
//      registered on the agent in the ElevenLabs dashboard.
//   2. A keyword heuristic over what she just said. Cruder, but needs no
//      setup and no network, so the feature works the moment it ships.
//
// The heuristic is a floor, not a competitor: it only speaks up when the
// tool has been silent, so a properly configured agent is never second-
// guessed by a regex.
//
// Rejected alternatives, both from the plan: a marker token in her replies
// (TTS reads it aloud — "bracket confused" is a demo-ending bug), and a
// classification call per turn (300-1500ms, so her face lags her voice by
// a full turn, which reads as broken rather than as latency).

export const MOODS = [
  "curious",
  "confused",
  "interested",
  "understanding",
  "impressed",
];

// How she FEELS about the explanation — never what she is doing. The
// activity line below already says whether she is speaking or listening,
// and a mood label like "listening" collided with it on screen.
//
// `curious` is the neutral starting state and deliberately has no label:
// there is nothing to report until the explanation gives her a reaction.
export const MOOD_LABEL = {
  curious: null,
  confused: "lost",
  interested: "wants more",
  understanding: "following you",
  impressed: "impressed",
};

// Checked in order, so the strongest signal wins: being lost outranks
// polite interest, and genuine delight outranks a mild "I see".
//
// Both languages live in the same buckets rather than behind a switch. This
// is the ONLY mood source (the set_mood tool is not registered), so an
// English-only list left the avatar frozen on `curious` for an entire German
// lesson — the feature silently not running rather than running badly. One
// merged list also survives switching language mid-session.
//
// Order does real work across languages too: "ich verstehe nicht" has to be
// caught by `confused` before `understanding` sees "ich verstehe".
const MOOD_HINTS = [
  [
    "confused",
    [
      "i don't understand",
      "i do not understand",
      "you lost me",
      "lost me",
      "what does",
      "what do you mean",
      "what is a",
      "what's a",
      "what are those",
      "what in the world",
      "i'm not following",
      "not following",
      "come again",
      "confusing",
      "i'm confused",
      "still confused",
      "never explained",
      "you didn't say",
      "what exactly",
      // German
      "ich verstehe nicht",
      "ich verstehe das nicht",
      "verstehe ich nicht",
      "was bedeutet",
      "was heißt",
      "was meinst du",
      "was ist ein",
      "was ist das",
      "ich bin verwirrt",
      "verwirrend",
      "ich komme nicht mit",
      "wie bitte",
      "noch mal langsam",
      "keine ahnung",
    ],
  ],
  [
    "impressed",
    [
      "that's clever",
      "how clever",
      "wonderful",
      "now i get it",
      "now i understand",
      "you explained that",
      "that makes perfect sense",
      "how interesting",
      "well done",
      "brilliant",
      "that's a good way",
      "lovely",
      // German
      "wie clever",
      "wunderbar",
      "das ist klug",
      "jetzt verstehe ich es",
      "wie interessant",
      "gut gemacht",
      "großartig",
      "schön erklärt",
      "sehr schön",
    ],
  ],
  [
    "understanding",
    [
      "ah,",
      "oh!",
      "i see",
      "so you mean",
      "that makes sense",
      "got it",
      "i think i've got",
      "oh right",
      "that's clearer",
      "i understand",
      // Checking herself with an analogy: "so the weight is like how
      // important each ingredient is in my cookie recipe?"
      /\bso\b[^.?!]{0,60}\bis like\b/,
      /\b(sort|kind) of like\b/,
      /\bis that like\b/,
      // German
      "ach so",
      "aha",
      "ich verstehe",
      "also meinst du",
      "das ergibt sinn",
      "verstanden",
      "alles klar",
      "jetzt ist es klarer",
      /\balso\b[^.?!]{0,60}\bist wie\b/,
      /\bist das wie\b/,
    ],
  ],
  [
    "interested",
    [
      "tell me more",
      "and then what",
      "what happens",
      "really?",
      "how so",
      "keep going",
      // German
      "erzähl mir mehr",
      "und dann",
      "was passiert",
      "wirklich?",
      "wie denn",
      "mach weiter",
      "und weiter",
    ],
  ],
];

// Returns a mood, or null when nothing matched — null means "leave the
// mood where it is". Resetting to a default on every neutral sentence
// would make the avatar flicker on almost every turn.
export function guessMood(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }

  const lower = text.toLowerCase();

  for (const [mood, hints] of MOOD_HINTS) {
    const hit = hints.some((hint) =>
      typeof hint === "string" ? lower.includes(hint) : hint.test(lower)
    );

    if (hit) {
      return mood;
    }
  }

  return null;
}

// What the character is doing right now, which is orthogonal to how she
// feels — she can be confused AND speaking at the same time. Collapsing
// the two into one enum is the mistake this exists to avoid.
export function channelState({
  isConnected,
  isSpeaking,
  isListening,
  awaitingReply,
}) {
  if (!isConnected) return "idle";
  if (isSpeaking) return "speaking";
  if (awaitingReply) return "thinking";
  if (isListening) return "listening";

  return "idle";
}
