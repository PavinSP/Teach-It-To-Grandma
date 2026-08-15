import { useState } from "react";
import { byoKey, setByoKey, clearByoKey } from "../apikey";

// Shown when the deploy's own key has stopped working, so a visitor with a
// TitanomGPT key of their own can carry on rather than meeting a dead site.
//
// The promise on screen is one this code actually keeps: the key goes into
// this tab's sessionStorage and onto one request header, and the server uses
// it for a single call without logging, storing or returning it. Saying so
// plainly matters — asking a stranger to paste a credential is a big ask, and
// the only thing that makes it reasonable is being specific about where it
// goes and how long it lives.
export function KeyPrompt({ tt, onSaved }) {
  const [value, setValue] = useState(byoKey);
  const [saved, setSaved] = useState(Boolean(byoKey()));

  const save = (event) => {
    event.preventDefault();

    const clean = value.trim();

    if (!clean) {
      return;
    }

    setByoKey(clean);
    setSaved(true);
    onSaved?.();
  };

  const forget = () => {
    clearByoKey();
    setValue("");
    setSaved(false);
  };

  return (
    <section className="keyprompt">
      <h3 className="keyprompt-title">{tt("keyTitle")}</h3>

      <p className="keyprompt-body">{tt("keyBody")}</p>

      <form className="keyprompt-form" onSubmit={save}>
        <input
          className="keyprompt-input"
          // type=password so a key pasted on a projector is not readable from
          // the back of the room.
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={tt("keyPlaceholder")}
          autoComplete="off"
          spellCheck="false"
        />

        <button className="keyprompt-save" type="submit" disabled={!value.trim()}>
          {tt(saved ? "keySaved" : "keySave")}
        </button>

        {saved && (
          <button className="keyprompt-forget" type="button" onClick={forget}>
            {tt("keyForget")}
          </button>
        )}
      </form>

      <p className="keyprompt-privacy">{tt("keyPrivacy")}</p>
    </section>
  );
}
