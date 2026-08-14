// Every feature beyond the core loop sits behind a flag here.
//
// The core loop — type a topic, teach it, get graded, read the notes — is
// deliberately NOT flagged. It is the demo; if it breaks, flags won't save it.
//
// If something misbehaves while you are presenting, you do not need to edit
// code or touch git. Add it to the URL instead:
//
//   ?off=misconceptionAttack          turn one feature off
//   ?off=xp,achievements,levels       turn several off
//   ?safe                             turn EVERYTHING optional off
//
// The setting lasts until you change the URL, so the fallback is always one
// reload away.

const DEFAULTS = {
  // Features get added here as they are built, each defaulting to true once
  // it has passed its own test. Keep the key identical to the flag name in
  // PLAN.md so the two never drift apart.

  // #9 — Grandma says back what she understood, using only the student's
  // words. Two halves, separately killable: the written analysis on the
  // recap, and the riskier live "ask her" button during the call.
  explainBack: true,
  spokenRecall: true,

  // #22 — a re-run targeting whatever specifically went wrong last time.
  // For jargon, the banned words are enforced live in the sidebar.
  weaknessTraining: true,

  // #20 — concept density, prerequisites, alongside the existing difficulty.
  topicAnalysis: true,
  // #39 — topic-specific challenges Grandma can be asked to pose mid-lesson.
  challengeCards: true,
  // #38(a) — render the misconceptions that were already being generated.
  misconceptionAttack: true,

  // #40 + #25 — the Feynman Score and itemised XP on the recap. The score
  // is computed from booleans, never asked from the model.
  progression: true,

  // #2/#3/#36 — six learners, one agent. Off restores single-Grandma exactly:
  // no overrides are sent at all, so the dashboard prompt runs unmodified.
  characterPicker: true,

  // #18 — hide the transcript and checklist mid-lesson; pure conversation,
  // results only at the end. State keeps accumulating, only rendering changes.
  voiceOnly: true,

  // #11 — mid-lesson, the character confidently states a false belief the
  // student has to catch. Default OFF until proven live (?on=misconceptionAmbush
  // to test): the riskiest feature in the plan, because it makes the AI wrong
  // on purpose in front of people.
  misconceptionAmbush: false,

  // #8 — the recap quotes your best sentence back, turns "what to improve"
  // into one concrete action, and shows the listener's real stuck-moments
  // instead of substring-matched guesses.
  richNotes: true,

  // #27 — badges earned from booleans that already exist; a vague lesson
  // earns nothing, and locked ones show their condition instead of hiding.
  achievements: true,

  // #34 — several people teach the SAME stored lesson in turn, one board.
  // Same machine, sequential — the only multiplayer that honestly works
  // without deployment.
  teachOff: true,
};

function resolve(defaults) {
  if (typeof window === "undefined") {
    return { ...defaults };
  }

  const params = new URLSearchParams(window.location.search);
  const flags = { ...defaults };

  if (params.has("safe")) {
    for (const name of Object.keys(flags)) {
      flags[name] = false;
    }

    return flags;
  }

  const off = (params.get("off") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of off) {
    if (name in flags) {
      flags[name] = false;
    } else {
      console.warn(`Unknown feature flag in ?off=: "${name}"`);
    }
  }

  // The mirror of ?off= — for features that ship default-off until they've
  // been proven live. ?safe beats both.
  const on = (params.get("on") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of on) {
    if (name in flags) {
      flags[name] = true;
    } else {
      console.warn(`Unknown feature flag in ?on=: "${name}"`);
    }
  }

  return flags;
}

export const FEATURES = resolve(DEFAULTS);

// Handy while presenting: type `features()` in the browser console to see
// what is currently on.
if (typeof window !== "undefined") {
  window.features = () => console.table(FEATURES);
}
