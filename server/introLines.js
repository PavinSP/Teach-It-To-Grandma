// The lines Grandma says aloud in the ten-second test on the opening screen.
//
// A fixed list, not "say whatever the page asks": the route that voices them
// is open to anyone who can load the page, so it may only ever speak these
// exact sentences, never arbitrary text. It keeps the cost of the screen to
// a handful of short clips, made once and remembered.
//
// The same sentences are in frontend/src/strings.js, where the page shows
// them. test/intro.test.js fails if the two ever drift apart.

export const INTRO_LINES = {
  q1: {
    en: "How does a bicycle stay upright?",
    de: "Wie bleibt ein Fahrrad aufrecht?",
  },
  q1w1: {
    en: "Hmm. And why does steering fix a lean?",
    de: "Hmm. Und warum hilft Lenken gegen das Kippen?",
  },
  q1w2: {
    en: "But why does the wheel turn under the lean, dear?",
    de: "Aber warum dreht sich das Rad unter die Neigung?",
  },
  q1w3: {
    en: "And what is pulling you down in the first place?",
    de: "Und was zieht dich überhaupt nach unten?",
  },
  q2: {
    en: "Why is the sky blue?",
    de: "Warum ist der Himmel blau?",
  },
  q2w1: {
    en: "But why does blue scatter more than red?",
    de: "Aber warum streut Blau stärker als Rot?",
  },
  q2w2: {
    en: "And why is the sun orange at the end of the day?",
    de: "Und warum ist die Sonne abends orange?",
  },
  q2w3: {
    en: "What is light actually doing there?",
    de: "Was macht das Licht dort eigentlich?",
  },
  q3: {
    en: "How does a fridge make things cold?",
    de: "Wie kühlt ein Kühlschrank?",
  },
  q3w1: {
    en: "But where does the heat go?",
    de: "Aber wohin geht die Wärme?",
  },
  q3w2: {
    en: "And why does squeezing a gas make it hot?",
    de: "Und warum wird ein Gas heiß, wenn man es zusammendrückt?",
  },
  q3w3: {
    en: "So what is cold, really?",
    de: "Was ist Kälte denn eigentlich?",
  },
  gap: {
    en: "You know it, dear. But explaining it is another matter.",
    de: "Du weißt es, mein Lieber. Aber es zu erklären, ist etwas anderes.",
  },
  swap: {
    en: "That's all right, dear. Let me try another one.",
    de: "Das ist schon in Ordnung, mein Lieber. Ich frage etwas anderes.",
  },
};
