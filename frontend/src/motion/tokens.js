// The motion vocabulary, written once. No component invents a duration.
//
// The hierarchy these numbers encode is the point: a hover and a view
// transition must not share a curve, or the interface has no sense of scale.
// A uniform 0.3s ease on everything is the single most common way a build
// announces that nobody chose anything.

// Mirrors the --e-* custom properties in styles/tokens.css. Duplicated
// deliberately — JS-driven animation cannot read a CSS variable cheaply per
// frame, and one of the two has to be the copy. If you edit a curve, edit
// both; there are six of them and they change roughly never.
export const EASE = {
  outQuad: [0.25, 0.46, 0.45, 0.94],
  outCubic: [0.215, 0.61, 0.355, 1],
  outQuart: [0.165, 0.84, 0.44, 1],
  outExpo: [0.19, 1, 0.22, 1],
  inOutQuart: [0.77, 0, 0.175, 1],
  emphDecel: [0.05, 0.7, 0.1, 1],
};

export const EASE_CSS = {
  outQuad: "var(--e-out-quad)",
  outCubic: "var(--e-out-cubic)",
  outQuart: "var(--e-out-quart)",
  outExpo: "var(--e-out-expo)",
  inOutQuart: "var(--e-inout-quart)",
  emphDecel: "var(--e-emph-decel)",
};

// Spring when the target can change mid-flight — a cursor being chased, a
// graph node the simulation keeps nudging, a coverage meter that gets a new
// value every 400ms. Springs absorb an interruption; a bezier restarts from
// wherever it was and reads as a glitch.
//
// Bezier when both ends are known and the motion has to land on a beat —
// reveals, text masks, scroll scrubs. Never spring a scroll-scrubbed value:
// the scrub position is the truth, and a spring lags behind it.
export const SPRING = {
  // Button press, toggle, cursor dot — ~180ms.
  micro: { stiffness: 500, damping: 32, mass: 1 },
  // Panel and card entrance — ~420ms with a faint overshoot.
  panel: { stiffness: 240, damping: 28, mass: 1 },
  // Full-screen sheet, graph recentre — ~700ms.
  heavy: { stiffness: 120, damping: 22, mass: 1.4 },
  // Magnetic cursor. The low mass is what makes it feel weightless rather
  // than merely late.
  magnetic: { stiffness: 150, damping: 15, mass: 0.1 },
};

// Something crossing the viewport should take longer than something nudging
// 8px. The clamp keeps both ends sane.
export function durationFor(distancePx) {
  return Math.max(140, Math.min(90 + 0.55 * Math.abs(distancePx), 520));
}

// Leaving is always quicker than arriving. An exit that takes as long as its
// entrance reads as the interface being reluctant to get out of the way.
export function exitDuration(enterMs) {
  return Math.round(enterMs * 0.7);
}

// 40ms per item reads well up to about a dozen. Past that the cap matters
// more than the step: a 30-item list at 40ms is a 1.2s wait for the last row,
// which is no longer a stagger, it is a queue.
export function staggerStep(count, base = 40) {
  if (count <= 1) {
    return 0;
  }

  return Math.min(base, 500 / (count - 1));
}

// Grids stagger from an origin, not by index — index order makes a grid
// unzip row by row, which nothing in the physical world does. Distance from
// the origin makes it bloom.
export function staggerFromOrigin(index, origin, columns, spread = 350) {
  const dx = (index % columns) - (origin % columns);
  const dy = Math.floor(index / columns) - Math.floor(origin / columns);

  const distance = Math.hypot(dx, dy);
  const maxDistance = Math.hypot(columns, Math.max(columns, 1)) || 1;

  return (distance / maxDistance) * spread;
}

// The reduced-motion counterpart to every duration above. Not zero — colour
// and opacity still move, because an interface that changes state with no
// transition at all is harder to follow, not easier.
export const CALM = {
  fade: 150,
  colour: 150,
};
