// Per-tab persistence: refresh restores the page you were on. Lives in
// sessionStorage deliberately — it survives reloads, dies with the tab,
// and two tabs never fight over one lesson the way localStorage would.
//
// The one thing this cannot restore is the live voice call itself; the
// transcript, coverage, grades and boards all come back, and the mic
// simply reconnects.

const KEY = "teachit.tab.v1";

export function loadSnapshot() {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (parsed && parsed.v === 1 && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Corrupt or unavailable — a fresh start beats a blank page.
  }

  return null;
}

export function saveSnapshot(snapshot) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ v: 1, ...snapshot }));
  } catch {
    // Quota or private mode — the app just behaves as before this existed.
  }
}
