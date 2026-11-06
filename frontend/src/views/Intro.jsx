import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../motion";
import { CHARACTERS } from "../characters";
import { WORKPLACE_CAST } from "../workplace";

// The arrival, in three beats:
//
//   0  the provocation, with Grandma alive beside it: her head follows the
//      pointer, her mouth moves while she greets you
//   1  the ten-second test: one question, a clock, and a "but why?".
//      Nothing typed here leaves the page, and there is no model involved;
//      it only has to make someone feel the gap between knowing and explaining
//   2  the room: everyone who might be listening flies in from beyond the
//      edges of the screen
//
// It plays on every load, which is a deliberate choice and a risky one: an
// intro you cannot get past is the fastest way to make a demo tedious. So
// every exit is wired. Skip, Escape and (outside a text box) Enter and Space
// are always available, and the test can be skipped from its own screen.
//
// Nothing here talks to the app. It renders, it calls onDone, and it is gone.

const QUESTIONS = 3;

// Grandma, alive. Reads the pointer for her head and the greeting for her mouth.
function LiveGrandma({ line, calm }) {
  const tilt = useRef(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (calm) {
      return undefined;
    }

    let i = 0;

    const timer = setInterval(() => {
      i += 1;
      setTyped(line.slice(0, i));

      if (i >= line.length) {
        clearInterval(timer);
      }
    }, 34);

    return () => clearInterval(timer);
  }, [line, calm]);

  useEffect(() => {
    if (calm) {
      return undefined;
    }

    const onMove = (event) => {
      const node = tilt.current;

      if (!node) {
        return;
      }

      const box = node.getBoundingClientRect();
      const dx = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
      const dy = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);

      node.style.transform = `rotateY(${dx * 16}deg) rotateX(${-dy * 12}deg)`;
    };

    window.addEventListener("pointermove", onMove);

    return () => window.removeEventListener("pointermove", onMove);
  }, [calm]);

  // Her mouth moves for exactly as long as she is still typing the greeting.
  const talking = !calm && typed.length < line.length;

  return (
    <div className="intro-grandma" aria-hidden="true">
      <div className="intro-grandma-tilt" ref={tilt}>
        <img src="/peep-grandma.png" alt="" />
        <img
          className="intro-grandma-mouth"
          src="/peep-grandma-talk.png"
          alt=""
          style={{ opacity: talking ? undefined : 0 }}
          data-talking={talking}
        />
      </div>

      <p className="intro-grandma-line">
        {calm ? line : typed}
        {!calm && <span className="intro-caret" />}
      </p>
    </div>
  );
}

// The ten-second test, as an exam paper.
//
// Grandma asks each question out loud, in her own voice (short clips the
// server makes once from a fixed list of lines and remembers), and you answer
// out loud: your words appear on the paper as you speak. Typing always works,
// and everything degrades to it: no voice key means a silent paper, no speech
// recognition in the browser means a typed answer.
//
// Two honest limits. The questions and follow-ups are scripted, so nothing
// here needs a model. And speaking is not private in the way typing is: the
// browser's own speech service turns the sound into text, which the screen
// says before it asks for the microphone.
const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

const FIRST_SECONDS = 10;
const WHY_SECONDS = 15;
// The question, then one "but why?": two questions in all.
const LAST_STEP = 1;
// Saying "I don't know" is not a failure to be stamped: she tries another
// subject instead. Twice at most, so the screen cannot go on forever.
const MAX_SWAPS = 2;

