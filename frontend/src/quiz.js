// The quiz side mode's client half: who you are to the server, what its
// clock says, and the fifteen clips.
//
// Resolved exactly as App.jsx resolves it, and deliberately copied rather
// than imported — App.jsx is the teaching flow's file and a side mode is not
// a reason to edit it. `??` not `||`, because an explicitly empty value means
// same-origin and `||` would throw that away for localhost in production.
export const QUIZ_API =
  import.meta.env.VITE_GRADING_API ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");

// sessionStorage, not localStorage, and that is load-bearing twice over. A
// tab is a player: two windows on one laptop are two players, which is how
// this gets tested and how it gets rehearsed without a second device. And a
// refresh keeps the same identity, so reloading mid-game rejoins the game
// you were already in rather than being turned away as a third player.
const ID_KEY = "quiz-player-id";

export function playerId() {
  let id = sessionStorage.getItem(ID_KEY);

  if (!id) {
    id = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    sessionStorage.setItem(ID_KEY, id);
  }

  return id;
}

// The name is worth remembering across tabs — it is the one thing a player
// would have to type twice otherwise.
const NAME_KEY = "quiz-player-name";

export function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode. Typing a name twice is not worth a crash.
  }
}

// Which game this tab is in, so a reload rejoins it rather than landing back
// on the front page with the other player still waiting. sessionStorage
// again: a tab is a player, and the id that makes the rejoin work is stored
// the same way and expires the same way.
const GAME_KEY = "quiz-game";

export function activeGame() {
  try {
    return JSON.parse(sessionStorage.getItem(GAME_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function rememberGame(code, name, language) {
  try {
    sessionStorage.setItem(GAME_KEY, JSON.stringify({ code, name, language }));
  } catch {
    // Nothing breaks without it — a reload just goes back to the menu.
  }
}

export function forgetGame() {
  try {
    sessionStorage.removeItem(GAME_KEY);
  } catch {
    // As above.
  }
}

async function call(path, options) {
  const response = await fetch(`${QUIZ_API}${path}`, options);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error || "Something went wrong.");

    error.status = response.status;

    throw error;
  }

  return body;
}

const post = (path, body) =>
  call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

export const createGame = (topic, language, player) =>
  post("/api/quiz/game", { topic, language, player });

export const voiceGame = (code) => post(`/api/quiz/${code}/voice`);

export const joinGame = (code, id, name) =>
  post(`/api/quiz/${code}/join`, { id, name });

export const startGame = (code, id) => post(`/api/quiz/${code}/start`, { id });

export const sendAnswer = (code, id, index, choice) =>
  post(`/api/quiz/${code}/answer`, { id, index, choice });

export const fetchQuestions = (code) => call(`/api/quiz/${code}`);

export const fetchState = (code) => call(`/api/quiz/${code}/state`);

// A 44-byte WAV header with no samples in it. Playing this inside a click is
// what buys the right to play everything afterwards.
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

// One <audio> element for all fifteen questions, reused by swapping src.
//
// Not fifteen elements. A browser grants playback to the element that was
// playing when the user tapped, and on iOS that grant does not spread to the
// other fourteen — so the lobby's Start button would unlock a silent element
// and every question after it would fail quietly. Reusing one element means
// one unlock, on a real tap, covering the whole game.
//
// The clips are warmed with fetch() instead, into the same HTTP cache the
// element will read from: the audio route marks them immutable, so by the
// time question nine is asked its bytes are already on the machine.
export function makeDeck() {
  const url = (code, index) => `${QUIZ_API}/api/quiz/${code}/audio/${index}`;
  const element = new Audio();

  element.preload = "auto";

  let disposed = false;
  let unlocked = false;

  return {
    // Call this SYNCHRONOUSLY inside the click that starts, joins, or answers
    // — before anything is awaited. The permission a browser grants is to the
    // element that was playing during the gesture, and an await in front of
    // this line ends the gesture: the call still runs, still resolves, and
    // the game is silent from then on with nothing in the console.
    //
    // Safe from any gesture, including one mid-question. It happens once and
    // refuses to interrupt a clip already playing — which also means it does
    // nothing in the case where sound evidently already works. Answering is
    // what gets audio back after a reload, since a reloaded page carries no
    // user activation at all and lands silent until the first tap.
    //
    // Failure is not fatal and not worth reporting: the questions are on
    // screen in text, so a silent game still plays.
    unlock() {
      if (unlocked) {
        return;
      }

      unlocked = true;

      try {
        if (!element.paused) {
          return;
        }

        element.src = SILENCE;

        element.play().then(
          () => element.pause(),
          () => {}
        );
      } catch {
        // Autoplay policy said no. Nothing to do about it from here.
      }
    },

    warm(code, count) {
      for (let index = 0; index < count; index++) {
        fetch(url(code, index), { cache: "force-cache" }).catch(() => {});
      }
    },

    // Always from the first word. Never from where the round happens to be.
    //
    // This used to seek to how far into the question the game already was,
    // so that two devices in a room stayed audibly aligned. That is exactly
    // backwards for a quiz that is READ ALOUD. A device learning about a
    // round a little late — a slow phone, a mobile network, a tab coming
    // back — would skip that far into the clip, and a spoken question loses
    // its meaning from the front: "what is the mathematical operation..."
    // arrives as "...mathematical operation", which cannot be answered. It
    // was reported exactly that way: one player heard every question whole
    // and the other kept missing the first few words.
    //
    // The alignment it bought was worth nothing. Both devices show the same
    // question text and count down to the same server deadline, so nothing
    // in the game depends on the audio being in step — the only cost of
    // starting late is a slight echo between two phones in one room, and
    // the only cost of seeking was the question itself.
    play(code, index) {
      if (disposed) {
        return;
      }

      element.pause();
      element.src = url(code, index);
      element.load();

      // Started from the metadata event rather than straight after load().
      // Playing immediately fails on every question — load() puts the
      // element back to HAVE_NOTHING and the play() that follows it in the
      // same tick is aborted, silently, because the rejection is caught.
      const start = () => element.play().catch(() => {});

      if (element.readyState >= 1) {
        start();
      } else {
        element.addEventListener("loadedmetadata", start, { once: true });
      }
    },

    stop() {
      element.pause();
    },

    dispose() {
      disposed = true;
      element.pause();
      element.removeAttribute("src");
    },
  };
}
