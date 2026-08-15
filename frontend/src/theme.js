// Which of the two looks is on, and remembering it.
//
// Light is the default and that is a deliberate choice rather than an
// oversight: it is the look the app was built and demonstrated in, so anyone
// who never touches the switch — a judge on a borrowed laptop, a phone with
// its own opinion about colour schemes — sees exactly what was designed.
// The device preference is offered as a starting point only for someone who
// has never chosen, and any explicit choice outranks it forever after.
//
// The attribute goes on <html> rather than <body> because the theme has to be
// resolvable before the app mounts. See the inline script in index.html: it
// runs before first paint so the page never flashes the wrong ground.

const KEY = "titanom-theme";

export const THEMES = ["light", "dark"];

export function systemPreference() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// What was explicitly chosen, or null if nobody has chosen yet. The
// distinction matters: null means "follow the device", not "light".
export function storedTheme() {
  try {
    const saved = localStorage.getItem(KEY);

    return THEMES.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function resolveTheme() {
  return storedTheme() ?? systemPreference();
}

export function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : "light";

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", next);
  }

  return next;
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode. The theme still applies for this visit; it just will not
    // be remembered, which is a far better outcome than refusing to switch.
  }

  return applyTheme(theme);
}

// Follow the device only while no explicit choice exists — flipping the OS to
// dark should move an undecided visitor, and must not override someone who
// deliberately picked light.
export function watchSystemTheme(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const handler = (event) => {
    if (storedTheme() === null) {
      onChange(applyTheme(event.matches ? "dark" : "light"));
    }
  };

  query.addEventListener("change", handler);

  return () => query.removeEventListener("change", handler);
}

// The interface language, remembered the way the theme is.
//
// It used to live only in App's state and in the per-lesson snapshot, which
// meant a choice made on an empty home page was gone on the next reload —
// and the arrival screen, which renders before any lesson exists, always
// came back in English however many times someone had picked Deutsch.
// localStorage rather than sessionStorage: this is a preference about the
// person, not about the tab, and it should survive a closed window.

const LANG_KEY = "titanom-language";

export function storedLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);

    return saved === "en" || saved === "de" ? saved : null;
  } catch {
    return null;
  }
}

export function rememberLanguage(code) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    // Private mode. The choice still applies for this visit.
  }

  return code;
}
