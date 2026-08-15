import { useEffect, useMemo, useRef } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceCenter,
} from "d3-force";
import { useTicker, useReducedMotion, PRIORITY } from "../motion";

// The understanding graph: one node per checklist point, one child per
// keyword under it, coloured by what the system currently believes about
// that idea. It is the checklist the sidebar already showed, drawn as the
// shape of a subject rather than a list of ticks — which is the whole
// argument the product makes, so it earns the middle of the screen.
//
// Canvas, not SVG or DOM. Twenty-odd nodes with a force simulation behind
// them means twenty-odd layout invalidations per frame in the DOM, and the
// simulation is already doing the only work that matters.
//
// Everything here is derived from state App already owns — points, the
// keyword coverage pass, and the AI grade once it lands. The graph adds no
// request, no state and no source of truth; if it disappeared, nothing
// about the lesson would change.

// The four states are the product. Anything not yet spoken about is
// deliberately dim: unexplored ground has to be visible without competing
// with ground that has been covered.

// Canvas cannot read a CSS custom property, so the token values are pulled
// out of the computed style once and cached. This is the one place colour
// crosses out of tokens.css, and it still reads FROM tokens.css rather than
// hardcoding a hex — swap the token block and the graph follows.
function readPalette(el) {
  const style = getComputedStyle(el);
  const get = (name, fallback) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    unexplored: get("--unexplored", "#47525E"),
    partial: get("--partial", "#FFC66D"),
    understood: get("--understood", "#7CFF9B"),
    misunderstood: get("--misunderstood", "#FF6B5A"),
    signal: get("--signal", "#5EE0FF"),
    surface: get("--surface", "#14171A"),
    bg: get("--bg-void", "#08090A"),
    border: get("--border", "#262B31"),
    borderStrong: get("--border-strong", "#39414A"),
    text: get("--text", "#E8EDF2"),
    textMuted: get("--text-muted", "#5E6975"),
  };
}

// What the system currently believes about one checklist point. The grade
// is authoritative once it exists; before that, keyword coverage is the
// only signal there is, and it is deliberately reported as "partial" rather
// than as understanding — saying the word is not explaining the idea.
function pointState(index, point, progress, grade) {
  const graded = grade?.find((r) => r.point === point);

  if (graded) {
    return graded.understood ? "understood" : "misunderstood";
  }

  return progress?.[index] ? "partial" : "unexplored";
}

function buildGraph({ points = [], checks = [], progress = [], grade, topic }) {
  const nodes = [];
  const links = [];

  // The topic itself anchors the middle so the four points arrange around
  // something, rather than drifting as four unrelated clusters.
  nodes.push({
    id: "__topic",
    label: topic || "",
    kind: "topic",
    state: "signal",
  });

  points.forEach((point, i) => {
    const id = `p${i}`;
    const state = pointState(i, point, progress, grade);

    nodes.push({ id, label: point, kind: "point", state });
    links.push({ source: "__topic", target: id, established: true });

    // Keywords are what the coverage pass actually matches on, so they are
    // the smallest honest unit to draw. Capped: a point with fourteen
    // keywords would bury its own parent.
    (checks[i]?.keywords ?? []).slice(0, 4).forEach((keyword, k) => {
      const kid = `p${i}k${k}`;

      nodes.push({
        id: kid,
        label: keyword,
        kind: "keyword",
        // A keyword inherits its parent's state rather than claiming one of
        // its own: the grade is given per point, and colouring a child
        // green on its own evidence would assert more than is known.
        state: state === "unexplored" ? "unexplored" : state,
      });
      links.push({ source: id, target: kid, established: state !== "unexplored" });
    });
  });

  return { nodes, links };
}

const RADIUS = { topic: 30, point: 22, keyword: 12 };

