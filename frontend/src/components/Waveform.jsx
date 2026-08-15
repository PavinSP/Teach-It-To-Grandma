import { useEffect, useRef } from "react";
import { useTicker, useReducedMotion, PRIORITY } from "../motion";

// The bottom of the instrument: a band of bars driven by the actual audio
// of the call, the student's microphone and the character's voice in turn.
//
// Real data, not decoration. @elevenlabs/react exposes frequency bins for
// both directions — getInputByteFrequencyData and getOutputByteFrequencyData
// — behind an AnalyserNode it runs at fftSize 2048. What it does NOT expose
// is time-domain samples, so this is a spectrum meter rather than an
// oscilloscope trace. Drawing a fake wobbling line instead would have been
// easy and would have been a lie on a screen whose whole argument is that
// it measures rather than asserts.

const BANDS = 28;

// Logarithmic buckets. Linear ones put three quarters of the bars in
// frequencies human speech barely occupies, and the meter looks dead while
// somebody is talking straight into it.
function bandEdges(binCount) {
  const edges = [];
  const lo = 1;

  for (let i = 0; i <= BANDS; i++) {
    edges.push(Math.round(lo * Math.pow(binCount / lo, i / BANDS)));
  }

  return edges;
}

export function Waveform({ conversation, isConnected, muted, paused }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const levelsRef = useRef(new Float32Array(BANDS));
  const edgesRef = useRef(null);
  const paletteRef = useRef(null);
  const calm = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;

    if (!wrap || !canvas) return;

    const style = getComputedStyle(wrap);

    paletteRef.current = {
      signal: style.getPropertyValue("--signal").trim() || "#5EE0FF",
      partial: style.getPropertyValue("--partial").trim() || "#FFC66D",
      idle: style.getPropertyValue("--unexplored").trim() || "#47525E",
    };

    // Same lesson as the graph: measure the CONTENT box and only touch the
    // backing store when it really changed, because assigning width clears
    // the canvas and sizing from the border box feeds the observer.
    const applySize = (cssW, cssH) => {
      if (!cssW || !cssH) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);

      sizeRef.current = { w: cssW, h: cssH, dpr };

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const box = wrap.getBoundingClientRect();

    applySize(box.width, box.height);

    const ro = new ResizeObserver(([entry]) =>
      applySize(entry.contentRect.width, entry.contentRect.height)
    );

    ro.observe(wrap);

    return () => ro.disconnect();
  }, []);

  const sample = () => {
    const levels = levelsRef.current;

    // Whoever is making sound owns the meter. Reading the input while the
    // character is talking would show the room's silence over her voice.
    let data = null;
    let speaking = false;

    try {
      if (conversation?.isSpeaking) {
        data = conversation.getOutputByteFrequencyData?.();
        speaking = true;
      } else if (isConnected && !muted && !paused) {
        data = conversation.getInputByteFrequencyData?.();
      }
    } catch {
      data = null;
    }

    if (!data || !data.length) {
      // Slow release rather than a snap to zero, so the end of a sentence
      // decays instead of dropping out.
      for (let i = 0; i < BANDS; i++) levels[i] *= 0.9;

      return false;
    }

    if (!edgesRef.current || edgesRef.current.binCount !== data.length) {
      edgesRef.current = { binCount: data.length, edges: bandEdges(data.length) };
    }

    const { edges } = edgesRef.current;

    for (let i = 0; i < BANDS; i++) {
      const from = edges[i];
      const to = Math.max(edges[i + 1], from + 1);
      let sum = 0;

      for (let b = from; b < to && b < data.length; b++) sum += data[b];

      const target = sum / (to - from) / 255;

      // Fast attack, slow release. A meter that tracks the signal exactly
      // in both directions reads as twitchy noise; holding the decay is
      // what makes it look musical.
      levels[i] = Math.max(target, levels[i] * 0.9);
    }

    return speaking;
  };

  const draw = (speaking) => {
    const canvas = canvasRef.current;
    const palette = paletteRef.current;

    if (!canvas || !palette) return;

    const ctx = canvas.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    const levels = levelsRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const gap = 3;
    const barW = Math.max(2, (w - gap * (BANDS - 1)) / BANDS);
    const mid = h / 2;

    ctx.fillStyle = isConnected
      ? speaking
        ? palette.partial
        : palette.signal
      : palette.idle;

    for (let i = 0; i < BANDS; i++) {
      const level = calm ? Math.round(levels[i] * 4) / 4 : levels[i];
      // A floor, so the meter reads as present rather than broken when the
      // room is quiet.
      const barH = Math.max(2, level * (h - 6));
      const x = i * (barW + gap);

      ctx.fillRect(x, mid - barH / 2, barW, barH);
    }
  };

  // Rides the shared loop with the graph. Under reduced motion it still
  // samples, but the levels are quantised into four steps so the bars move
  // in discrete jumps rather than continuously.
  useTicker(
    () => {
      const speaking = sample();

      draw(speaking);
    },
    true,
    PRIORITY.RENDER
  );

  return (
    <div className="waveform" ref={wrapRef} aria-hidden="true">
      <canvas ref={canvasRef} className="waveform-canvas" />
    </div>
  );
}
