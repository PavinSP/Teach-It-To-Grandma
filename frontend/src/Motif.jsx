// The shape behind the conversation, picturing how the topic behaves —
// a network for neural networks, waves for sound, a tree for recursion.
//
// It is not decoration: the shape FILLS IN as the lesson is covered. Each
// motif is an ordered list of parts, and the first `progress` fraction of
// them are lit. Teach well and the network wires itself up, the tree
// grows, the grid fills. Everything also breathes while she is speaking.
//
// CSS transforms and opacity only, so the browser runs it on the
// compositor rather than competing with the live voice call.

const NODES = [
  [16, 30], [40, 18], [66, 28], [88, 22],
  [10, 60], [36, 52], [62, 62], [86, 56],
  [24, 86], [52, 90], [80, 82],
];

const EDGES = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
  [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 9], [7, 10], [9, 10],
];

// How many of `total` parts are lit at this progress, always leaving the
// first one lit so the shape never disappears entirely.
function litCount(progress, total) {
  return Math.max(1, Math.round(progress * total));
}

function cls(index, lit) {
  return index < lit ? "on" : "off";
}

function Network({ progress }) {
  const litNodes = litCount(progress, NODES.length);
  const litEdges = litCount(progress, EDGES.length);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a][0]}
          y1={NODES[a][1]}
          x2={NODES[b][0]}
          y2={NODES[b][1]}
          className={`m-line ${cls(i, litEdges)}`}
        />
      ))}

      {NODES.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="2"
          className={`m-dot ${cls(i, litNodes)}`}
          style={{ animationDelay: `${(i % 5) * 0.6}s` }}
        />
      ))}
    </svg>
  );
}

function Waves({ progress }) {
  const path =
    "M0 50 Q 12.5 32 25 50 T 50 50 T 75 50 T 100 50 T 125 50 T 150 50 T 175 50 T 200 50";
  const lit = litCount(progress, 4);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={path}
          className={`m-line drift ${cls(i, lit)}`}
          style={{
            transform: `translateY(${(i - 1.5) * 13}px)`,
            animationDuration: `${8 + i * 2.5}s`,
          }}
        />
      ))}
    </svg>
  );
}

function Particles({ progress }) {
  const dots = Array.from({ length: 24 }, (_, i) => ({
    x: (i * 37 + 7) % 96,
    y: (i * 61 + 11) % 92,
    r: 1 + ((i * 13) % 8) / 8,
    d: (i % 6) * 1.3,
    t: 10 + (i % 5) * 3,
  }));
  const lit = litCount(progress, dots.length);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {dots.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.r}
          className={`m-dot float ${cls(i, lit)}`}
          style={{ animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }}
        />
      ))}
    </svg>
  );
}

function Orbits({ progress }) {
  const rings = [15, 26, 37, 47];
  const lit = litCount(progress, rings.length);

  return (
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="3.5" className="m-dot on" />

      {rings.map((r, i) => (
        <g key={r} className={cls(i, lit)}>
          <circle cx="50" cy="50" r={r} className="m-line" />
          <g
            className="spin"
            style={{
              transformOrigin: "50px 50px",
              animationDuration: `${13 + i * 7}s`,
              animationDirection: i % 2 ? "reverse" : "normal",
            }}
          >
            <circle cx={50 + r} cy="50" r="2.2" className="m-dot" />
          </g>
        </g>
      ))}
    </svg>
  );
}

function Flow({ progress }) {
  const lanes = [20, 40, 60, 80];
  const lit = litCount(progress, lanes.length);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {lanes.map((y, row) => (
        <g key={y} className={cls(row, lit)}>
          <line x1="0" y1={y} x2="100" y2={y} className="m-line" />
          {[0, 1, 2].map((i) => (
            <polygon
              key={i}
              points={`0,${y - 3} 6,${y} 0,${y + 3}`}
              className="m-dot travel"
              style={{
                animationDelay: `${i * 2.5 + row * 0.7}s`,
                animationDuration: "7.5s",
              }}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Grid({ progress }) {
  const cells = [];

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      cells.push({ r, c });
    }
  }

  const lit = litCount(progress, cells.length);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {cells.map(({ r, c }, i) => (
        <rect
          key={i}
          x={c * 16 + 3}
          y={r * 16 + 3}
          width="12"
          height="12"
          rx="2"
          className={`m-cell ${cls(i, lit)}`}
          style={{ animationDelay: `${((r + c) % 5) * 1.1}s` }}
        />
      ))}
    </svg>
  );
}

function Branches({ progress }) {
  const limbs = [
    "M50 98 L50 68",
    "M50 68 L30 48", "M50 68 L70 48",
    "M30 48 L18 30", "M30 48 L40 28",
    "M70 48 L60 28", "M70 48 L82 30",
    "M18 30 L12 14", "M40 28 L38 10",
    "M60 28 L62 10", "M82 30 L88 14",
  ];
  const lit = litCount(progress, limbs.length);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {limbs.map((d, i) => (
        <path key={i} d={d} className={`m-line grow ${cls(i, lit)}`} />
      ))}
    </svg>
  );
}

function Pulse({ progress }) {
  const beat =
    "l6 0 l2 -14 l3 26 l3 -20 l2 8 l6 0 l8 0 l6 0 l2 -9 l3 17 l3 -14 l2 6 l9 0";

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* The whole trace is always present but faint; the lit copy is
          revealed left-to-right in step with the lesson. */}
      <path d={`M0 50 ${beat} ${beat}`} className="m-line off" />
      <path
        d={`M0 50 ${beat} ${beat}`}
        className="m-line on scroll"
        style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}
      />
    </svg>
  );
}

const MOTIFS = {
  network: Network,
  waves: Waves,
  particles: Particles,
  orbits: Orbits,
  flow: Flow,
  grid: Grid,
  branches: Branches,
  pulse: Pulse,
};

export default function Motif({ name, progress = 0, speaking = false }) {
  const Shape = MOTIFS[name];

  if (!Shape) {
    return null;
  }

  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      className={`motif motif-${name} ${speaking ? "is-speaking" : ""}`}
      aria-hidden="true"
    >
      <Shape progress={clamped} />
    </div>
  );
}
