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

  return flags;
}

export const FEATURES = resolve(DEFAULTS);

// Handy while presenting: type `features()` in the browser console to see
// what is currently on.
if (typeof window !== "undefined") {
  window.features = () => console.table(FEATURES);
}
