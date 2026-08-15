// Whether this browser wants the calm version, and the in-app switch for the
// majority of people who have never opened their OS accessibility settings.
//
// Three inputs, in order of authority:
//
//   1. ?safe in the URL. Forces reduced motion and low-GPU, and cannot be
//      overridden from inside the app — it is the escape hatch you type when
//      the projector laptop is already misbehaving and you have thirty
//      seconds. It does not touch FEATURES; features.js reads the same
//      parameter independently, and neither knows about the other.
//   2. The in-app toggle, remembered per browser.
//   3. prefers-reduced-motion, the OS setting.
//
// What "reduced" means here is a designed alternative, never `animation:
// none`: colour and opacity transitions stay, continuous loops and travel
// stop. The rules live in CSS behind [data-motion="reduced"]; this module
// only decides the answer and publishes it.

const KEY = "teachit.motion.v1";
const QUERY = "(prefers-reduced-motion: reduce)";

// Read once at module load, before React mounts, so the first paint is
// already correct — a page that animates for 200ms and then stops because a
// hook caught up is worse than either option on its own.
const SAFE = (() => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return new URLSearchParams(window.location.search).has("safe");
  } catch {
    return false;
  }
})();

// "auto" defers to the OS. "reduced" and "full" are deliberate choices.
function loadPreference() {
  try {
    const raw = localStorage.getItem(KEY);

    if (raw === "reduced" || raw === "full" || raw === "auto") {
      return raw;
    }
  } catch {
    // Storage blocked — deferring to the OS is the right default anyway.
  }

  return "auto";
}

let preference = loadPreference();

const media =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(QUERY)
    : null;

const listeners = new Set();

export function isSafeMode() {
  return SAFE;
}

export function getPreference() {
  return preference;
}

export function prefersReducedMotion() {
  if (SAFE) {
    return true;
  }

  if (preference === "reduced") return true;
  if (preference === "full") return false;

  return Boolean(media?.matches);
}

// Attributes rather than classes, so CSS can key off them and so a glance at
// the DOM inspector answers "why is nothing moving" in one line.
function publish() {
  if (typeof document !== "undefined") {
    const root = document.documentElement;

    root.dataset.motion = prefersReducedMotion() ? "reduced" : "full";

    if (SAFE) {
      root.dataset.safe = "true";
    }
  }

  for (const listener of listeners) {
    listener();
  }
}

export function setPreference(next) {
  preference = next === "reduced" || next === "full" ? next : "auto";

  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // The choice still applies to this page load.
  }

  publish();
}

export function subscribeToMotion(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

media?.addEventListener?.("change", publish);

publish();