// A short answer that is really "I don't know", spoken or typed. Anything
// longer is an attempt, even if it says "not sure" along the way.
const NOT_KNOWING = {
  en: /\b(i\s*(do\s*not|don'?t)\s*know|no\s*idea|not\s*sure|no\s*clue|dunno|i\s*give\s*up)\b/i,
  de: /(wei(ß|ss)\s*(ich\s*)?nicht|keine\s*ahnung|nicht\s*sicher|keinen\s*schimmer|gebe\s*auf)/i,
};

function admitsNotKnowing(text, lang) {
  const said = String(text ?? "").trim();

  return said.length > 0 && said.split(/\s+/).length <= 9 && NOT_KNOWING[lang].test(said);
}
const SILENCE_MS = 1800;

function Test({ tt, uiLang, api, calm, onDone, onSkip }) {
  const [question, setQuestion] = useState(() => 1 + Math.floor(Math.random() * QUESTIONS));
  const questionRef = useRef(question);
  const swaps = useRef(0);
  const [swapNote, setSwapNote] = useState(false);
  const [step, setStep] = useState(0); // 0 is the question, 1 is the "but why?"
  const [mode, setMode] = useState("intro"); // intro | ask | answer | end
  const [left, setLeft] = useState(FIRST_SECONDS);
  const [answer, setAnswer] = useState("");
  const [sound, setSound] = useState(true);
  const [mic, setMic] = useState(Boolean(SpeechRecognition));
  const [heard, setHeard] = useState(false);

  const audio = useRef(null);
  const rec = useRef(null);
  const silence = useRef(null);
  const timer = useRef(null);
  const answerRef = useRef("");
  const alive = useRef(true);
  // True only while an answer is being taken. A recogniser keeps delivering a
  // last result after it is stopped; without this, that late result re-armed the
  // silence timer and ended the test during the next question.
  const taking = useRef(false);
  const field = useRef(null);

  const lang = uiLang === "de" ? "de" : "en";
  const lineId = (n, q = questionRef.current) => (n === 0 ? `q${q}` : `q${q}w${n}`);
  const lineText = (n) => (n === 0 ? tt(`introQ${question}`) : tt(`introQ${question}Why${n}`));

  const stopListening = () => {
    taking.current = false;
    clearTimeout(silence.current);
    clearInterval(timer.current);

    if (rec.current) {
      // Detached first, so its closing events cannot call back into the test.
      rec.current.onresult = null;
      rec.current.onerror = null;
    }

    try {
      rec.current?.stop();
    } catch {
      // Already stopped.
    }

    rec.current = null;
  };

  // Plays one of Grandma's lines and resolves when it ends, or at once if
  // there is no sound to play: voice off, no key, or the clip fails.
  const say = (id) =>
    new Promise((resolve) => {
      if (!sound || !alive.current) {
        resolve();
        return;
      }

      const clip = new Audio(`${api}/api/intro/audio/${lang}/${id}`);
      audio.current = clip;

      const finish = () => resolve();

      clip.addEventListener("ended", finish, { once: true });
      clip.addEventListener("error", finish, { once: true });
      setTimeout(finish, 15000);
      clip.play().catch(finish);
    });

  const finishAnswer = (unsure = false) => {
    if (!taking.current) {
      return;
    }

    const said = answerRef.current;

    stopListening();

    if (unsure || admitsNotKnowing(said, lang)) {
      if (swaps.current < MAX_SWAPS) {
        swaps.current += 1;
        swap((questionRef.current % QUESTIONS) + 1);
      } else {
        conclude();
      }

      return;
    }

    if (step >= LAST_STEP) {
      conclude();
    } else {
      ask(step + 1);
    }
  };

  // "I don't know" about the bicycle: carry on with the fridge instead.
  const swap = async (next) => {
    questionRef.current = next;
    setQuestion(next);
    setStep(0);
    setMode("ask");
    setSwapNote(true);
    setAnswer("");
    await say("swap");

    if (alive.current) {
      ask(0, next);
    }
  };

  const conclude = async () => {
    setMode("end");
    await say("gap");
  };

  const listen = (seconds) => {
    setAnswer("");
    answerRef.current = "";
    setHeard(false);
    setSwapNote(false);
    setLeft(seconds);
    setMode("answer");
    taking.current = true;

    let remaining = seconds;

    timer.current = setInterval(() => {
      remaining -= 1;
      setLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer.current);
        finishAnswerRef.current();
      }
    }, 1000);

    if (mic && SpeechRecognition) {
      try {
        const r = new SpeechRecognition();

        r.lang = lang === "de" ? "de-DE" : "en-US";
        r.continuous = true;
        r.interimResults = true;

        r.onresult = (event) => {
          if (!taking.current) {
            return;
          }

          let text = "";

          for (let i = 0; i < event.results.length; i += 1) {
            text += event.results[i][0].transcript;
          }

          answerRef.current = text;
          setAnswer(text);
          setHeard(true);

          // Stopped talking: hand the answer in.
          clearTimeout(silence.current);
          silence.current = setTimeout(() => finishAnswerRef.current(), SILENCE_MS);
        };

        // Refused or unavailable: carry on by typing, without a fuss.
        r.onerror = (event) => {
          if (/not-allowed|service-not-allowed|audio-capture/.test(event.error)) {
            setMic(false);
          }
        };

        r.start();
        rec.current = r;
      } catch {
        setMic(false);
      }
    }

    setTimeout(() => field.current?.focus(), 0);
  };

  const ask = async (n, q = questionRef.current) => {
    setStep(n);
    setMode("ask");
    setAnswer("");
    await say(lineId(n, q));

    if (alive.current) {
      listen(n === 0 ? FIRST_SECONDS : WHY_SECONDS);
    }
  };

  // The latest finishAnswer, so timers and recognition callbacks never call a
  // stale copy that remembers an earlier step.
  const finishAnswerRef = useRef(finishAnswer);

  useEffect(() => {
    finishAnswerRef.current = finishAnswer;
  });

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      stopListening();
      audio.current?.pause();
    };
  }, []);

  const keys = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finishAnswer();
    }
  };

  const total = step === 0 ? FIRST_SECONDS : WHY_SECONDS;
  const verdict = mode === "end";
  const text = lineText(mode === "end" ? 0 : step);

  return (
    <div className="intro-paper-wrap">
      <div className={`intro-paper ${verdict ? "done" : ""}`}>
        <div
          className="intro-fuse"
          style={{
            width: mode === "answer" ? `${(left / total) * 100}%` : mode === "intro" || mode === "ask" ? "100%" : "0%",
            transition: calm || mode !== "answer" ? "none" : "width 1s linear",
          }}
        />

        <h2 className="intro-paper-head">{tt("introPaperQ", { n: mode === "end" ? 1 : step + 1 })}</h2>

        <p className="intro-paper-q" key={`${step}-${mode === "end"}`}>
          {text}
        </p>

        {mode === "intro" && (
          <>
            <p className="intro-paper-note">{tt("introTestBody")}</p>
            <div className="intro-paper-actions">
              <button className="intro-paper-go" autoFocus onClick={() => ask(0)}>
                {tt("introTestStart")}
              </button>
              <button className="intro-paper-link" onClick={() => setSound((on) => !on)}>
                {tt(sound ? "introSoundOn" : "introSoundOff")}
              </button>
              {SpeechRecognition && (
                <button className="intro-paper-link" onClick={() => setMic((on) => !on)}>
                  {tt(mic ? "introMicOn" : "introMicOff")}
                </button>
              )}
              <button className="intro-paper-link" onClick={onSkip}>
                {tt("introTestSkip")}
              </button>
            </div>
          </>
        )}

        {mode === "ask" && (
          <p className="intro-paper-note intro-asking">
            <span className="intro-wave" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            {tt(swapNote ? "introSwap" : "introAsking")}
          </p>
        )}

        {mode === "answer" && (
          <>
            <textarea
              ref={field}
              className="intro-paper-input"
              rows={3}
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value);
                answerRef.current = event.target.value;
              }}
              onKeyDown={keys}
              placeholder={tt(mic ? "introListening" : "introTypeHere")}
            />

            <div className="intro-paper-actions">
              <span className="intro-paper-clock">{left}s</span>
              {mic && (
                <span className={`intro-paper-mic ${heard ? "heard" : ""}`}>
                  🎙 {tt("introListening")}
                </span>
              )}
              <button className="intro-paper-go" onClick={() => finishAnswer()}>
                {tt("introDone")}
              </button>
              <button className="intro-paper-link" onClick={() => finishAnswer(true)}>
                {tt("introTestUnsure")}
              </button>
            </div>
          </>
        )}

        {mode === "end" && (
          <>
            <div className="intro-stamp">{tt("introStamp")}</div>

            <p className="intro-paper-pen">{tt("introPen")}</p>

            <div className="intro-paper-actions">
              <button className="intro-paper-go" autoFocus onClick={onDone}>
                {tt("introMeet")}
              </button>
            </div>
          </>
        )}
      </div>

      <p className="intro-privacy">
        {mic && mode !== "end" ? tt("introPrivateVoice") : tt("introTestPrivate")}
      </p>
    </div>
  );
}

