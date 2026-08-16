import { useState } from "react";
import {
  PROVIDERS,
  byoKey,
  byoBase,
  setByoKey,
  setByoProvider,
  clearByoKey,
} from "../apikey";

// Shown when the deploy's own key has stopped working, so a visitor with a key
// of their own can carry on rather than meeting a dead site.
//
// It asks for a provider as well as a key, because a key alone does not say
// where to send it. An OpenAI key posted at a German endpoint authenticates
// against nothing, and the resulting 401 reads as "your key is broken" to
// somebody who just pasted a working key.
//
// The promise on screen is one this code keeps: the key goes into this tab's
// sessionStorage and onto request headers, and the server uses it for a single
// call without logging, storing or returning it. Saying so plainly matters —
// asking a stranger to paste a credential is a big ask, and the only thing that
// makes it reasonable is being specific about where it goes and how long it
// lives.
export function KeyPrompt({ tt, onSaved }) {
  const [value, setValue] = useState(byoKey);
  const [provider, setProvider] = useState(
    () => PROVIDERS.find((p) => p.base === byoBase()) ?? PROVIDERS[0]
  );
  const [model, setModel] = useState(
    () => PROVIDERS.find((p) => p.base === byoBase())?.model ?? PROVIDERS[0].model
  );
  const [saved, setSaved] = useState(Boolean(byoKey()));

  const pick = (next) => {
    setProvider(next);
    // The provider's own default, so switching never leaves a model name
    // belonging to the previous one.
    setModel(next.model);
  };

  const save = (event) => {
    event.preventDefault();

    const clean = value.trim();

    if (!clean) {
      return;
    }

    setByoKey(clean);
    setByoProvider(provider.base, model.trim() || provider.model);
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
        <div className="keyprompt-providers">
          {PROVIDERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`keyprompt-provider ${
                provider.id === entry.id ? "selected" : ""
              }`}
              onClick={() => pick(entry)}
              title={entry.hint}
            >
              {entry.label}
            </button>
          ))}
        </div>

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

        <input
          className="keyprompt-model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={provider.model}
          autoComplete="off"
          spellCheck="false"
          title={tt("keyModel")}
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
