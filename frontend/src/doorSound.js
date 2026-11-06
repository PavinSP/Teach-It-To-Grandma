// The sound of the two doors, synthesised rather than recorded: no audio
// file to ship, nothing to license, and it stays in time with the animation.
//
// `schedule*` take any BaseAudioContext, so a test can render them into an
// OfflineAudioContext and measure the result without speakers.
//
// Kept quiet on purpose. The app is usually running on a shared call, where a
// loud effect would land on top of everyone, and the toggle on the first
// screen turns it off.

const KEY = "teachit.doorSound";
const LEVEL = 0.3;

export function doorSoundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setDoorSound(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Private mode: the toggle still works until the page is reloaded.
  }
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

// A short filtered burst: a latch, a handle, a door meeting its frame.
function knock(ctx, at, { frequency, duration, level }) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = noiseBuffer(ctx, duration);
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 3;
  gain.gain.setValueAtTime(level, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
}

// A wooden hinge: a low sawtooth whose pitch stutters upward. The stutter is
// what makes it a creak rather than a tone.
function creak(ctx, at, duration) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const steps = 14;

  osc.type = "sawtooth";
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 5;

  for (let i = 0; i < steps; i++) {
    const t = at + (duration * i) / steps;
    const wobble = i % 2 === 0 ? 1 : 0.86;

    osc.frequency.setValueAtTime((110 + i * 9) * wobble, t);
  }

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(LEVEL * 2, at + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration);
}

// A glass office door: air moving past it, no hinge to speak of.
function whoosh(ctx, at, duration) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = noiseBuffer(ctx, duration);
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(500, at);
  filter.frequency.exponentialRampToValueAtTime(2400, at + duration * 0.6);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(LEVEL * 0.8, at + duration * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
}

export function scheduleOpen(ctx, door, at = ctx.currentTime) {
  if (door === "wood") {
    knock(ctx, at, { frequency: 1800, duration: 0.05, level: LEVEL * 2 });
    creak(ctx, at + 0.05, 0.85);
  } else {
    knock(ctx, at, { frequency: 3200, duration: 0.035, level: LEVEL });
    whoosh(ctx, at + 0.03, 0.85);
  }
}

export function scheduleClose(ctx, door, at = ctx.currentTime) {
  knock(ctx, at + 0.34, {
    frequency: door === "wood" ? 320 : 900,
    duration: 0.12,
    // A low band passes less of the noise, so it needs more to sound the same.
    level: door === "wood" ? LEVEL * 8 : LEVEL * 3,
  });
}

let shared = null;

function play(schedule, door) {
  if (!doorSoundOn()) {
    return;
  }

  try {
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;

    shared ??= new AudioCtx();
    shared.resume?.();
    schedule(shared, door);
  } catch {
    // A door that opens silently is still a door.
  }
}

export const playDoorOpen = (door) => play(scheduleOpen, door);
export const playDoorClose = (door) => play(scheduleClose, door);