// Everyone who might be listening, not only one mode's cast: the three
// students' listeners and the three colleagues, plus the manager, the expert
// and the professor, who appear in both. They fly in from beyond the edges of
// the screen, one after another, and settle in a row.
const EVERYONE = [
  ...CHARACTERS,
  ...WORKPLACE_CAST.filter((c) => ["newhire", "operator", "whyasker"].includes(c.id)),
];

// Where each one comes from: left, right, then below, over and over.
const ENTRANCES = [
  ["-120vw", "0vh", "-18deg"],
  ["120vw", "0vh", "18deg"],
  ["0vw", "90vh", "0deg"],
];

function Room({ tt, uiLang }) {
  const [active, setActive] = useState(null);
  const who = active === null ? null : EVERYONE[active];

  return (
    <div className="intro-room">
      <div className="intro-eyebrow">{tt("introEyebrow")}</div>

      <h1 className="intro-title intro-title-sm">
        <span className="intro-line">{tt("introRoom1")}</span>
        <span className="intro-line intro-line-2">{tt("introRoom2")}</span>
      </h1>

      <p className="intro-body intro-body-tight">{tt("introRoomBody")}</p>

      <ul className={`intro-seats ${active === null ? "" : "focus"}`}>
        {EVERYONE.map((c, i) => {
          const [dx, dy, spin] = ENTRANCES[i % ENTRANCES.length];

          return (
            <li
              key={c.id}
              className={active === i ? "on" : ""}
              style={{ "--i": i, "--dx": dx, "--dy": dy, "--spin": spin }}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            >
              <img src={c.image} alt="" />
              <b>{c.shortName}</b>
            </li>
          );
        })}
      </ul>

      <p className="intro-room-line" aria-live="polite">
        {who ? `${who.shortName}: ${uiLang === "de" ? who.hookDe ?? who.hook : who.hook}` : "\u00a0"}
      </p>
    </div>
  );
}

