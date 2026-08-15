import { useEffect, useState } from "react";
import { useReducedMotion } from "../motion";

// The wait between naming a topic and being handed a lesson.
//
// It is five to ten seconds of a model actually reading the topic, and the
// honest thing to do with it is say so. A spinner claims nothing and teaches
// nothing; these lines are the real steps, in the order they really happen,
// so the wait reads as work rather than as lag.
//
// The lines advance on a timer rather than on real progress, and that is a
// deliberate limit worth naming: the server returns one JSON payload at the
// end, so there is no per-step signal to hang this on. The timings are set
// from the measured ~5s round trip and the last line is written to be true
// for as long as it takes, so a slow request never shows a step that has
// already finished.

const STEP_MS = 1600;

export function Thinking({ tt, who, glyph, steps = 4 }) {
  const calm = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Stop one short of the end and stay there. Cycling back to the first
    // line would tell someone the work restarted.
    if (step >= steps - 1) {
      return;
    }

    const timer = setTimeout(() => setStep((n) => n + 1), STEP_MS);

    return () => clearTimeout(timer);
  }, [step, steps]);

  return (
    <div className="thinking" role="status" aria-live="polite">
      <div className="thinking-face" aria-hidden="true">
        <span className={calm ? "" : "thinking-glyph"}>{glyph}</span>

        {!calm && (
          <span className="thinking-pulse">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      <div className="thinking-lines">
        {Array.from({ length: steps }, (_, i) => (
          <p
            key={i}
            className={`thinking-line ${
              i < step ? "done" : i === step ? "now" : "next"
            }`}
          >
            <span className="thinking-tick" aria-hidden="true">
              {i < step ? "✓" : i === step ? "›" : "·"}
            </span>

            {tt(`thinkingStep${i + 1}`, { name: who })}
          </p>
        ))}
      </div>
    </div>
  );
}
