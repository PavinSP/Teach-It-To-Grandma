// The escape hatch: `?reset` in the URL, from any state, gets you back to
// a working app.
//
// This runs at import time, BEFORE React mounts — deliberately. The state
// most likely to need clearing is state that breaks rendering, and a
// button inside a blank page saves nobody. A URL works when nothing else
// does, and it can be typed by someone who has never seen the code.
//
// Two depths, because they answer different panics:
//
//   ?reset      the lesson. Transcript, grades, boards, the game — gone.
//               Your name, face, XP and badges survive. This is the one
//               you want mid-demo when a session gets wedged.
//
//   ?reset=all  everything, including who you are and everything you
//               earned. A factory reset for handing the laptop over.

const SESSION_KEYS = ["teachit.tab.v1"];
const PROFILE_KEYS = ["teachit.profile.v1", "teachit.you.v2", "teachit.you.v1"];

function drop(storage, keys) {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // A single unreadable key must not stop the rest being cleared.
    }
  }
}

export function runResetIfAsked() {
  if (typeof window === "undefined") {
    return null;
  }

  let params;

  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }

  if (!params.has("reset")) {
    return null;
  }

  const everything = params.get("reset") === "all";

  try {
    drop(sessionStorage, SESSION_KEYS);
    drop(localStorage, SESSION_KEYS);

    if (everything) {
      drop(localStorage, PROFILE_KEYS);
    }
  } catch {
    // Storage disabled entirely — there was nothing to clear anyway.
  }

  // Strip the parameter so a later refresh doesn't silently wipe a fresh
  // session, and so the URL you're left with is the normal app.
  try {
    params.delete("reset");

    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : "")
    );
  } catch {
    // Non-fatal: the clear already happened, which is the point.
  }

  return everything ? "all" : "session";
}

// The same clearing, triggered from a button rather than the URL. Reloads
// afterwards: wiping storage while the old state still sits in React
// memory would leave the two disagreeing.
export function resetNow(scope = "session") {
  try {
    drop(sessionStorage, SESSION_KEYS);
    drop(localStorage, SESSION_KEYS);

    if (scope === "all") {
      drop(localStorage, PROFILE_KEYS);
    }
  } catch {
    // Nothing to clear if storage is unavailable.
  }

  try {
    // Keep whatever else the URL was carrying — a reset shouldn't disarm
    // a feature someone deliberately switched on.
    window.location.reload();
  } catch {
    // Reload blocked: the clear still happened, next load will be clean.
  }
}
