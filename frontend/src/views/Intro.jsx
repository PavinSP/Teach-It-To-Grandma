import { useEffect, useState } from "react";
import { useReducedMotion } from "../motion";

// The arrival, in two beats: the provocation, then who is waiting.
//
// It plays on every load, which is a deliberate choice and a risky one — an
// intro you cannot get past is the fastest way to make a demo tedious for the
// person running it. So every possible exit is wired: Enter, Escape, Space,
// any click on the skip control, and the second beat is never more than one
// key away. Someone presenting for the fifth time can be at the topic box in
// under a second; someone arriving for the first time gets the whole thing.
//
// Nothing here talks to the app. It renders, it calls onDone, and it is gone.

export function Intro({ tt, onDone }) {
  const calm = useReducedMotion();
  const [beat, setBeat] = useState(0);

  const advance = () => (beat === 0 ? setBeat(1) : onDone());

  // Enter and Space advance; Escape leaves entirely. Bound to the window so
  // it works without anything being focused, which is what a keyboard user
  // arriving on a fresh page actually has.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDone();
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        advance();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);

  const first = beat === 0;

  return (
    <main className={`intro ${calm ? "calm" : ""}`} data-beat={beat}>
      <button className="intro-skip" onClick={onDone}>
        {tt("introSkip")}
      </button>

      {/* Keyed so React remounts on the beat change and the entrance
          animation runs again for the second screen rather than only once. */}
      <section className="intro-stage" key={beat}>
        <div className="intro-eyebrow">{tt("introEyebrow")}</div>

        <h1 className="intro-title">
          <span className="intro-line">
            {tt(first ? "introLine1" : "intro2Line1")}
          </span>
          <span className="intro-line intro-line-2">
            {tt(first ? "introLine2" : "intro2Line2")}
          </span>
        </h1>

        <p className="intro-body">{tt(first ? "introBody" : "intro2Body")}</p>

        <div className="intro-actions">
          <button className="intro-enter" onClick={advance} autoFocus>
            {tt(first ? "introEnter" : "intro2Enter")}
          </button>

          <span className="intro-hint">{tt("introHint")}</span>
        </div>

        <div className="intro-beats" aria-hidden="true">
          <i className={beat === 0 ? "on" : ""} />
          <i className={beat === 1 ? "on" : ""} />
        </div>
      </section>
    </main>
  );
}
