
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

export function buildDebt(topic, messages) {
  const terms = [
    ...new Set(
      (topic?.checks ?? [])
        .flatMap((check) => check.keywords ?? [])
        .map((keyword) => String(keyword).toLowerCase().trim())
        .filter(Boolean)
    ),
  ];

  // Ordered turns, so "after she asked" means something.
  const turns = (messages ?? []).filter((m) => m.source !== "system");

  return terms
    .map((term) => {
      let usedAt = -1;
      let queriedAt = -1;
      let clearedAt = -1;

      turns.forEach((message, i) => {
        const text = (message.message || "").toLowerCase();

        if (!text.includes(term)) return;

        if (message.source === "user" && message.meta !== "prompt") {
          if (usedAt < 0) usedAt = i;

          if (
            queriedAt >= 0 &&
            i > queriedAt &&
            clearedAt < 0 &&
            text.split(/\s+/).length >= SUBSTANTIAL_REPLY
          ) {
            clearedAt = i;
          }

          return;
        }

        if (message.source !== "user" && isQuestionAbout(message, term)) {
          if (queriedAt < 0) queriedAt = i;
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
