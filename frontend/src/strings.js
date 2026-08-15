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
    confidenceQ: "Before you start — how well do you think you know {topic}?",
    confShaky: "Shaky",
    confOk: "Pretty well",
    confStrong: "I could teach it",
    conceptDensity: "Concept density",
    prerequisites: "Prerequisites",
    Beginner: "Beginner",
    Intermediate: "Intermediate",
    Advanced: "Advanced",
    butDid: "But did {name} actually follow it? Finish the lesson and {they}'ll tell you.",

    // Landing page. The product name itself stays English — it is the
    // brand, not a sentence.
    heroLine1: "If you can't explain it",
    heroLine2: "to {name},",
    heroLine3: "do you really understand it?",
    heroSub: "Name anything you know. Then try to teach it to someone who knows absolutely nothing about it.",
    createCharacter: "Create your character",
    editCharacter: "Edit your character",
    whoTeaching: "Who are you teaching?",
    whatTeach: "What do you want to teach?",
    teachIn: "Teach in",
    topicPlaceholder: "Backpropagation, embeddings, why transformers replaced RNNs…",
    teachIt: "Teach it →",
    preparing: "Preparing…",
    workingOut: "Working out what {name} would need to hear…",
    gotCode: "Got a Teach-Off code?",
    yourName: "Your name",
    join: "Join →",
    orTry: "Or try",
    clearLesson: "Clear saved lesson",
    resetAll: "Reset everything",
    dropped: "{name} hung up. Press the microphone to carry on — nothing you said is lost.",
    you: "YOU",

    // Character builder
    yourCharacter: "Your character",
    hair: "Hair",
    facialHair: "Facial hair",
    glasses: "Glasses",
    expression: "Expression",
    skin: "Skin",
    backdrop: "Backdrop",
    thatsMe: "That's me →",
    saving: "Saving…",
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
    confidenceQ: "Bevor du anfängst — wie gut kennst du {topic} deiner Meinung nach?",
    confShaky: "Wackelig",
    confOk: "Ganz gut",
    confStrong: "Ich könnte es unterrichten",
    conceptDensity: "Konzeptdichte",
    prerequisites: "Vorkenntnisse",
    Beginner: "Anfänger",
    Intermediate: "Mittel",
    Advanced: "Fortgeschritten",
    butDid: "Aber hat {name} es wirklich verstanden? Beende die Lektion und du erfährst es.",

    heroLine1: "Wenn du es",
    heroLine2: "{name} nicht erklären kannst,",
    heroLine3: "verstehst du es dann wirklich?",
    heroSub: "Nenne etwas, das du kennst. Dann erkläre es jemandem, der absolut nichts darüber weiß.",
    createCharacter: "Erstelle deinen Charakter",
    editCharacter: "Charakter bearbeiten",
    whoTeaching: "Wem erklärst du es?",
    whatTeach: "Was möchtest du erklären?",
    teachIn: "Sprache",
    topicPlaceholder: "Backpropagation, Embeddings, warum Transformer RNNs abgelöst haben…",
    teachIt: "Los geht's →",
    preparing: "Wird vorbereitet…",
    workingOut: "Überlege, was {name} hören müsste…",
    gotCode: "Hast du einen Teach-Off-Code?",
    yourName: "Dein Name",
    join: "Beitreten →",
    orTry: "Oder probiere",
    clearLesson: "Gespeicherte Lektion löschen",
    resetAll: "Alles zurücksetzen",
    dropped: "{name} hat aufgelegt. Drücke das Mikrofon, um weiterzumachen — nichts geht verloren.",
    you: "DU",

    yourCharacter: "Dein Charakter",
    hair: "Haare",
    facialHair: "Bart",
    glasses: "Brille",
    expression: "Gesichtsausdruck",
    skin: "Hautton",
    backdrop: "Hintergrund",
    thatsMe: "Das bin ich →",
    saving: "Wird gespeichert…",
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
