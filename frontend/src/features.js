// Every feature beyond the core loop sits behind a flag here.
//
// The core loop — type a topic, teach it, get graded, read the notes — is
// deliberately NOT flagged. It is the demo; if it breaks, flags won't save it.
//
// If something misbehaves while you are presenting, you do not need to edit
// code or touch git. Add it to the URL instead:
//
//   ?off=misconceptionAttack          turn one feature off
//   ?off=aiJury,achievements          turn several off
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

  // #10 — the listener retells the topic with planted errors; the student
  // flags the wrong ones. Scored client-side: we know which were planted.
  mirrorMode: true,

  // #46 (student half) — your own name and face: transcript says who you
  // are, teach-off fields come pre-filled.
  youCharacter: true,

  // #4 + #43 — how she's feeling about the explanation, and the avatar
  // reacting to it. Works with no dashboard setup (keyword heuristic);
  // gets sharper once a set_mood client tool is registered on the agent.
  characterMood: true,

  // Mouth movement driven by her real output volume. Two frames stacked
  // and cross-faded — never a src swap, which would flicker.
  characterMouth: true,

  // Four listeners judge the same explanation by their own standards.
  // The gap between them is the finding, not the average.
  aiJury: true,

  // Predict how well you know it before teaching; compare afterwards.
  confidenceGap: true,

  // Ground the explanation never went near, as opposed to covered badly.
  blindSpots: true,

  // #19 — teach in German. The agent has the language configured; this
  // switches the lesson, the grading and her voice together.
  multilingual: true,

  // The rungs from naming a thing to knowing where it breaks. One number
  // cannot say which of those you reached.
  depthLadder: true,

  // The recap headline written about this lesson rather than picked from a
  // table. The score still chooses which band shows, so the line can never
  // contradict the number under it. Off falls back to the static lines.
  aiHeadline: true,

  // complex ideas #19 — the moments that decided the lesson, laid out in the
  // order they happened. Every quote is verified against the transcript, so
  // a marker can only sit where the student actually said something.
  forensics: true,

  // complex ideas #22 — how it was delivered: pace, filler, hedging, sentence
  // length. Counted from the transcript, never asked from a model, and framed
  // as communication feedback rather than anything about the speaker.
  deliveryAnalysis: true,

  // complex ideas #20 — the whole run as one card worth screenshotting.
  // Composed from numbers already on the page; adds no request.
  lessonReplay: true,

  // A photo sets the avatar dials as a starting point. Off leaves the manual
  // builder exactly as it was — the photo button simply isn't offered.
  selfieAvatar: true,

  // It predicts which points trip teachers up before a word is spoken,
  // then the recap says where it was right and where you beat it.
  difficultyPrediction: true,

  // Bias speech recognition toward the lesson's own technical terms.
  // Needs the ASR keywords override enabled on the agent; harmless if not.
  asrKeywords: true,

  // #34 — several people teach the SAME stored lesson in turn, one board.
  // Same machine, sequential — the only multiplayer that honestly works
  // without deployment.
  teachOff: true,

  // The two-player quiz. A side mode by construction, and flagged like one:
  // it measures whether you can pick the right answer against a clock, which
  // is precisely the thing this product argues is not understanding. Off
  // removes the entry point from the landing page and the view with it,
  // leaving the teaching flow exactly as it was.
  quizGame: true,
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
