import { useEffect, useState } from "react";
import { resolveTheme, applyTheme, saveTheme, watchSystemTheme } from "../theme";

// The switch. Deliberately a real button with a real label rather than a bare
// icon: an unlabelled sun/moon is a guess about which state it is showing —
// the current one or the one you would get — and people guess wrong.
export function ThemeToggle({ tt }) {
  const [theme, setTheme] = useState(() => resolveTheme());

  // The inline script in index.html already set the attribute before paint.
  // This re-asserts it for React's benefit and covers the case where the
  // script could not run at all.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => watchSystemTheme(setTheme), []);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(saveTheme(next))}
      title={tt(next === "dark" ? "themeToDark" : "themeToLight")}
      aria-label={tt(next === "dark" ? "themeToDark" : "themeToLight")}
    >
      <span className="theme-toggle-glyph" aria-hidden="true">
        {theme === "dark" ? "☾" : "☀"}
      </span>

      <span className="theme-toggle-label">
        {tt(theme === "dark" ? "themeDark" : "themeLight")}
      </span>
    </button>
  );
}
