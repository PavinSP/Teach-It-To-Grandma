// A quiet moving backdrop that pictures how the topic behaves — networks
// for neural networks, waves for sound, branches for recursion. The shape
// is chosen by the lesson generator from a fixed set, so it is always one
// of eight things we designed rather than whatever an image search
// returned.
//
// Everything animates through CSS transforms and opacity only, which the
// browser can run on the compositor. A canvas loop would compete with the
// live voice call for the main thread; this does not.

const NODES = [
  [18, 26], [42, 16], [70, 30], [88, 20],
  [12, 58], [38, 52], [64, 62], [86, 54],
  [26, 84], [54, 88], [78, 80],
];

const EDGES = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
  [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 9], [7, 10], [9, 10],
];

function Network() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a][0]}
          y1={NODES[a][1]}
          x2={NODES[b][0]}
          y2={NODES[b][1]}
          className="motif-edge"
          style={{ animationDelay: `${(i % 5) * 0.7}s` }}
        />
      ))}

      {NODES.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r="1.6"
          className="motif-node"
          style={{ animationDelay: `${(i % 6) * 0.9}s` }}
        />
      ))}
    </svg>
  );
}

function Waves() {
  // Two periods wide, so translating by exactly half loops seamlessly.
  const path =
    "M0 50 Q 12.5 30 25 50 T 50 50 T 75 50 T 100 50 T 125 50 T 150 50 T 175 50 T 200 50";

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={path}
          className="motif-wave"
          style={{
            transform: `translateY(${(i - 1) * 16}px)`,
            animationDuration: `${9 + i * 3}s`,
            opacity: 1 - i * 0.25,
          }}
        />
      ))}
    </svg>
  );
}

function Particles() {
  const dots = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 37) % 100,
    y: (i * 61) % 100,
    r: 0.8 + ((i * 13) % 10) / 9,
    d: (i % 7) * 1.4,
    t: 11 + (i % 5) * 3,
  }));

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {dots.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.r}
          className="motif-particle"
          style={{ animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }}
        />
      ))}
    </svg>
  );
}

function Orbits() {
  return (
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="3" className="motif-node" />

      {[16, 27, 38].map((r, i) => (
        <g key={r}>
          <circle cx="50" cy="50" r={r} className="motif-orbit" />
          <g
            className="motif-spin"
            style={{
              transformOrigin: "50px 50px",
              animationDuration: `${14 + i * 9}s`,
              animationDirection: i % 2 ? "reverse" : "normal",
            }}
          >
            <circle cx={50 + r} cy="50" r="2" className="motif-node" />
          </g>
        </g>
      ))}
    </svg>
  );
}

function Flow() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {[22, 42, 62, 82].map((y, row) => (
        <g key={y}>
          <line x1="0" y1={y} x2="100" y2={y} className="motif-orbit" />
          {[0, 1, 2].map((i) => (
            <polygon
              key={i}
              points={`0,${y - 2.5} 5,${y} 0,${y + 2.5}`}
              className="motif-chevron"
              style={{
                animationDelay: `${i * 2.6 + row * 0.8}s`,
                animationDuration: "7.8s",
              }}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Grid() {
  const cells = [];

  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      cells.push({ r, c, i: r * 7 + c });
    }
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {cells.map(({ r, c, i }) => (
        <rect
          key={i}
          x={c * 14 + 2}
          y={r * 14 + 2}
          width="10"
          height="10"
          rx="1.5"
          className="motif-cell"
          style={{ animationDelay: `${((r + c) % 6) * 1.1}s` }}
        />
      ))}
    </svg>
  );
}

function Branches() {
  // One trunk splitting twice, drawn on with a dash animation.
  const limbs = [
    "M50 100 L50 66",
    "M50 66 L30 46", "M50 66 L70 46",
    "M30 46 L18 28", "M30 46 L40 26",
    "M70 46 L60 26", "M70 46 L82 28",
    "M18 28 L12 14", "M40 26 L38 10",
    "M60 26 L62 10", "M82 28 L88 14",
  ];

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {limbs.map((d, i) => (
        <path
          key={i}
          d={d}
          className="motif-limb"
          style={{ animationDelay: `${i * 0.55}s` }}
        />
      ))}
    </svg>
  );
}

function Pulse() {
  // Two identical spans side by side, so a half-width slide loops cleanly.
  const beat =
    "l6 0 l2 -14 l3 26 l3 -20 l2 8 l6 0 l8 0 l6 0 l2 -9 l3 17 l3 -14 l2 6 l9 0";

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={`M0 50 ${beat} ${beat}`} className="motif-pulse" />
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

export default function Motif({ name }) {
  const Shape = MOTIFS[name];

  if (!Shape) {
    return null;
  }

  return (
    <div className={`motif motif-${name}`} aria-hidden="true">
      <Shape />
    </div>
  );
}
