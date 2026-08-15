
// The live version of the argument this product makes: you used a word, and
// the person you were teaching had to stop you and ask what it meant.
//
// Everything here is computed from the transcript and the lesson's own
// keyword lists. No request, no model, no new state — which is why it can
// update on every utterance instead of once at the end.
//
// Three states, in the order they hurt:
//
//   queried  she stopped you on this word. It did not land.
//   used     you have said it. Nothing has gone wrong yet.
//   cleared  she asked, and you answered at length using the word again.
//
// "cleared" is a heuristic and worth naming as one: a substantial reply
// (twelve words or more) that comes after her question and uses the term
// again is treated as having explained it. That can be generous — nothing
// here checks the explanation was any good, and the recap's graded version
// still gets the final word. It is honest about what it is: a live signal,
// not a verdict.

const SUBSTANTIAL_REPLY = 12;

function isQuestionAbout(message, term) {
  const text = (message.message || "").toLowerCase();

  return text.includes("?") && text.includes(term);
}

// Three sources, because any one of them alone has a hole.
//
// The keyword lists are the coverage matcher's vocabulary, and they miss
// the obvious case: teaching "Backpropagation", the word backpropagation
// is the TOPIC, not a keyword inside one of the four points. The lesson
// was entirely about a word the panel could not see.
//
// The topic's own name closes that. And whatever the character puts in
// quotes closes the rest — when she asks what "backpropagation" actually
// means, she is naming the problem herself, which is better evidence than
// any list decided before the lesson started.
function vocabulary(topic, messages) {
  const terms = new Set();
  const add = (word) => {
    const clean = String(word ?? "").toLowerCase().trim();

    if (clean.length >= 4) terms.add(clean);
  };

  for (const check of topic?.checks ?? []) {
    for (const keyword of check.keywords ?? []) add(keyword);
  }

  // The topic itself, whole and word by word: "Neural Networks" should
  // catch both the phrase and "networks" on its own.
  add(topic?.name);

  for (const word of String(topic?.name ?? "").split(/\s+/)) add(word);

  for (const message of messages ?? []) {
    if (message.source === "user" || message.source === "system") continue;

    for (const [, quoted] of String(message.message ?? "").matchAll(
      /["“']([^"”']{4,30})["”']/g
    )) {
      add(quoted);
    }
  }

  return [...terms];
}

export function buildDebt(topic, messages) {
  const terms = vocabulary(topic, messages);

  // Ordered turns, so "after she asked" means something.
  const turns = (messages ?? []).filter((m) => m.source !== "system");

  return terms
    .map((term) => {
      let usedAt = -1;
      let queriedAt = -1;
      let clearedAt = -1;

      turns.forEach((message, i) => {
        const text = (message.message || "").toLowerCase();
        const isStudent = message.source === "user" && message.meta !== "prompt";

        // Clearing does NOT require the word to come back. Explaining
        // "backpropagation" well means saying "it walks the error backwards
        // and nudges each weight" — the jargon is the thing you are
        // replacing, so demanding you repeat it to get credit had the rule
        // exactly backwards. She asked about this term; the substantial
        // answer that follows is the answer to it.
        if (
          isStudent &&
          queriedAt >= 0 &&
          i > queriedAt &&
          clearedAt < 0 &&
          text.split(/\s+/).length >= SUBSTANTIAL_REPLY
        ) {
          clearedAt = i;
        }

        if (!text.includes(term)) return;

        if (isStudent) {
          if (usedAt < 0) usedAt = i;

          return;
        }

        // She cannot stop you on a word you have not said yet, and the
        // `usedAt` test is what enforces that.
        //
        // Her greeting is built from the topic and ends in a question mark —
        // "So you're going to teach me about Neural Networks?" — which has a
        // question mark and the term in it, and so lit up every term derived
        // from the topic name as SHE STOPPED YOU before the microphone had
        // been touched. A panel headed WORDS YOU'RE USING listing three
        // words nobody had used, against a transcript one line long, all of
        // them accusing.
        //
        // The rule this restores is the one at the top of this file: you
        // used a word, and she had to stop you. Both halves, in that order.
        if (usedAt >= 0 && queriedAt < 0 && isQuestionAbout(message, term)) {
          queriedAt = i;
        }
      });

      const state =
        clearedAt >= 0
          ? "cleared"
          : queriedAt >= 0
            ? "queried"
            : usedAt >= 0
              ? "used"
              : null;

      return state ? { term, state, at: Math.max(usedAt, queriedAt) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      // What is costing you right now goes to the top.
      const rank = { queried: 0, used: 1, cleared: 2 };

      return rank[a.state] - rank[b.state] || b.at - a.at;
    });
}
