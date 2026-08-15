// One requestAnimationFrame loop for the entire app.
//
// The app currently starts a loop per animated thing — the mouth-open poll
// in App.jsx runs its own rAF, and the score count-up runs another. That is
// survivable at two. It is not survivable once the waveform, the graph
// simulation, the graph render and the cursor all want a frame: N loops mean
// N times the scheduling overhead and, worse, non-deterministic ordering.
// The graph reading a volume the waveform has not written yet is a bug that
// only appears on a slow machine, in front of an audience.
//
// So: one loop, subscribers in a fixed order, and nothing runs at all when
// the tab is hidden or the list is empty.

// Lower priority runs first. The order is the data-flow order — read inputs,
// step simulations, then draw — so a render always sees the values written
// this frame rather than last frame's.
export const PRIORITY = {
  INPUT: 0,   // volume polls, pointer position
  SIM: 10,    // d3-force, spring integration
  RENDER: 20, // canvas draws
};

const subscribers = [];

let frame = null;
let lastTime = 0;

function loop(now) {
  frame = requestAnimationFrame(loop);

  // Clamped: a tab that was backgrounded for a minute must not hand every
  // subscriber a 60000ms delta and teleport the simulation.
  const dt = lastTime ? Math.min(now - lastTime, 50) : 16.7;

  lastTime = now;

  // Iterate a copy — a subscriber that unsubscribes itself mid-frame (a
  // one-shot animation completing) would otherwise skip its neighbour.
  for (const entry of subscribers.slice()) {
    try {
      entry.fn(now, dt);
    } catch (err) {
      // One broken subscriber must never take the waveform down with it.
      console.error("Ticker subscriber failed:", err);
    }
  }
}

function start() {
  if (frame !== null || subscribers.length === 0) {
    return;
  }

  if (typeof document !== "undefined" && document.hidden) {
    return;
  }

  lastTime = 0;
  frame = requestAnimationFrame(loop);
}

function stop() {
  if (frame === null) {
    return;
  }

  cancelAnimationFrame(frame);
  frame = null;
  lastTime = 0;
}

// Returns the unsubscribe function. Calling it twice is harmless, which
// matters because StrictMode mounts every effect twice in development.
export function subscribe(fn, priority = PRIORITY.RENDER) {
  const entry = { fn, priority };

  // Stable insertion within a priority band: two renderers registered in
  // source order draw in source order, every frame, forever.
  let index = subscribers.length;

  while (index > 0 && subscribers[index - 1].priority > priority) {
    index--;
  }

  subscribers.splice(index, 0, entry);
  start();

  return () => {
    const at = subscribers.indexOf(entry);

    if (at !== -1) {
      subscribers.splice(at, 1);
    }

    if (subscribers.length === 0) {
      stop();
    }
  };
}

// A hidden tab still gets rAF callbacks in some browsers and none in others.
// Stopping deliberately makes the behaviour the same everywhere, and means a
// demo laptop with the app on a background desktop is not burning frames.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });
}

// Diagnostics for the machine you are about to present on: type
// `ticker()` in the console to see what is currently riding the loop.
if (typeof window !== "undefined") {
  window.ticker = () => ({
    running: frame !== null,
    subscribers: subscribers.length,
    priorities: subscribers.map((s) => s.priority),
  });
}