export function UnderstandingGraph({
  points,
  checks,
  progress,
  grade,
  topic,
  waitingLabel,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const simRef = useRef(null);
  const paletteRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const visibleRef = useRef(true);
  const calm = useReducedMotion();

  // Rebuilt only when the lesson's shape or its verdict changes — not on
  // every render, or the simulation would restart while it settles.
  const graph = useMemo(
    () => buildGraph({ points, checks, progress, grade, topic }),
    [points, checks, progress, grade, topic]
  );

  const anySpoken = progress?.some(Boolean) ?? false;

  // Simulation lifecycle. Nodes carry their own x/y between rebuilds, so a
  // point turning green does not fling the layout apart — the previous
  // position is reused and only the colour changes.
  useEffect(() => {
    const previous = new Map(
      (simRef.current?.nodes() ?? []).map((n) => [n.id, n])
    );

    const nodes = graph.nodes.map((n) => {
      const old = previous.get(n.id);

      return old ? Object.assign(old, n) : { ...n };
    });

    const links = graph.links.map((l) => ({ ...l }));

    if (!simRef.current) {
      simRef.current = forceSimulation(nodes)
        .force("charge", forceManyBody().strength(-260))
        .force(
          "link",
          forceLink(links)
            .id((d) => d.id)
            .distance(90)
            .strength(0.6)
        )
        .force(
          "collide",
          forceCollide((d) => RADIUS[d.kind] + 6)
        )
        .velocityDecay(0.4)
        .stop();
    } else {
      simRef.current.nodes(nodes);
      simRef.current.force("link").links(links);
    }

    const sim = simRef.current;

    sim.force("center", forceCenter(sizeRef.current.w / 2, sizeRef.current.h / 2));

    if (calm) {
      // The designed alternative to a simulation, not the absence of one:
      // run it to rest synchronously and draw the finished layout. Same
      // arrangement, no motion, no frames spent.
      sim.alpha(1);
      for (let i = 0; i < 200; i++) sim.tick();
      return;
    }

    // The beat where the graph comes alive. Warming to 0.3 and letting it
    // cool is what makes a new node arrive rather than appear.
    sim.alpha(0.6).alphaTarget(0.3).restart();

    const settle = setTimeout(() => sim.alphaTarget(0), 600);

    return () => clearTimeout(settle);
  }, [graph, calm]);

  useEffect(() => () => simRef.current?.stop(), []);

  // Size, device pixel ratio and visibility. Measured here rather than in
  // the frame loop, so no frame ever reads layout.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;

    if (!wrap || !canvas) return;

    paletteRef.current = readPalette(wrap);

    // Two rules here, both learned the hard way.
    //
    // Measure the CONTENT box, never getBoundingClientRect. The wrap has a
    // 2px border, so its border-box is 4px wider than the space the canvas
    // actually occupies. Sizing the canvas from that made it wider than its
    // own container, which changed the container, which fired the observer
    // again — a feedback loop running at frame rate.
    //
    // And assigning width or height CLEARS a canvas, so only assign when
    // the value really changed. Without that guard the loop above wiped
    // every frame the instant after it was drawn: the simulation ran, the
    // nodes were in the right places, and the panel stayed black.
    const applySize = (cssW, cssH) => {
      if (!cssW || !cssH) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      const changed = canvas.width !== w || canvas.height !== h;

      sizeRef.current = { w: cssW, h: cssH, dpr };

      if (!changed) return;

      canvas.width = w;
      canvas.height = h;

      simRef.current
        ?.force("center", forceCenter(cssW / 2, cssH / 2))
        .alpha(0.3)
        .restart();
    };

    const first = wrap.getBoundingClientRect();

    applySize(
      first.width - parseFloat(getComputedStyle(wrap).borderLeftWidth) * 2,
      first.height - parseFloat(getComputedStyle(wrap).borderTopWidth) * 2
    );

    const ro = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;

      applySize(box.width, box.height);
    });

    ro.observe(wrap);

    // A canvas nobody can see must not cost frames.
    const io = new IntersectionObserver(
      ([entry]) => (visibleRef.current = entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(wrap);

    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const palette = paletteRef.current;

    if (!canvas || !sim || !palette) return;

    const ctx = canvas.getContext("2d");
    const { w, h, dpr } = sizeRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Dot grid — the instrument's graph paper. Cheap enough at this density
    // to redraw rather than cache.
    ctx.fillStyle = palette.border;
    for (let x = 24; x < w; x += 24) {
      for (let y = 24; y < h; y += 24) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    for (const link of sim.force("link").links()) {
      const { source: a, target: b } = link;

      if (!a?.x || !b?.x) continue;

      // An established edge is drawn in the state colour of what it leads
      // to, dimmed — so a covered branch reads as one lit region rather
      // than as chips that happen to sit near each other. Unexplored
      // ground stays a dashed hairline: present, joined, not yet earned.
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = 1;

      if (link.established) {
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = palette[b.state] ?? palette.borderStrong;
        ctx.setLineDash([]);
      } else {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette.borderStrong;
        ctx.setLineDash([3, 4]);
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const node of sim.nodes()) {
      if (node.x === undefined) continue;

      const colour =
        node.kind === "topic"
          ? palette.signal
          : palette[node.state] ?? palette.unexplored;

      const padX = node.kind === "keyword" ? 8 : 12;

      ctx.font =
        node.kind === "keyword"
          ? '500 10px "JetBrains Mono", ui-monospace, monospace'
          : '500 12px "JetBrains Mono", ui-monospace, monospace';

      // Chips, not circles — a label has to fit inside the thing it names.
      const label =
        node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
      const textWidth = ctx.measureText(label).width;
      const boxW = textWidth + padX * 2;
      const boxH = node.kind === "keyword" ? 22 : 30;
      const x = node.x - boxW / 2;
      const y = node.y - boxH / 2;

      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, 3);
      ctx.fillStyle = palette.surface;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = colour;
      ctx.stroke();

      ctx.fillStyle = node.state === "unexplored" ? palette.textMuted : colour;
      ctx.fillText(label, node.x, node.y + 0.5);

      // Keeps the collision force honest about a chip's real footprint.
      node.__w = boxW;
    }
  };

  // One subscriber on the shared loop, at render priority, and only while
  // the canvas is actually on screen. Under reduced motion the layout is
  // already final, so it draws once per state change instead of per frame.
  useTicker(
    () => {
      if (!visibleRef.current) return;

      if (!calm) simRef.current?.tick();

      draw();
    },
    !calm,
    PRIORITY.RENDER
  );

  useEffect(() => {
    if (calm) draw();
  }, [calm, graph]);

  // The canvas is decorative; the text summary is what a screen reader gets.
  const summary = useMemo(() => {
    const total = points?.length ?? 0;
    const covered = progress?.filter(Boolean).length ?? 0;

    return `${total} concepts, ${covered} covered, ${total - covered} not yet mentioned`;
  }, [points, progress]);

  return (
    <div className="graph-wrap scanlines" ref={wrapRef}>
      <canvas ref={canvasRef} className="graph-canvas" aria-hidden="true" />

      {!anySpoken && (
        <div className="graph-waiting label" aria-hidden="true">
          {waitingLabel}
        </div>
      )}

      <p className="visually-hidden">{summary}</p>
    </div>
  );
}
