import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUIZ_API,
  activeGame,
  createGame,
  fetchQuestions,
  fetchState,
  forgetGame,
  joinGame,
  makeDeck,
  playerId,
  rememberGame,
  rememberName,
  rememberedName,
  sendAnswer,
  startGame,
  voiceGame,
} from "../quiz";
import { t } from "../strings";
import "../styles/quiz.css";

// The side mode, whole. Its own state, its own screens, and no contact with
// the lesson's — a game does not need to know which character is teaching or
// what was said to her, and keeping it that way means it cannot break any of
// it either.
//
// The phase is never decided here. It arrives from the server on every
// message and is rendered as given: the client draws a countdown, it does
// not run one, so two devices cannot disagree about which question is live.

const LETTERS = ["A", "B", "C", "D"];

// Only ever redrawn from the clock; four times a second is smooth enough for
// a number counting down and cheap enough to leave running.
const TICK_MS = 250;

// A healthy stream says something at least every 1.5 seconds, tick or news.
// Four seconds of nothing therefore means it is not arriving promptly —
// killed by a proxy, held by a platform that buffers streamed responses, or
// a tab that went to sleep — and the state is worth fetching by hand rather
// than sitting on a screen that has quietly stopped.
const QUIET_MS = 4000;

export function Quiz({ language, initialCode = "", onExit }) {
  const me = useRef(playerId()).current;

  // The quiz translates itself rather than borrowing the lesson's t(), and
  // the reason is a reload: App's language comes from a lesson snapshot, so
  // a tab that reloaded straight back into a German game came back with
  // German questions under English labels. What the tab was reading when it
  // entered the game is stored with the game.
  const [uiLanguage] = useState(() => activeGame()?.language ?? language);

  // Stable across renders — the stream effect depends on it, and a fresh
  // function every render would tear the stream down and rebuild it.
  const tt = useCallback((key, vars) => t(uiLanguage, key, vars), [uiLanguage]);
  const deck = useRef(null);

  if (!deck.current && typeof window !== "undefined") {
    deck.current = makeDeck();
  }

  const [screen, setScreen] = useState("menu");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  const [name, setName] = useState(rememberedName);
  const [topic, setTopic] = useState("");
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());

  const [code, setCode] = useState("");
  const [questions, setQuestions] = useState([]);
  const [state, setState] = useState(null);

  // What the server's clock reads minus what this one does. Every deadline
  // is in the server's terms, so this is what makes them mean anything here.
  const [offset, setOffset] = useState(0);
  const [clientNow, setClientNow] = useState(() => Date.now());

  // Shown the instant it is tapped rather than when the round trip lands.
  // The server still decides whether it counted.
  const [picked, setPicked] = useState({});

  const lastMessage = useRef(0);
  const spoken = useRef(-1);

  // The two states the fallback below has to react quickly in: waiting in
  // the lobby, and waiting on the other player after answering.
  const answered = useRef(false);
  const waiting = useRef(false);

  const now = clientNow + offset;

  useEffect(() => {
    const timer = setInterval(() => setClientNow(Date.now()), TICK_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    answered.current = Boolean(
      state?.phase === "question" && picked[state.index] != null
    );

    waiting.current = state?.phase === "lobby" || state?.phase === "countdown";
  }, [state, picked]);

  // Cleared as well as disposed, so the next render builds a new one.
  //
  // Without the clear this is silent in development and nowhere else, which
  // is the worst way to be wrong: StrictMode mounts, unmounts and remounts
  // every component, so this cleanup runs once immediately — and a ref
  // survives that, so the deck every later question asked to speak was one
  // that had already been thrown away. The build behaved perfectly.
  useEffect(
    () => () => {
      deck.current?.dispose();
      deck.current = null;
    },
    []
  );

  // The stream. It closes itself every few seconds by design and EventSource
  // reconnects on its own — so an error here is routine and deliberately not
  // surfaced. The one that matters is a game that no longer exists, which
  // arrives named.
  useEffect(() => {
    if (screen !== "game" || !code) {
      return;
    }

    const source = new EventSource(`${QUIZ_API}/api/quiz/${code}/stream`);

    const take = (next) => {
      lastMessage.current = Date.now();

      if (next.serverNow) {
        setOffset(next.serverNow - Date.now());
      }

      setClientNow(Date.now());
      setState(next);
    };

    source.onmessage = (event) => {
      try {
        take(JSON.parse(event.data));
      } catch {
        // A half-written message across a reconnect. The next one is 500ms
        // away and carries the same state.
      }
    };

    // Proof of life, not news. It updates nothing on screen; it only says
    // the stream is arriving promptly, which is what the fallback below
    // watches for.
    source.addEventListener("tick", (event) => {
      lastMessage.current = Date.now();

      try {
        const { serverNow } = JSON.parse(event.data);
        const drift = serverNow - Date.now();

        // Re-rendering the whole game four times a second to correct the
        // clock by six milliseconds is not worth doing.
        setOffset((prev) => (Math.abs(drift - prev) > 250 ? drift : prev));
      } catch {
        // Proof of life either way — it arrived.
      }
    });

    source.addEventListener("gone", () => {
      setError(tt("quizGone"));
      source.close();
    });

    return () => source.close();
  }, [screen, code, tt]);

  // What happens when the stream does not.
  //
  // A dead stream and a buffered one look the same from here: nothing
  // arrives for a while. Both are real — a proxy that eats text/event-stream,
  // a platform that holds a streamed response until the function returns —
  // and neither can be detected from the server side, so the client treats
  // prolonged silence as the signal and fetches the state itself.
  //
  // When the stream is healthy this costs nothing at all: ticks arrive at
  // least every 1.5s, so neither threshold is ever crossed and no request is
  // made. The tighter one applies once this player has answered, because
  // that is the only moment when something can happen that the clock alone
  // could not have predicted — the other player answering too, and the round
  // closing early.
  useEffect(() => {
    if (screen !== "game" || !code) {
      return;
    }

    const timer = setInterval(async () => {
      const quiet = Date.now() - lastMessage.current;

      // Three thresholds, and they are the three places the clock cannot
      // predict what happens next: waiting in the lobby for a player to
      // arrive or the host to start, and waiting on the other player once
      // you have answered. Everywhere else the next four seconds are already
      // known from the deadline, so silence there costs nothing.
      const impatient = waiting.current ? 1500 : answered.current ? 1800 : QUIET_MS;

      if (quiet < impatient) {
        return;
      }

      try {
        const next = await fetchState(code);

        lastMessage.current = Date.now();
        setOffset(next.serverNow - Date.now());
        setClientNow(Date.now());
        setState(next);
      } catch {
        // Nothing useful to say — the next tick tries again.
      }
    }, 600);

    return () => clearInterval(timer);
  }, [screen, code]);

  // One question, one playing. Seeking to where the round already is rather
  // than starting the sentence over is what keeps a device that reloaded
  // mid-question level with the one that did not.
  useEffect(() => {
    if (!state || !deck.current) {
      return;
    }

    if (state.phase === "question" && spoken.current !== state.index) {
      spoken.current = state.index;
      deck.current.play(code, state.index, Date.now() + offset - state.opensAt);
    }

    if (state.phase === "over") {
      deck.current.stop();
    }
    // offset is deliberately absent: it settles within one message and a
    // change to it must not re-trigger a question that already spoke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.index, code]);

  const enter = async (gameCode, playerName) => {
    const meta = await fetchQuestions(gameCode);

    rememberGame(gameCode, playerName, uiLanguage);
    setQuestions(meta.questions);
    setCode(gameCode);
    deck.current?.warm(gameCode, meta.questions.length);
    lastMessage.current = Date.now();
    setScreen("game");
  };

  // A reload is not a new player. The server has always allowed a known id
  // back into its own game — this is the half that was missing: the tab
  // remembering which game that was, so a phone that reloads mid-question
  // lands back on the same question instead of the front page, with the
  // other player still sitting there waiting for it.
  useEffect(() => {
    const saved = activeGame();

    // An invite link beats a remembered game. Clicking one is somebody
    // saying which game they mean, and the remembered one outlives the game
    // it refers to — so without this, being sent a link to the next game
    // silently drops you back into the last one.
    if (initialCode || !saved?.code) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await joinGame(saved.code, me, saved.name);

        if (!cancelled) {
          await enter(saved.code, saved.name);
        }
      } catch {
        // Expired, full, or gone. Start over rather than sit on a screen
        // that will never fill in.
        forgetGame();
      }
    })();

    return () => {
      cancelled = true;
    };
    // Once, on mount, before anything else can have set a code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (event) => {
    event.preventDefault();

    // First, and without an await in front of it. See makeDeck().
    deck.current?.unlock();

    setError("");
    setBusy("creating");
    setProgress(null);
    rememberName(name.trim());

    try {
      const game = await createGame(topic.trim(), language, {
        id: me,
        name: name.trim(),
      });

      // Voicing is batched by the server, so this is a loop rather than one
      // long request — and each pass is something honest to put on screen.
      setProgress({ voiced: 0, total: game.count });

      for (let pass = 0; pass < 8; pass++) {
        const step = await voiceGame(game.code);

        setProgress(step);

        if (step.done) {
          break;
        }
      }

      await enter(game.code, name.trim());
    } catch (err) {
      setError(err.message || tt("quizFailed"));
    } finally {
      setBusy("");
      setProgress(null);
    }
  };

  const join = async (event) => {
    event.preventDefault();

    deck.current?.unlock();

    setError("");
    setBusy("joining");
    rememberName(name.trim());

    try {
      const wanted = joinCode.trim().toUpperCase();

      await joinGame(wanted, me, name.trim());
      await enter(wanted, name.trim());
    } catch (err) {
      setError(err.status === 404 ? tt("quizNoGame") : err.message || tt("quizFailed"));
    } finally {
      setBusy("");
    }
  };

  const start = async () => {
    setBusy("starting");

    try {
      setState(await startGame(code, me));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const pick = async (choice) => {
    if (!state || state.phase !== "question" || picked[state.index] != null) {
      return;
    }

    const index = state.index;

    // A tap is a gesture, and after a reload it is the only one there has
    // been. Does nothing when sound is already working.
    deck.current?.unlock();

    setPicked((prev) => ({ ...prev, [index]: choice }));

    try {
      // The reply carries the state as it stands after this answer, which is
      // how the player who answered second sees the round close immediately
      // rather than on the next tick of the stream.
      setState(await sendAnswer(code, me, index, choice));
      lastMessage.current = Date.now();
    } catch (err) {
      // A closed question is the expected failure — the tap landed after
      // the deadline. Leave the choice shown; the summary is where it is
      // settled either way.
      if (err.status !== 409) {
        setError(err.message);
      }
    }
  };

  const leaveGame = () => {
    forgetGame();
    deck.current?.stop();
    spoken.current = -1;
    setState(null);
    setQuestions([]);
    setCode("");
    setPicked({});
    setError("");
    setTopic("");
    setJoinCode("");
    setScreen("menu");
  };

  // Leaving for the lesson must not leave a game behind that a reload would
  // drag someone back into.
  const exit = () => {
    forgetGame();
    deck.current?.stop();
    onExit();
  };

  const shell = (children) => (
    <main className="quiz">
      <div className="quiz-inner">{children}</div>
    </main>
  );

  if (screen === "menu") {
    return shell(
      <>
        <button className="quiz-exit" onClick={exit}>
          {tt("quizLeave")}
        </button>

        <div className="quiz-eyebrow">{tt("quizSideMode")}</div>
        <h1 className="quiz-h1">{tt("quizTitle")}</h1>
        <p className="quiz-what">{tt("quizWhatItIs")}</p>
        <p className="quiz-rules">{tt("quizScoring")}</p>

        <form className="quiz-form" onSubmit={create}>
          <label className="quiz-label" htmlFor="quiz-name">
            {tt("quizYourName")}
          </label>

          <input
            id="quiz-name"
            className="quiz-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            autoComplete="off"
          />

          <label className="quiz-label" htmlFor="quiz-topic">
            {tt("quizTopicLabel")}
          </label>

          <div className="quiz-row">
            <input
              id="quiz-topic"
              className="quiz-input quiz-grow"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={tt("quizTopicPlaceholder")}
              maxLength={120}
            />

            <button
              className="quiz-button"
              type="submit"
              disabled={Boolean(busy) || !topic.trim() || !name.trim()}
            >
              {busy === "creating" ? tt("quizBuilding") : tt("quizCreate")}
            </button>
          </div>
        </form>

        {busy === "creating" && (
          <p className="quiz-progress">
            {progress
              ? tt("quizVoicing", {
                  done: Math.min(progress.voiced + 1, progress.total),
                  total: progress.total,
                })
              : tt("quizBuilding")}
          </p>
        )}

        <form className="quiz-form quiz-join" onSubmit={join}>
          <label className="quiz-label" htmlFor="quiz-code">
            {tt("quizJoinLabel")}
          </label>

          <div className="quiz-row">
            <input
              id="quiz-code"
              className="quiz-input quiz-code-input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="QUIZ-XXXX"
              maxLength={9}
              autoComplete="off"
            />

            <button
              className="quiz-button quiz-secondary"
              type="submit"
              disabled={Boolean(busy) || !joinCode.trim() || !name.trim()}
            >
              {busy === "joining" ? tt("quizStarting") : tt("quizJoin")}
            </button>
          </div>
        </form>

        {error && <p className="quiz-error">{error}</p>}
      </>
    );
  }

  if (!state) {
    return shell(<p className="quiz-progress">{tt("quizBuilding")}</p>);
  }

  const players = state.results?.players ?? state.players;
  const opponent = players.find((player) => player.id !== me);
  const isHost = state.hostId === me;

  if (state.phase === "lobby") {
    return shell(
      <>
        <div className="quiz-eyebrow">{tt("quizYourCode")}</div>
        <div className="quiz-code">{state.code}</div>
        <p className="quiz-what">{tt("quizShareCode")}</p>

        <div className="quiz-label">{tt("quizPlayers")}</div>

        <ul className="quiz-players">
          {state.players.map((player) => (
            <li key={player.id}>
              <span className="quiz-player-name">{player.name}</span>

              <span className="quiz-player-tag">
                {player.id === me ? tt("quizYouAre") : ""}
                {player.id === state.hostId
                  ? `${player.id === me ? " · " : ""}${tt("quizHostIs")}`
                  : ""}
              </span>
            </li>
          ))}

          {state.players.length < 2 && (
            <li className="quiz-empty-seat">{tt("quizWaiting")}</li>
          )}
        </ul>

        {state.voiced < state.count && (
          <p className="quiz-progress">{tt("quizSilent")}</p>
        )}

        {isHost ? (
          <button
            className="quiz-button"
            onClick={start}
            disabled={state.players.length < 2 || busy === "starting"}
          >
            {busy === "starting" ? tt("quizStarting") : tt("quizStart")}
          </button>
        ) : (
          <p className="quiz-progress">
            {tt("quizWaitingHost", {
              name: state.players.find((p) => p.id === state.hostId)?.name ?? "",
            })}
          </p>
        )}

        {error && <p className="quiz-error">{error}</p>}
      </>
    );
  }

  if (state.phase === "countdown") {
    return shell(
      <div className="quiz-countdown">
        <div className="quiz-count-number">
          {Math.max(1, Math.ceil((state.opensAt - now) / 1000))}
        </div>

        <p className="quiz-what">{tt("quizCountdown")}</p>
      </div>
    );
  }

  if (state.phase === "over") {
    const ranked = [...players].sort((a, b) => b.score - a.score);
    const drawn = ranked.length > 1 && ranked[0].score === ranked[1].score;

    return shell(
      <>
        <div className="quiz-eyebrow">{state.name}</div>
        <h1 className="quiz-h1">{tt("quizOver")}</h1>

        <p className="quiz-verdict">
          {drawn ? tt("quizDraw") : tt("quizWinner", { name: ranked[0].name })}
        </p>

        <div className="quiz-scores">
          {ranked.map((player) => (
            <div
              className={`quiz-score-card ${player.id === me ? "mine" : ""}`}
              key={player.id}
            >
              <div className="quiz-score-name">{player.name}</div>
              <div className="quiz-score-value">{player.score}</div>

              <div className="quiz-score-detail">
                {player.right} {tt("quizRight")} · {player.wrong} {tt("quizWrong")}
                {player.missed > 0 ? ` · ${player.missed} ${tt("quizMissed")}` : ""}
              </div>
            </div>
          ))}
        </div>

        <p className="quiz-recall-note">{tt("quizRecallNote")}</p>

        <div className="quiz-label">{tt("quizAnswers")}</div>

        <ol className="quiz-review">
          {state.results.questions.map((question, index) => (
            <li
              className={`quiz-review-item ${question.tricky ? "tricky" : ""}`}
              key={question.id ?? index}
            >
              <div className="quiz-review-top">
                <span className="quiz-review-n">{index + 1}</span>

                {question.tricky && (
                  <span className="quiz-badge">{tt("quizTrickyBadge")}</span>
                )}
              </div>

              <p className="quiz-review-q">{question.question}</p>

              <p className="quiz-review-correct">
                <span className="quiz-tick">✓</span>
                {question.options[question.correct]}
              </p>

              {question.why && <p className="quiz-review-why">{question.why}</p>}

              <div className="quiz-review-picks">
                {players.map((player) => {
                  const choice = question.picks[player.id];

                  return (
                    <span
                      className={`quiz-pick ${
                        choice == null
                          ? "none"
                          : choice === question.correct
                            ? "right"
                            : "wrong"
                      }`}
                      key={player.id}
                    >
                      {player.name}:{" "}
                      {choice == null
                        ? tt("quizMissed")
                        : question.options[choice]}
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>

        <div className="quiz-row">
          <button className="quiz-button" onClick={leaveGame}>
            {tt("quizPlayAgain")}
          </button>

          <button className="quiz-button quiz-secondary" onClick={exit}>
            {tt("quizLeave")}
          </button>
        </div>
      </>
    );
  }

  // question and gap draw the same card. The gap only locks it — a screen
  // that emptied between questions would read as the game having crashed.
  const question = questions[state.index];
  const mine = picked[state.index];
  const locked = state.phase === "gap" || mine != null;
  const remaining = Math.max(0, state.closesAt - now);
  // Not `window`. A const by that name shadows the global for the WHOLE
  // function, so the `typeof window` guard at the top of this component —
  // two hundred lines earlier — starts throwing on the temporal dead zone
  // and the entire view renders as nothing. Lint and build both passed.
  const span = Math.max(1, state.closesAt - state.opensAt);
  const theyAnswered = opponent && state.answered.includes(opponent.id);

  return shell(
    <div className="quiz-play">
      <div className="quiz-topline">
        <span className="quiz-eyebrow">
          {tt("quizQuestionOf", { n: state.index + 1, total: state.count })}
        </span>

        <span className="quiz-seconds">{Math.ceil(remaining / 1000)}</span>
      </div>

      <div className="quiz-timer">
        <div
          className="quiz-timer-fill"
          // Keyed on the deadline as well as the question, so a round that
          // both players end early restarts the bar instead of leaving it
          // draining towards a moment that no longer exists.
          key={`${state.index}-${state.closesAt}`}
          style={{
            animationDuration: `${span}ms`,
            animationDelay: `-${Math.max(0, span - remaining)}ms`,
            animationPlayState: state.phase === "gap" ? "paused" : "running",
          }}
        />
      </div>

      <h2 className="quiz-question">{question?.question ?? ""}</h2>

      <div className="quiz-options">
        {(question?.options ?? []).map((option, index) => (
          <button
            className={`quiz-option ${mine === index ? "chosen" : ""} ${
              locked && mine !== index ? "dimmed" : ""
            }`}
            key={index}
            onClick={() => pick(index)}
            disabled={locked}
          >
            <span className="quiz-option-letter">{LETTERS[index]}</span>
            <span className="quiz-option-text">{option}</span>
          </button>
        ))}
      </div>

      <div className="quiz-status">
        <span className={mine != null ? "in" : "out"}>
          {mine != null ? tt("quizLockedIn") : tt("quizNoAnswerYet")}
        </span>

        {opponent && (
          <span className={theyAnswered ? "in" : "out"}>
            {theyAnswered
              ? tt("quizTheyAnswered", { name: opponent.name })
              : tt("quizWaitingThem", { name: opponent.name })}
          </span>
        )}
      </div>

      {error && <p className="quiz-error">{error}</p>}
    </div>
  );
}
