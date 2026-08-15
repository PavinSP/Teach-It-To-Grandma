// UI text for the session view, in the language the lesson is being taught
// in. Scope is deliberate: the screen where a German conversation is
// happening should not be captioned in English. The recap's own content
// already comes back translated from the grader.
//
// Placeholders are {name}, {them}, {topic} — filled by t().

const STRINGS = {
  en: {
    ready: "{name} is ready. Press the microphone and start teaching {them} about {topic}.",
    pressMic: "Press the microphone and start explaining.",
    connecting: "Connecting to {name}...",
    speaking: "🔊 {name} is speaking...",
    listening: "🎙️ {name} is listening...",
    thinking: "💭 {name} is thinking...",
    startTeaching: "🎙️ Start teaching {name}...",
    muted: "🔇 Microphone muted — {name} can't hear you.",
    restingHint: "🤔 Take your time — {name} is waiting quietly.",
    isSpeaking: "{name} is speaking",
    isListening: "{name} is listening",
    isThinking: "{name} is thinking",
    waiting: "waiting for you",
    yourLesson: "YOUR LESSON",
    pointsMentioned: "POINTS MENTIONED",
    challenge: "CHALLENGE {them}",
    commonWrong: "WHAT BEGINNERS USUALLY GET WRONG",
    dontSay: "DON'T SAY",
    taughtBy: "taught by",
    voiceOnly: "🎙️ Voice only",
    showPanels: "🗒️ Show the panels",
    letMeThink: "🤔 Let me think",
    imReady: "▶︎ I'm ready",
    endCall: "⏹️ End conversation",
    askUnderstood: "{glyph} Ask {name} what {they} understood",
    asked: "{glyph} Asked — listen to what {they} got",
    finish: "Finish lesson →",
    seeNotes: "See {name}'s Notes →",
    teachSomethingElse: "← Teach something else",
    justTalk: "Just talk. {name} will tell you what {they} understood at the end.",
    coveredAll: "You covered all four points.",
    butDid: "But did {name} actually follow it? Finish the lesson and {they}'ll tell you.",
  },

  de: {
    ready: "{name} ist bereit. Drücke das Mikrofon und erkläre {them} {topic}.",
    pressMic: "Drücke das Mikrofon und fang an zu erklären.",
    connecting: "Verbinde mit {name}...",
    speaking: "🔊 {name} spricht...",
    listening: "🎙️ {name} hört zu...",
    thinking: "💭 {name} denkt nach...",
    startTeaching: "🎙️ Fang an, {name} zu unterrichten...",
    muted: "🔇 Mikrofon stumm — {name} kann dich nicht hören.",
    restingHint: "🤔 Lass dir Zeit — {name} wartet ruhig.",
    isSpeaking: "{name} spricht",
    isListening: "{name} hört zu",
    isThinking: "{name} denkt nach",
    waiting: "wartet auf dich",
    yourLesson: "DEINE LEKTION",
    pointsMentioned: "GENANNTE PUNKTE",
    challenge: "FORDERE {themAcc} HERAUS",
    commonWrong: "WAS ANFÄNGER MEIST FALSCH VERSTEHEN",
    dontSay: "NICHT SAGEN",
    taughtBy: "unterrichtet von",
    voiceOnly: "🎙️ Nur Stimme",
    showPanels: "🗒️ Panels zeigen",
    letMeThink: "🤔 Lass mich überlegen",
    imReady: "▶︎ Ich bin bereit",
    endCall: "⏹️ Gespräch beenden",
    askUnderstood: "{glyph} Frag {name}, was {they} verstanden hat",
    asked: "{glyph} Gefragt — hör zu, was {they} verstanden hat",
    finish: "Lektion beenden →",
    seeNotes: "Notizen von {name} ansehen →",
    teachSomethingElse: "← Etwas anderes erklären",
    justTalk: "Sprich einfach. {name} sagt dir am Ende, was {they} verstanden hat.",
    coveredAll: "Du hast alle vier Punkte angesprochen.",
    butDid: "Aber hat {name} es wirklich verstanden? Beende die Lektion und du erfährst es.",
  },
};

// German needs the right pronoun case, and it differs from English: the
// object form after "erkläre" is dative, and subject pronouns differ by
// gender. Kept beside the strings so a new character can't forget them.
const PRONOUNS = {
  en: {
    she: { they: "she", them: "her", themAcc: "her" },
    he: { they: "he", them: "him", themAcc: "him" },
  },
  de: {
    // them = dative (erkläre IHR), themAcc = accusative (fordere SIE heraus)
    she: { they: "sie", them: "ihr", themAcc: "sie" },
    he: { they: "er", them: "ihm", themAcc: "ihn" },
  },
};

export function t(language, key, vars = {}) {
  const table = STRINGS[language] ?? STRINGS.en;
  const template = table[key] ?? STRINGS.en[key] ?? key;

  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    name in vars ? String(vars[name]) : whole
  );
}

// The vars every session string needs, derived from the active character.
export function speakerVars(language, character) {
  const set =
    PRONOUNS[language]?.[character.subj] ?? PRONOUNS.en[character.subj];

  return {
    name: character.shortName,
    glyph: character.glyph,
    they: set.they,
    them: set.them,
    themAcc: set.themAcc,
  };
}
