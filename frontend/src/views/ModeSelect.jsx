import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { useReducedMotion } from "../motion/useReducedMotion";
import {
  doorSoundOn,
  playDoorClose,
  playDoorOpen,
  setDoorSound,
} from "../doorSound";

// The first choice, before anything else: who is this for?
//
//   Teach It To Grandma   a learner explaining a topic to find out whether
//                         they really understand it
//   Teach It To Your Team a professional rehearsing a finding from their own
//                         document in front of the people who will hear it
//
// They are two real doors because they lead to two different rooms, with
// different people and a different promise. Choosing one swings it open on
// its hinge, the faces inside peek out, and the view moves through the
// doorway. The doorway is painted the colour of the page, so by the time it
// fills the screen the next page is already what you are looking at.
//
// Under reduced motion the door simply is not animated, and there is no sound.

// Long enough to read as a door, short enough to survive being watched twenty
// times in a rehearsal. The zoom overlaps the swing: see .door-frame.open in
// App.css, which must stay in step with this.
const THROUGH_MS = 1220;

const DOORS = [
  {
    mode: "topic",
    material: "wood",
    title: "modeLearnTitle",
    tag: "modeLearnTag",
    cta: "modeLearnCta",
    faces: ["/peep-grandma.png", "/peep-child.png", "/peep-student.png"],
  },
  {
    mode: "document",
    material: "glass",
    title: "modeTeamTitle",
    tag: "modeTeamTag",
    cta: "modeTeamCta",
    note: "modeTeamNote",
    faces: ["/peep-newhire.png", "/peep-operator.png", "/peep-manager.png"],
  },
];

export function ModeSelect({ tt, onChoose, returningFrom }) {
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(null);
  const [sound, setSound] = useState(doorSoundOn);
  const [through, setThrough] = useState(null);
  const timer = useRef(null);

  // Coming back through a door closes it behind you.
  useEffect(() => {
    const door = DOORS.find((d) => d.mode === returningFrom);

    if (door && !reduced) {
      playDoorClose(door.material);
    }
  }, [returningFrom, reduced]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The zoom would otherwise give the page scrollbars for a moment.
  useEffect(() => {
    if (!leaving) {
      return undefined;
    }

    const root = document.documentElement;

    root.style.overflow = "hidden";

    return () => {
      root.style.overflow = "";
    };
  }, [leaving]);

  const choose = (door, event) => {
    if (leaving) {
      return;
    }

    if (reduced) {
      onChoose(door.mode);
      return;
    }

    // Move the doorway's centre to the screen's centre, and scale it until
    // even its shorter side has passed the edges of the screen.
    const box = event.currentTarget.getBoundingClientRect();
    const scale =
      Math.max(window.innerWidth / box.width, window.innerHeight / box.height) * 1.5;

    setThrough({
      "--through-x": `${window.innerWidth / 2 - (box.left + box.width / 2)}px`,
      "--through-y": `${window.innerHeight / 2 - (box.top + box.height / 2)}px`,
      "--through-scale": scale,
    });

    playDoorOpen(door.material);
    setLeaving(door.mode);
    timer.current = setTimeout(() => onChoose(door.mode), THROUGH_MS);
  };

  const toggleSound = () => {
    setDoorSound(!sound);
    setSound(!sound);
  };

  return (
    <main className={`app mode-page ${leaving ? "is-leaving" : ""}`}>
      <section className="hero">
        <div className="hero-top">
          <div className="eyebrow">TEACH IT TO ANYONE</div>

          <div className="mode-tools">
            <button
              type="button"
              className="mode-sound"
              onClick={toggleSound}
              aria-pressed={sound}
            >
              {sound ? tt("soundOn") : tt("soundOff")}
            </button>

            <ThemeToggle tt={tt} />
          </div>
        </div>

        <h1 className="mode-title">{tt("modeTitle")}</h1>

        <p className="subtitle">{tt("modeSub")}</p>

        <div className="door-row">
          {DOORS.map((door, index) => {
            const chosen = leaving === door.mode;

            return (
              <div
                key={door.mode}
                className={`door-slot ${leaving && !chosen ? "released" : ""}`}
                style={{ "--i": index }}
              >
                <button
                  type="button"
                  className={`door-frame ${door.material} ${chosen ? "open" : ""} ${
                    !leaving && returningFrom === door.mode && !reduced ? "closing" : ""
                  }`}
                  style={chosen ? through : undefined}
                  onClick={(event) => choose(door, event)}
                >
                  <span className="door-room" aria-hidden="true">
                    <span className="door-light" />

                    <span className="door-peek">
                      {door.faces.map((src, i) => (
                        <img key={src} src={src} alt="" style={{ "--f": i }} />
                      ))}
                    </span>
                  </span>

                  <span className="door-leaf">
                    <span className="door-faces" aria-hidden="true">
                      {door.faces.map((src) => (
                        <img key={src} src={src} alt="" />
                      ))}
                    </span>

                    <span className="door-title">{tt(door.title)}</span>
                    <span className="door-tag">{tt(door.tag)}</span>

                    {door.note && <span className="door-note">{tt(door.note)}</span>}

                    <span className="door-cta">
                      {tt(door.cta)}
                      <span className="door-arrow" aria-hidden="true">
                        →
                      </span>
                    </span>

                    <span className="door-handle" aria-hidden="true" />
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