export function Intro({ tt, uiLang = "en", api = "", onDone }) {
  const calm = useReducedMotion();
  const [beat, setBeat] = useState(0);

  const advance = () => {
    if (beat === 0) {
      setBeat(1);
    } else if (beat === 1) {
      setBeat(2);
    } else {
      onDone();
    }
  };

  // Enter and Space advance, except where the person is typing; Escape leaves
  // entirely. Bound to the window so it works with nothing focused.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDone();
        return;
      }

      const typing = /^(TEXTAREA|INPUT)$/.test(event.target?.tagName ?? "");

      // On the test screen the buttons and the paper handle their own keys.
      if (typing || beat === 1) {
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

  return (
    <main className={`intro ${calm ? "calm" : ""}`} data-beat={beat}>
      <button className="intro-skip" onClick={onDone}>
        {tt("introSkip")}
      </button>

      {beat === 0 && (
        <section className="intro-stage intro-split" key="b0">
          <div>
            <div className="intro-eyebrow">{tt("introEyebrow")}</div>

            <h1 className="intro-title">
              <span className="intro-line">{tt("introLine1")}</span>
              <span className="intro-line intro-line-2">{tt("introLine2")}</span>
            </h1>

            <p className="intro-body">{tt("introBody")}</p>

            <div className="intro-actions">
              <button className="intro-enter" onClick={advance} autoFocus>
                {tt("introEnter")}
              </button>

              <span className="intro-hint">{tt("introHint")}</span>
            </div>
          </div>

          <LiveGrandma line={tt("introGreet")} calm={calm} />
        </section>
      )}

      {beat === 1 && (
        <section className="intro-stage intro-test" key="b1">
          <div className="intro-eyebrow">{tt("introTestEyebrow")}</div>

          <Test
            tt={tt}
            uiLang={uiLang}
            api={api}
            calm={calm}
            onDone={() => setBeat(2)}
            onSkip={() => setBeat(2)}
          />
        </section>
      )}

      {beat === 2 && (
        <section className="intro-stage intro-stage-wide" key="b2">
          <Room tt={tt} uiLang={uiLang} />

          <div className="intro-actions">
            <button className="intro-enter" onClick={onDone} autoFocus>
              {tt("intro2Enter")}
            </button>

            <span className="intro-hint">{tt("introHint")}</span>
          </div>
        </section>
      )}

      <div className="intro-beats" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <i key={n} className={beat === n ? "on" : ""} />
        ))}
      </div>
    </main>
  );
}
