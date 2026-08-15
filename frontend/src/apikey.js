// A visitor's own TitanomGPT key, for when the deploy's own key has expired.
//
// sessionStorage, and that is the security decision rather than a convenience
// one. The key lives in this tab and dies with it: closing the tab clears it,
// another tab never sees it, and nothing on this machine keeps a copy after
// the browser is shut. localStorage would have saved a paste per visit at the
// cost of leaving somebody's credential sitting on disk indefinitely, which is
// not a trade worth making for a demo.
//
// The server side of the same promise: the key rides one header on one
// request, builds a client for the life of that call, and is never logged,
// never persisted and never echoed back.

const KEY = "titanom-byo-key";

export function byoKey() {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setByoKey(value) {
  try {
    const clean = String(value ?? "").trim();

    if (clean) {
      sessionStorage.setItem(KEY, clean);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Private mode. Nothing to do — the paste simply will not survive a
    // reload, and the prompt reappears, which is the correct behaviour.
  }
}

export function clearByoKey() {
  setByoKey("");
}

// Folded into every request that reaches a model. Absent when there is no
// key, so a working deploy sends nothing extra.
export function keyHeaders() {
  const key = byoKey();

  return key ? { "x-titanom-key": key } : {};
}
