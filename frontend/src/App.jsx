import { useEffect, useRef, useState } from "react";
import {
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { FEATURES } from "./features";
import { MOODS, MOOD_LABEL, guessMood, channelState } from "./mood";
import {
  feynmanScore,
  verdictForScore,
  bandForScore,
  xpForLesson,
  loadProfile,
  commitLessonXp,
  ACHIEVEMENTS,
  evaluateAchievements,
} from "./progression";
import { CHARACTERS, buildPersonaPrompt, DIRECTOR } from "./characters";
import { loadSnapshot, saveSnapshot } from "./snapshot";
import { resetNow } from "./reset";
import {
  YOU_OPTIONS,
  YOU_PRESETS,
  DEFAULT_PARAMS,
  buildYouUrl,
  loadYou,
  saveYou,
} from "./you";
import "./App.css";

const AGENT_ID = "agent_8901kzzhzexhe2qt3903amp09nnq";

const GRADING_API = import.meta.env.VITE_GRADING_API || "http://localhost:3001";

// Starting points, not limits — any topic can be typed in.
// Both codes are in ElevenLabs' supported set and configured on the agent.
// The ladder each rung of which needs the one below it. Naming a thing
// and knowing where it breaks are not the same achievement, and one
// number cannot say which you reached.
const DEPTH_RUNGS = [
  { key: "named", label: "Named it", hint: "You said what it is called" },
  { key: "defined", label: "Defined it", hint: "A correct definition — the kind you can memorise" },
  { key: "mechanism", label: "Explained how", hint: "Why one step leads to the next" },
  { key: "applied", label: "Showed it working", hint: "A concrete case, worked through" },
  { key: "boundaries", label: "Knew its limits", hint: "When it fails or does not apply" },
];

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

const SUGGESTED_TOPICS = [
  "Neural networks",
  "Backpropagation",
  "Gradient descent",
  "Overfitting",
  "Transformers and attention",
  "Convolutional neural networks",
  "Embeddings",
  "Reinforcement learning",
];

// The server returns points as objects; the rest of the app wants the
// labels and the keyword checks separately.
function toLesson(generated) {
  return {
    name: generated.name,
    description: generated.description,
    difficulty: generated.difficulty,
    points: generated.points.map((point) => point.label),
    checks: generated.points.map((point) => ({
      keywords: point.keywords,
      required: point.required,
    })),
    predictions: generated.points.map((point) => ({
      hardFor: point.hardFor ?? null,
      hardWhy: point.hardWhy ?? "",
    })),
    misconceptions: generated.misconceptions ?? [],
    analysis: generated.analysis ?? null,
    challenges: generated.challenges ?? [],
  };
}

// Strips machinery a model may have echoed instead of acted on: private
// notes in brackets, and tool calls written out as text. Cannot stop it
// being spoken aloud, but keeps it off the screen and out of grading.
// A net, not the fix. The fix is the prompt telling her never to speak a
// note; this catches what still gets through.
//
// Surgical on purpose: an earlier version deleted the rest of the line and
// took her real reply with it. It removes the marker, a written-out tool
// call, and one sentence of instruction. A leak several sentences long may
// leave a fragment — there is no reliable way to tell where an instruction
// stops and her own words start, and cutting too much is the worse error.
const LEAKS = [
  // Expressive Mode delivery tags — [slow], [curious], [squinting]. These
  // are instructions to the voice, not words she says, and the TTS strips
  // them from the audio. They only need removing from the screen.
  // Short and lowercase by design, so a real bracketed aside survives.
  /\[[a-z][a-z' -]{0,22}\]\s*/g,
  /\bset_mood\s*\([^)]*\)\s*/gi,
  /\b(?:Next reply only|From now on)\s*:[^.?!]*[.?!]\s*/gi,
];

export function scrub(text) {
  if (typeof text !== "string") {
    return text;
  }

  let out = text;

  for (const pattern of LEAKS) {
    out = out.replace(pattern, "");
  }

  return out.replace(/\s{2,}/g, " ").trim();
}

function calculateProgress(topic, messages) {
  const studentText = messages
    .filter((message) => message.source === "user" && message.meta !== "prompt")
    .map((message) => message.message || "")
    .join(" ")
    .toLowerCase();

  return topic.checks.map((check) => {
    const matchedKeywords = check.keywords.filter((keyword) =>
      studentText.includes(keyword.toLowerCase())
    );

    if (check.context) {
      const hasContext = check.context.some((keyword) =>
        studentText.includes(keyword.toLowerCase())
      );

      if (!hasContext) {
        return false;
      }
    }

    return matchedKeywords.length >= check.required;
  });
}
function generateRecap(topic, progress, messages, who = "Grandma") {
  const grandmaMessages = messages
    .filter(
      (message) => message.source !== "user" && message.source !== "system"
    )
    .map((message) => message.message || "")
    .filter(Boolean);

  const userMessages = messages
    .filter((message) => message.source === "user" && message.meta !== "prompt")
    .map((message) => message.message || "")
    .filter(Boolean);

  const completedPoints = topic.points.filter(
    (_, index) => progress[index]
  );

  const missingPoints = topic.points.filter(
    (_, index) => !progress[index]
  );

  const questions = grandmaMessages.filter((message) =>
    message.includes("?")
  );

  const clarificationMessages = grandmaMessages.filter((message) => {
    const text = message.toLowerCase();

    return (
      text.includes("what exactly") ||
      text.includes("what does") ||
      text.includes("how does") ||
      text.includes("why does") ||
      text.includes("could you explain") ||
      text.includes("what do you mean") ||
      text.includes("what kind of")
    );
  });

  let verdict;

  if (completedPoints.length === topic.points.length) {
    verdict =
      `You explained all the key ideas clearly enough for ${who} to follow. Well done${who === "Grandma" ? ", darling" : ""}!`;
  } else if (completedPoints.length >= 2) {
    verdict =
      `You're getting there${who === "Grandma" ? ", darling" : ""}. ${who} understood several important ideas, but a few parts could be clearer.`;
  } else {
    verdict =
      `That's a good start${who === "Grandma" ? ", darling" : ""}. A few important ideas still need a little more explaining.`;
  }

  return {
    completedPoints,
    missingPoints,
    userMessages,
    grandmaMessages,
    questions,
    clarificationMessages,
    verdict,
  };
}
function App() {
  // The page you were on, restored across refresh (per tab).
  const [snap] = useState(loadSnapshot);

  const [selectedTopic, setSelectedTopic] = useState(snap?.selectedTopic ?? null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState(snap?.messages ?? []);
  const [showRecap, setShowRecap] = useState(snap?.showRecap ?? false);
  const [aiGrade, setAiGrade] = useState(snap?.aiGrade ?? null);
  const [isGrading, setIsGrading] = useState(false);
  const [topicInput, setTopicInput] = useState(snap?.topicInput ?? "");
  const [isBuildingLesson, setIsBuildingLesson] = useState(false);
  const [lessonError, setLessonError] = useState("");
  const [explainBack, setExplainBack] = useState(snap?.explainBack ?? null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [recallText, setRecallText] = useState(snap?.recallText ?? "");
  const [askedForRecall, setAskedForRecall] = useState(
    snap?.askedForRecall ?? false
  );
  const [challenge, setChallenge] = useState(snap?.challenge ?? null);
  const [isBuildingChallenge, setIsBuildingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [usedChallengeIds, setUsedChallengeIds] = useState(
    snap?.usedChallengeIds ?? []
  );
  const [challengeSentNotice, setChallengeSentNotice] = useState("");
  const [lessonXp, setLessonXp] = useState(snap?.lessonXp ?? null);
  const [newAchievements, setNewAchievements] = useState(
    snap?.newAchievements ?? []
  );
  const [displayScore, setDisplayScore] = useState(null);
  const [profileXp, setProfileXp] = useState(() =>
    FEATURES.progression ? loadProfile().xp : null
  );
  // Deliberately NOT reset when the topic changes — a student who picked the
  // Expert stays with the Expert across lessons until they choose otherwise.
  const [character, setCharacter] = useState(
    () =>
      CHARACTERS.find((c) => c.id === snap?.characterId) ?? CHARACTERS[0]
  );
  // #18 — a view preference, not session state: it survives lesson changes
  // and never touches what gets recorded or graded.
  const [voiceOnly, setVoiceOnly] = useState(snap?.voiceOnly ?? false);
  const [mood, setMood] = useState("curious");
  // Thinking time: the mic is off AND she has been told to wait. Never
  // snapshotted — the voice session dies on refresh, so a restored pause
  // would be a lie.
  const [paused, setPaused] = useState(false);
  // A preference, not lesson state: it survives topic changes and only
  // takes effect on the next lesson generated.
  const [language, setLanguage] = useState("en");
  // 0 = mouth closed, 1 = open. Driven by her real output volume.
  const [mouthOpen, setMouthOpen] = useState(0);
  // What the student predicted before teaching, 0-100, or null if they
  // skipped the question. Snapshotted so a refresh keeps the comparison.
  const [confidence, setConfidence] = useState(snap?.confidence ?? null);
  const [jury, setJury] = useState(snap?.jury ?? null);
  const [isConvening, setIsConvening] = useState(false);
  const [juryError, setJuryError] = useState("");
  // #46 (student half) — who is doing the teaching.
  const [you, setYou] = useState(() =>
    FEATURES.youCharacter ? loadYou() : null
  );
  const [showYouEditor, setShowYouEditor] = useState(false);
  const [youDraftName, setYouDraftName] = useState("");
  const [youDraftParams, setYouDraftParams] = useState(DEFAULT_PARAMS);
  const [isSavingYou, setIsSavingYou] = useState(false);
  // #11 — the misconception the character was directed to state, if any.
  const [ambush, setAmbush] = useState(snap?.ambush ?? null);
  // #10 — the retelling game: claims, which the student flagged, whether
  // they've locked their answers in.
  const [mirror, setMirror] = useState(snap?.mirror ?? null);
  const [mirrorFlags, setMirrorFlags] = useState(
    () => new Set(snap?.mirrorFlags ?? [])
  );
  const [mirrorSubmitted, setMirrorSubmitted] = useState(
    snap?.mirrorSubmitted ?? false
  );
  const [isBuildingMirror, setIsBuildingMirror] = useState(false);
  const [mirrorError, setMirrorError] = useState("");
  // #34 — the teach-off this session belongs to, if any: {code, player}.
  const [teachoff, setTeachoff] = useState(snap?.teachoff ?? null);
  const [teachoffBoard, setTeachoffBoard] = useState(null);
  const [teachoffName, setTeachoffName] = useState(
    () => (FEATURES.youCharacter ? loadYou()?.name : "") ?? ""
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  // Two stage directions in one context window produce garbage — every
  // director-channel sender records the student-turn it fired at, and no
  // sender may fire within 2 turns of the last.
  const directorTurnRef = useRef(snap?.directorTurn ?? -99);
  // When the agent last set its own mood. While that's recent, the keyword
  // heuristic stays quiet — a configured agent is never second-guessed.
  const lastToolMoodAt = useRef(0);
  const transcriptEndRef = useRef(null);
  // Her next reply after we ask is the recall itself — catch it as it lands.
  const pendingRecallRef = useRef(false);
  // One lesson attempt = one XP award. The id is minted once per attempt
  // (double-clicking Finish must not mint twice), and the commit effect
  // refuses to run for an id it has already paid out.
  const lessonIdRef = useRef(snap?.lessonId ?? null);
  const committedRef = useRef(snap?.committedId ?? null);
  // When the mic first opened for this attempt — Speed Teacher's clock.
  const sessionStartedAtRef = useRef(snap?.sessionStartedAt ?? null);

  // With the picker off, every derived name resolves to Grandma and the app
  // reads exactly as it did before characters existed.
  const activeCharacter = FEATURES.characterPicker ? character : CHARACTERS[0];
  const who = activeCharacter.shortName;
  const whoUpper = who.toUpperCase();
  const subj = activeCharacter.subj;
  const obj = activeCharacter.obj;
  const voiceOnlyActive = FEATURES.voiceOnly && voiceOnly;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh restores this exact page: every meaningful piece of state is
  // snapshotted per tab. The pay-once ids ride along so a reloaded recap
  // can never award its XP twice.
  useEffect(() => {
    saveSnapshot({
      selectedTopic,
      messages,
      showRecap,
      aiGrade,
      explainBack,
      recallText,
      askedForRecall,
      challenge,
      usedChallengeIds,
      ambush,
      teachoff,
      lessonXp,
      newAchievements,
      mirror,
      mirrorFlags: [...mirrorFlags],
      mirrorSubmitted,
      voiceOnly,
      topicInput,
      confidence,
      jury,
      characterId: character.id,
      lessonId: lessonIdRef.current,
      committedId: committedRef.current,
      sessionStartedAt: sessionStartedAtRef.current,
      directorTurn: directorTurnRef.current,
    });
  }, [
    selectedTopic,
    messages,
    showRecap,
    aiGrade,
    explainBack,
    recallText,
    askedForRecall,
    challenge,
    usedChallengeIds,
    ambush,
    teachoff,
    lessonXp,
    newAchievements,
    mirror,
    mirrorFlags,
    mirrorSubmitted,
    voiceOnly,
    topicInput,
    character,
    confidence,
    jury,
  ]);

  // If the tab died while grading was in flight, the recap comes back with
  // no verdict and no way to get one — refire the grade once on mount.
  useEffect(() => {
    if (
      showRecap &&
      !aiGrade &&
      !isGrading &&
      selectedTopic &&
      messages.some((m) => m.source === "user" && m.meta !== "prompt") &&
      committedRef.current !== lessonIdRef.current
    ) {
      gradeWithAI();
      explainBackWithAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A reloaded recap lost its in-memory board — fetch it back.
  useEffect(() => {
    if (!teachoff || !showRecap || teachoffBoard) {
      return;
    }

    fetch(`${GRADING_API}/api/teachoff/${teachoff.code}/runs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setTeachoffBoard(body.runs))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachoff, showRecap]);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to Grandma");
      setError("");
    },

    onDisconnect: (details) => {
      console.log("Disconnected:", details?.reason, details);

      if (details?.reason === "error") {
        setError(`The call to ${who} dropped unexpectedly.`);
      }
    },

    onMessage: (message) => {
      console.log("Conversation message:", message);

      // If we just asked her to say back what she understood, her next reply
      // is that answer — keep it so the recap can analyse her real words
      // rather than generating a second version that might disagree.
      if (pendingRecallRef.current && message.source !== "user") {
        pendingRecallRef.current = false;
        setRecallText(message.message ?? "");
      }

      // Read the mood off what she just said — but only while the agent
      // itself hasn't reported one recently. A guess never overrides the
      // model's own judgement.
      if (
        FEATURES.characterMood &&
        message.source !== "user" &&
        Date.now() - lastToolMoodAt.current > 15000
      ) {
        const guessed = guessMood(message.message);

        if (guessed) {
          setMood(guessed);
        }
      }

      setMessages((previous) => [
        ...previous,
        { ...message, message: scrub(message.message) },
      ]);
    },

    onError: (message, context) => {
      console.error("ElevenLabs error:", message, context);
      setError(`Something went wrong connecting to ${who}.`);
    },
  });

  // Declared directly after the conversation object: effect dependency
  // arrays evaluate during render in body order, and a const referenced
  // before its declaration is a ReferenceError — a blank page, not a warning.
  const isConnected = conversation.status === "connected";

  useConversationClientTool("set_mood", ({ mood: reported }) => {
    if (!FEATURES.characterMood) {
      return;
    }

    lastToolMoodAt.current = Date.now();
    setMood(MOODS.includes(reported) ? reported : "curious");
  });

  // Everything the explain-back feature accumulates. Cleared wherever a
  // lesson ends, so the next one never inherits the last one's recall.
  const resetJury = () => {
    setJury(null);
    setIsConvening(false);
    setJuryError("");
  };

  // Convening costs one call per juror, so it is asked for, never automatic.
  const convene = async () => {
    if (isConvening || jury) {
      return;
    }

    setIsConvening(true);
    setJuryError("");

    try {
      const response = await fetch(`${GRADING_API}/api/jury`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: selectedTopic.name,
          points: selectedTopic.points,
          transcript: messages.filter(
            (m) => m.meta !== "prompt" && m.source !== "system"
          ),
          jurors: CHARACTERS.filter((c) =>
            ["grandma", "child", "expert", "manager"].includes(c.id)
          ).map((c) => ({
            id: c.id,
            name: c.shortName,
            audience: c.audience,
            gradingStance: c.gradingStance,
          })),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setJuryError(body.error || "The jury couldn't reach a verdict.");
        return;
      }

      setJury(body);
    } catch (err) {
      console.error("Jury failed:", err);
      setJuryError("Could not reach the server.");
    } finally {
      setIsConvening(false);
    }
  };

  const resetMood = () => {
    setMood("curious");
    lastToolMoodAt.current = 0;
    setPaused(false);
  };

  // Take a moment to think without her filling the silence. Muting stops
  // her hearing the room; the stage direction stops her prompting.
  const togglePause = () => {
    if (!isConnected) {
      return;
    }

    const next = !paused;

    setPaused(next);
    conversation.setMuted(next);
    conversation.sendContextualUpdate(
      next ? DIRECTOR.pause : DIRECTOR.resume
    );
  };

  const resetRecall = () => {
    setExplainBack(null);
    setIsExplaining(false);
    setRecallText("");
    setAskedForRecall(false);
    pendingRecallRef.current = false;
  };

  // Same idea for the weakness-training re-run — a stale challenge from the
  // last topic must never bleed into the next one.
  const resetChallenge = () => {
    setChallenge(null);
    setIsBuildingChallenge(false);
    setChallengeError("");
  };

  // #39's deck belongs to the topic that generated it — cleared whenever
  // the topic changes, not when a lesson merely restarts.
  const resetChallengeCards = () => {
    setUsedChallengeIds([]);
    setChallengeSentNotice("");
  };

  const resetAmbush = () => {
    setAmbush(null);
    directorTurnRef.current = -99;
  };

  const resetTeachoff = () => {
    setTeachoff(null);
    setTeachoffBoard(null);
    setJoinCode("");
    setJoinError("");
  };

  const resetMirror = () => {
    setMirror(null);
    setMirrorFlags(new Set());
    setMirrorSubmitted(false);
    setIsBuildingMirror(false);
    setMirrorError("");
  };

  // Each lesson attempt scores once. Nulling the id means "no attempt in
  // flight", so a stale recap can never pay out again.
  const resetProgression = () => {
    setLessonXp(null);
    setDisplayScore(null);
    setNewAchievements([]);
    lessonIdRef.current = null;
    sessionStartedAtRef.current = null;
  };

  // Pays out exactly once per lesson attempt, and only after grading has
  // settled — celebrating before the grade lands can congratulate a failure.
  useEffect(() => {
    if (!FEATURES.progression || !showRecap || isGrading || !selectedTopic) {
      return;
    }

    if (!lessonIdRef.current || committedRef.current === lessonIdRef.current) {
      return;
    }

    committedRef.current = lessonIdRef.current;

    const saidAnything = messages.some(
      (m) => m.source === "user" && m.message && m.meta !== "prompt"
    );

    const progressNow = calculateProgress(selectedTopic, messages);
    const coveredCount = progressNow.filter(Boolean).length;

    const xp = xpForLesson({
      results: aiGrade?.results ?? null,
      moments: aiGrade?.moments ?? null,
      coveredCount,
      totalPoints: progressNow.length,
      saidAnything,
    });

    if (!xp) {
      return;
    }

    const score = feynmanScore({
      understoodCount: aiGrade?.results
        ? aiGrade.results.filter((r) => r.understood).length
        : null,
      coveredCount,
      totalPoints: progressNow.length,
      clarificationCount: generateRecap(selectedTopic, progressNow, messages, who)
        .clarificationMessages.length,
    });

    setLessonXp({ ...xp, score });

    // A "real answer" to one of their questions: her question mark followed
    // by fifteen or more of the student's words.
    let deepAnswers = 0;

    for (let i = 0; i < messages.length - 1; i++) {
      const q = messages[i];
      const a = messages[i + 1];

      if (
        q.source === "ai" &&
        q.message?.includes("?") &&
        a.source === "user" &&
        a.meta !== "prompt" &&
        (a.message || "").split(/\s+/).length >= 15
      ) {
        deepAnswers++;
      }
    }

    const earned = FEATURES.achievements
      ? evaluateAchievements(
          {
            results: aiGrade?.results ?? null,
            moments: aiGrade?.moments ?? null,
            score,
            clarificationCount: generateRecap(
              selectedTopic,
              progressNow,
              messages,
              who
            ).clarificationMessages.length,
            durationMs: sessionStartedAtRef.current
              ? Date.now() - sessionStartedAtRef.current
              : null,
            mythCaught: Boolean(aiGrade?.misconceptionHandling?.corrected),
            deepAnswers,
          },
          loadProfile()
        )
      : [];

    setNewAchievements(earned);

    setProfileXp(
      commitLessonXp(xp.total, {
        hadAnalogy: Boolean(aiGrade?.moments?.usedGoodAnalogy?.happened),
        strongScore: score !== null && score >= 75,
        newAchievements: earned,
      }).xp
    );

    if (FEATURES.teachOff && teachoff && score !== null) {
      postTeachoffRun(teachoff.code, teachoff.player, score);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecap, isGrading, aiGrade, selectedTopic, messages, teachoff]);

  // #11 auto-trigger: fires when the 4th student utterance lands — late
  // enough that "I think I've got it now" is plausible, early enough that
  // there's lesson left to correct it in. Shift+M fires it manually, so a
  // rehearsal never depends on counting turns.
  useEffect(() => {
    if (!FEATURES.misconceptionAmbush || ambush) {
      return;
    }

    const last = messages[messages.length - 1];
    const turns = messages.filter(
      (m) => m.source === "user" && m.meta !== "prompt"
    ).length;

    if (last?.source === "user" && last.meta !== "prompt" && turns === 4) {
      fireAmbush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    if (!FEATURES.misconceptionAmbush) {
      return;
    }

    const onKey = (event) => {
      if (event.shiftKey && event.key.toLowerCase() === "m") {
        fireAmbush();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambush, isConnected, selectedTopic, messages]);

  useEffect(() => {
    if (!paused || !isConnected) {
      return;
    }

    // Comfortably under any plausible turn timeout, so the timer never
    // reaches zero while the student is thinking.
    const beat = setInterval(() => {
      try {
        conversation.sendUserActivity();
      } catch (err) {
        console.error("Could not hold the pause:", err);
      }
    }, 3000);

    conversation.sendUserActivity();

    return () => clearInterval(beat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, isConnected]);

  useEffect(() => {
    if (!FEATURES.characterMouth || !conversation.isSpeaking || paused) {
      setMouthOpen(0);
      return;
    }

    let frame;
    let smoothed = 0;

    const tick = () => {
      let level = 0;

      try {
        level = conversation.getOutputVolume() ?? 0;
      } catch {
        level = 0;
      }

      // Ease toward the target so the mouth doesn't strobe on every
      // frame, but stays quick enough to look like speech.
      smoothed += (Math.min(level * 3.2, 1) - smoothed) * 0.45;
      setMouthOpen(smoothed < 0.06 ? 0 : smoothed);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.isSpeaking, paused]);

  // The score counts up over ~800ms — unless the viewer asked for reduced
  // motion, in which case it lands immediately.
  useEffect(() => {
    if (lessonXp?.score === null || lessonXp?.score === undefined) {
      setDisplayScore(null);
      return;
    }

    const target = lessonXp.score;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setDisplayScore(target);
      return;
    }

    let frame;
    const startedAt = performance.now();

    const tick = (now) => {
      const t = Math.min((now - startedAt) / 800, 1);
      setDisplayScore(Math.round(target * t));

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [lessonXp]);

  const startConversation = async () => {
    try {
      setError("");
      setMessages([]);

      await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      if (!sessionStartedAtRef.current) {
        sessionStartedAtRef.current = Date.now();
      }

      await conversation.startSession({
        agentId: AGENT_ID,
        // Kept regardless of character — the dashboard's own Grandma prompt
        // still reads these, and that prompt is the fallback if the
        // override toggles turn out to be off.
        dynamicVariables: {
          topic: selectedTopic.name,
          topicDescription: selectedTopic.description,
        },
        ...(FEATURES.characterPicker
          ? {
              overrides: {
                agent: {
                  prompt: {
                    prompt: buildPersonaPrompt(
                      activeCharacter,
                      selectedTopic,
                      FEATURES.multilingual ? language : "en"
                    ),
                  },
                  ...(FEATURES.multilingual && language !== "en"
                    ? { language }
                    : {}),
                  // Each character's distinct greeting doubles as the
                  // override canary: hear the wrong one, and you know the
                  // dashboard toggles aren't live.
                  firstMessage: (FEATURES.multilingual && language === "de"
                    ? activeCharacter.firstMessageDe ??
                      activeCharacter.firstMessage
                    : activeCharacter.firstMessage
                  ).replace("{topic}", selectedTopic.name),
                },
                // Sent only when set — an explicit null is a rejected
                // payload, not a fallback.
                ...(activeCharacter.voiceId
                  ? { tts: { voiceId: activeCharacter.voiceId } }
                  : {}),
              },
            }
          : {}),
      });
    } catch (err) {
      console.error("Could not start conversation:", err);

      if (err?.name === "NotAllowedError") {
        setError(
          "Microphone blocked — click the padlock in the address bar, allow the microphone, then try again."
        );
      } else if (err?.name === "NotFoundError") {
        setError(
          "No microphone found — plug one in or check the input settings."
        );
      } else {
        setError(
          `Could not connect to ${who}. Check the connection and try again.`
        );
      }
    }
  };

  const stopConversation = async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error("Could not end conversation:", err);
    }
  };
  const finishLesson = async () => {
    try {
      if (conversation.status === "connected") {
        await conversation.endSession();
      }

      // Mint once per attempt — a second click of Finish finds the id
      // already set and the commit effect pays out nothing extra.
      if (!lessonIdRef.current) {
        lessonIdRef.current = crypto.randomUUID();
      }

      setShowRecap(true);
      gradeWithAI();
      explainBackWithAI();
    } catch (err) {
      console.error("Could not finish lesson:", err);
      setError("Could not finish the lesson cleanly.");
    }
  };

  // Asks Claude whether the student really explained each point. The recap
  // renders immediately either way — this only enriches it once it arrives,
  // so a slow or failed call never blocks the lesson from ending.
  const gradeWithAI = async () => {
    const saidAnything = messages.some(
      (message) => message.source === "user" && message.message
    );

    if (!saidAnything) {
      return;
    }

    setIsGrading(true);

    try {
      const response = await fetch(`${GRADING_API}/api/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: selectedTopic.name,
          points: selectedTopic.points,
          transcript: messages.filter(
            (m) => m.meta !== "prompt" && m.source !== "system"
          ),
          ...(FEATURES.characterPicker
            ? {
                character: {
                  name: activeCharacter.shortName,
                  audience: activeCharacter.audience,
                  gradingStance: activeCharacter.gradingStance,
                },
              }
            : {}),
          ...(ambush ? { ambushedMisconception: ambush.text } : {}),
          ...(FEATURES.multilingual ? { language } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Grading server returned ${response.status}`);
      }

      setAiGrade(await response.json());
    } catch (err) {
      // Keyword grading already produced a usable recap, so stay quiet.
      console.error("AI grading unavailable:", err);
    } finally {
      setIsGrading(false);
    }
  };

  // Asks Grandma to repeat back what she absorbed, using only the student's
  // own words. Runs alongside grading and never blocks the recap.
  const explainBackWithAI = async () => {
    if (!FEATURES.explainBack) {
      return;
    }

    const saidAnything = messages.some(
      (message) =>
        message.source === "user" && message.message && message.meta !== "prompt"
    );

    if (!saidAnything) {
      return;
    }

    setIsExplaining(true);

    try {
      const response = await fetch(`${GRADING_API}/api/explainback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: selectedTopic.name,
          points: selectedTopic.points,
          transcript: messages.filter(
            (m) => m.meta !== "prompt" && m.source !== "system"
          ),
          // If the listener already said it out loud, analyse those words.
          grandmaRecall: recallText || undefined,
          ...(FEATURES.characterPicker ? { characterName: who } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Explain-back returned ${response.status}`);
      }

      setExplainBack(await response.json());
    } catch (err) {
      // The rest of the recap stands on its own without this.
      console.error("Explain-back unavailable:", err);
    } finally {
      setIsExplaining(false);
    }
  };

  // The live version: she answers out loud, in her own voice, before the
  // call ends. The prompt is tagged so it never counts as the student's
  // explanation when the transcript is graded.
  const askGrandmaToRecall = () => {
    if (askedForRecall || conversation.status !== "connected") {
      return;
    }

    const ask =
      `${who}, before I go — can you tell me back what you understood, in your own words?`;

    setAskedForRecall(true);
    pendingRecallRef.current = true;
    conversation.sendUserMessage(ask);

    setMessages((previous) => [
      ...previous,
      { source: "user", message: ask, meta: "prompt" },
    ]);
  };

  // A contextual update never forces a turn — she'll act on it once she
  // next speaks, which may be a beat after the student stops talking. The
  // on-screen confirmation is what turns that unavoidable delay into intent
  // rather than a button that looks like it did nothing.
  const sendChallengeCard = (card) => {
    const turns = messages.filter(
      (m) => m.source === "user" && m.meta !== "prompt"
    ).length;

    if (
      !isConnected ||
      usedChallengeIds.includes(card.id) ||
      turns - directorTurnRef.current < 2
    ) {
      return;
    }

    directorTurnRef.current = turns;
    conversation.sendContextualUpdate(
      `The student has accepted a challenge. On your next turn, ask them this in your own words, in one short sentence, without explaining why you are asking: ${card.instruction}`
    );

    setUsedChallengeIds((previous) => [...previous, card.id]);
    setChallengeSentNotice(`Challenge sent — ${who} will ask you next.`);
    setTimeout(() => setChallengeSentNotice(""), 6000);
  };

  // #11 — direct the character to state a misconception as if it were their
  // own conclusion. Fires once per lesson; the student has to catch it.
  const fireAmbush = () => {
    const pool = selectedTopic?.misconceptions ?? [];
    const turns = messages.filter(
      (m) => m.source === "user" && m.meta !== "prompt"
    ).length;

    if (
      ambush ||
      !isConnected ||
      pool.length === 0 ||
      turns - directorTurnRef.current < 2
    ) {
      return;
    }

    const text = pool[0];

    directorTurnRef.current = turns;
    conversation.sendContextualUpdate(DIRECTOR.misconception(text));
    setAmbush({ text, firedAtTurn: turns });

    // A visible beat in the transcript, so the moment reads as designed
    // rather than as the AI hallucinating. Tagged "system": never graded,
    // never counted as coverage, never sent to the server.
    setMessages((previous) => [
      ...previous,
      {
        source: "system",
        message: `${who} is about to get something wrong. Catch ${obj}.`,
      },
    ]);
  };

  // Diagnoses the one weakness that actually showed up, then sends the
  // student back into the same lesson to fix specifically that. For a
  // jargon diagnosis, the banned words get enforced live in the sidebar.
  const takeChallenge = async () => {
    if (isBuildingChallenge) {
      return;
    }

    const priorTranscript = messages.filter(
      (m) => m.meta !== "prompt" && m.source !== "system"
    );
    const said = priorTranscript
      .filter((m) => m.source === "user")
      .map((m) => m.message || "")
      .join(" ")
      .toLowerCase();

    setIsBuildingChallenge(true);
    setChallengeError("");

    try {
      const response = await fetch(`${GRADING_API}/api/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: selectedTopic.name,
          points: selectedTopic.points,
          transcript: priorTranscript,
          unexplainedTerms: explainBack?.unexplainedTerms ?? [],
          priorWeakness: null,
          ...(FEATURES.characterPicker ? { characterName: who } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Challenge server returned ${response.status}`);
      }

      const data = await response.json();

      // Belt and braces: the server already drops terms the student never
      // said, but a banned word that can never appear in the transcript
      // would be an unwinnable, unfair constraint — never trust and render.
      const bannedTerms = (data.bannedTerms ?? []).filter((term) =>
        said.includes(term.toLowerCase())
      );

      setChallenge({ ...data, bannedTerms });

      // Back into the same lesson, clean, for the re-run. The teach-off
      // deliberately survives: a re-run is another attempt on the same
      // board, posted under the same name.
      setShowRecap(false);
      setMessages([]);
      setAiGrade(null);
      resetRecall();
      resetProgression();
      resetAmbush();
      resetMirror();
      resetMood();
      resetJury();
      setConfidence(null);
    } catch (err) {
      console.error("Could not build challenge:", err);
      setChallengeError("Could not put together a challenge right now.");
    } finally {
      setIsBuildingChallenge(false);
    }
  };

  const startMirror = async () => {
    if (isBuildingMirror || mirror) {
      return;
    }

    setIsBuildingMirror(true);
    setMirrorError("");

    try {
      const response = await fetch(`${GRADING_API}/api/mirror`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: selectedTopic.name,
          points: selectedTopic.points,
          transcript: messages.filter(
            (m) => m.meta !== "prompt" && m.source !== "system"
          ),
          misconceptions: selectedTopic.misconceptions,
          errorCount: 2,
          ...(FEATURES.characterPicker ? { characterName: who } : {}),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setMirrorError(body.error || "Could not build the retelling.");
        return;
      }

      setMirror(body);
    } catch (err) {
      console.error("Mirror failed:", err);
      setMirrorError("Could not reach the server.");
    } finally {
      setIsBuildingMirror(false);
    }
  };

  const saveYouProfile = async () => {
    if (isSavingYou) {
      return;
    }

    setIsSavingYou(true);

    // Caches the composed face as a data URL so it renders offline.
    const saved = await saveYou(youDraftName, youDraftParams);

    setIsSavingYou(false);

    if (saved) {
      setYou(saved);
      setShowYouEditor(false);

      // Convenience, not identity: prefill the board name if it's empty.
      if (!teachoffName.trim()) {
        setTeachoffName(saved.name);
      }
    }
  };

  // ‹ › through an attribute's options, wrapping at the ends.
  const stepYouParam = (key, direction) => {
    setYouDraftParams((previous) => {
      const options = YOU_OPTIONS[key];
      const index = options.findIndex(
        (o) => o.value === (previous[key] ?? "")
      );
      const next =
        (index + direction + options.length) % options.length;

      return { ...previous, [key]: options[next].value };
    });
  };

  const toggleMirrorFlag = (id) => {
    if (mirrorSubmitted) {
      return;
    }

    // A new Set each time — mutating the old one is invisible to React.
    setMirrorFlags((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const postTeachoffRun = async (code, player, score) => {
    try {
      const response = await fetch(
        `${GRADING_API}/api/teachoff/${code}/runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player,
            score,
            understoodCount: aiGrade?.results
              ? aiGrade.results.filter((r) => r.understood).length
              : null,
            totalPoints: selectedTopic?.points.length ?? null,
            summary: aiGrade?.summary ?? "",
          }),
        }
      );

      const body = await response.json();

      if (response.ok) {
        setTeachoffBoard(body.runs);
      }
    } catch (err) {
      // The recap stands without the board.
      console.error("Could not post teach-off run:", err);
    }
  };

  // Creator side: turn the lesson just taught into a shared board, and
  // post their own already-computed score as the first run.
  const startTeachoff = async () => {
    const player = teachoffName.trim();

    if (!player || !selectedTopic || lessonXp?.score == null) {
      return;
    }

    try {
      const response = await fetch(`${GRADING_API}/api/teachoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson: selectedTopic }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || `Server returned ${response.status}`);
      }

      setTeachoff({ code: body.code, player });
      postTeachoffRun(body.code, player, lessonXp.score);
    } catch (err) {
      console.error("Could not start teach-off:", err);
    }
  };

  // Joiner side: fetch the EXACT stored lesson — never regenerate it, or
  // the two players' scores stop being comparable.
  const joinTeachoff = async () => {
    const code = joinCode.trim().toUpperCase();
    const player = teachoffName.trim();

    if (!code || !player || isJoining) {
      return;
    }

    setIsJoining(true);
    setJoinError("");

    try {
      const response = await fetch(`${GRADING_API}/api/teachoff/${code}`);
      const body = await response.json();

      if (!response.ok) {
        setJoinError(body.error || "Could not find that teach-off.");
        return;
      }

      setSelectedTopic(body.lesson);
      setTeachoff({ code: body.code, player });
      setMessages([]);
      setError("");
      setAiGrade(null);
      setShowRecap(false);
      resetRecall();
      resetChallenge();
      resetChallengeCards();
      resetAmbush();
      resetProgression();
    } catch (err) {
      console.error("Could not join teach-off:", err);
      setJoinError("Could not reach the server.");
    } finally {
      setIsJoining(false);
    }
  };

  // Any topic the student types becomes a lesson: the server decides what
  // has to be covered for a beginner to actually follow it.
  const startLesson = async (topic) => {
    const wanted = topic.trim();

    if (!wanted || isBuildingLesson) {
      return;
    }

    setIsBuildingLesson(true);
    setLessonError("");

    try {
      const response = await fetch(`${GRADING_API}/api/lesson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: wanted,
          ...(FEATURES.multilingual ? { language } : {}),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setLessonError(body.error || "Could not build a lesson for that.");
        return;
      }

      setSelectedTopic(toLesson(body));
      setMessages([]);
      setError("");
      setAiGrade(null);
      setShowRecap(false);
      resetRecall();
      resetChallenge();
      resetChallengeCards();
      resetAmbush();
      resetTeachoff();
      resetMirror();
      resetMood();
      resetJury();
      setConfidence(null);
      resetProgression();
    } catch (err) {
      console.error("Could not build lesson:", err);

      setLessonError(
        "Could not reach the lesson server. Is it running on port 3001?"
      );
    } finally {
      setIsBuildingLesson(false);
    }
  };

  if (!selectedTopic) {
    return (
      <main className="app">
        <section className="hero">
          <div className="eyebrow">TEACH IT TO GRANDMA</div>

          <h1>
            If you can't explain it
            <br />
            <span>to Grandma,</span>
            <br />
            do you really understand it?
          </h1>

          <p className="subtitle">
            Name anything you know. Then try to teach it to someone
            who knows absolutely nothing about it.
          </p>

          {FEATURES.youCharacter && (
            <div className="you-widget">
              {you ? (
                <button
                  className="you-chip"
                  onClick={() => {
                    setYouDraftName(you.name);
                    setYouDraftParams(you.params);
                    setShowYouEditor((v) => !v);
                  }}
                  title="Change your character"
                >
                  <img className="you-face" src={you.src} alt="" />
                  <span>{you.name}</span>
                  <span className="you-edit-hint">✎</span>
                </button>
              ) : (
                <button
                  className="you-chip you-chip-empty"
                  onClick={() => {
                    setYouDraftName("");
                    setYouDraftParams(DEFAULT_PARAMS);
                    setShowYouEditor((v) => !v);
                  }}
                >
                  🙂 Create your character
                </button>
              )}

              {showYouEditor && (
                <div className="you-editor">
                  <input
                    className="you-name-input"
                    value={youDraftName}
                    onChange={(event) => setYouDraftName(event.target.value)}
                    placeholder="Your name"
                    maxLength={24}
                    autoFocus
                  />

                  <div className="you-presets">
                    {YOU_PRESETS.map((preset, index) => (
                      <button
                        key={index}
                        className="you-preset"
                        title="Start from this one, then tweak"
                        onClick={() => setYouDraftParams(preset)}
                      >
                        <img src={`/you-${index + 1}.png`} alt="" />
                      </button>
                    ))}
                  </div>

                  <div className="you-builder">
                    <img
                      className="you-preview"
                      src={buildYouUrl(youDraftParams, 192)}
                      alt="Your character"
                    />

                    <div className="you-dials">
                      {[
                        ["head", "Hair"],
                        ["facialHair", "Facial hair"],
                        ["accessories", "Glasses"],
                        ["face", "Expression"],
                      ].map(([key, title]) => {
                        const current = YOU_OPTIONS[key].find(
                          (o) => o.value === (youDraftParams[key] ?? "")
                        );

                        return (
                          <div className="you-dial" key={key}>
                            <span className="you-dial-title">{title}</span>

                            <span className="you-dial-control">
                              <button
                                className="you-step"
                                onClick={() => stepYouParam(key, -1)}
                              >
                                ‹
                              </button>

                              <span className="you-dial-value">
                                {current?.label ?? "—"}
                              </span>

                              <button
                                className="you-step"
                                onClick={() => stepYouParam(key, 1)}
                              >
                                ›
                              </button>
                            </span>
                          </div>
                        );
                      })}

                      <div className="you-dial">
                        <span className="you-dial-title">Skin</span>

                        <span className="you-swatches">
                          {YOU_OPTIONS.skin.map((o) => (
                            <button
                              key={o.value}
                              className={`you-swatch ${
                                youDraftParams.skin === o.value
                                  ? "selected"
                                  : ""
                              }`}
                              style={{ background: `#${o.value}` }}
                              title={o.label}
                              onClick={() =>
                                setYouDraftParams((prev) => ({
                                  ...prev,
                                  skin: o.value,
                                }))
                              }
                            />
                          ))}
                        </span>
                      </div>

                      <div className="you-dial">
                        <span className="you-dial-title">Backdrop</span>

                        <span className="you-swatches">
                          {YOU_OPTIONS.bg.map((o) => (
                            <button
                              key={o.value}
                              className={`you-swatch ${
                                youDraftParams.bg === o.value ? "selected" : ""
                              }`}
                              style={{ background: `#${o.value}` }}
                              title={o.label}
                              onClick={() =>
                                setYouDraftParams((prev) => ({
                                  ...prev,
                                  bg: o.value,
                                }))
                              }
                            />
                          ))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    className="you-save"
                    onClick={saveYouProfile}
                    disabled={!youDraftName.trim() || isSavingYou}
                  >
                    {isSavingYou ? "Saving…" : "That's me →"}
                  </button>
                </div>
              )}
            </div>
          )}

          {FEATURES.characterPicker && CHARACTERS.length > 1 && (
            <>
              <h2>Who are you teaching?</h2>

              <div className="character-grid">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    className={`character-card ${
                      character.id === c.id ? "selected" : ""
                    }`}
                    onClick={() => setCharacter(c)}
                    disabled={isBuildingLesson}
                  >
                    {c.image ? (
                      <img
                        className="character-card-face"
                        src={c.image}
                        alt=""
                      />
                    ) : (
                      <span
                        className="character-card-glyph"
                        style={{ background: c.color }}
                      >
                        {c.glyph}
                      </span>
                    )}

                    <span className="character-card-name">{c.role}</span>
                    <span className="character-card-level">{c.difficulty}</span>
                    <span className="character-card-hook">{c.hook}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h2>What do you want to teach?</h2>

          {FEATURES.multilingual && (
            <div className="language-row">
              <span className="language-label">Teach in</span>

              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  className={`language-chip ${
                    language === l.code ? "selected" : ""
                  }`}
                  onClick={() => setLanguage(l.code)}
                  disabled={isBuildingLesson}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          )}

          <form
            className="topic-form"
            onSubmit={(event) => {
              event.preventDefault();
              startLesson(topicInput);
            }}
          >
            <input
              className="topic-input"
              value={topicInput}
              onChange={(event) => setTopicInput(event.target.value)}
              placeholder="Backpropagation, embeddings, why transformers replaced RNNs…"
              disabled={isBuildingLesson}
              autoFocus
            />

            <button
              className="topic-submit"
              type="submit"
              disabled={isBuildingLesson || !topicInput.trim()}
            >
              {isBuildingLesson ? "Preparing…" : "Teach it →"}
            </button>
          </form>

          {isBuildingLesson && (
            <p className="topic-status">
              Working out what {who} would need to hear…
            </p>
          )}

          {lessonError && (
            <p className="error-message topic-error">{lessonError}</p>
          )}

          {FEATURES.teachOff && (
            <div className="teachoff-join">
              <span className="topic-suggestions-label">
                Got a Teach-Off code?
              </span>

              <input
                className="join-input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="TEACH-XXXX"
                maxLength={10}
              />

              <input
                className="join-input"
                value={teachoffName}
                onChange={(event) => setTeachoffName(event.target.value)}
                placeholder="Your name"
                maxLength={24}
              />

              <button
                className="join-button"
                onClick={joinTeachoff}
                disabled={isJoining || !joinCode.trim() || !teachoffName.trim()}
              >
                {isJoining ? "Joining…" : "Join →"}
              </button>

              {joinError && <span className="join-error">{joinError}</span>}
            </div>
          )}

          <div className="topic-suggestions">
            <span className="topic-suggestions-label">Or try</span>

            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                className="topic-chip"
                disabled={isBuildingLesson}
                onClick={() => {
                  setTopicInput(topic);
                  startLesson(topic);
                }}
              >
                {topic}
              </button>
            ))}
          </div>

          <div className="reset-row">
            <button
              className="reset-link"
              onClick={() => resetNow("session")}
              title="Clears any half-finished lesson still saved in this tab. Keeps your name, XP and badges."
            >
              Clear saved lesson
            </button>

            <span className="reset-sep">·</span>

            <button
              className="reset-link danger"
              onClick={() => {
                const sure = window.confirm(
                  "Clear everything?\n\nYour name, face, XP and badges will be deleted. This can't be undone."
                );

                if (sure) {
                  resetNow("all");
                }
              }}
              title="Deletes your name, face, XP and badges as well"
            >
              Reset everything
            </button>
          </div>
        </section>
      </main>
    );
  }


  const lastSpeakerWasStudent =
    [...messages].reverse().find((m) => m.source !== "system")?.source ===
    "user";

  // What she is doing, as opposed to how she feels — the two are
  // independent, and she is routinely both confused and speaking.
  const channel = channelState({
    isConnected,
    isSpeaking: conversation.isSpeaking,
    isListening: conversation.isListening,
    awaitingReply: lastSpeakerWasStudent,
  });

  const progress = calculateProgress(selectedTopic, messages);
  const completedCount = progress.filter(Boolean).length;
  const totalCount = progress.length;

  // A banned word turns red the instant it's spoken. Recomputed on every
  // render from the live transcript — no separate tracking state needed.
  const bannedHits = new Set();

  if (challenge?.bannedTerms?.length) {
    const saidSoFar = messages
      .filter((m) => m.source === "user" && m.meta !== "prompt")
      .map((m) => m.message || "")
      .join(" ")
      .toLowerCase();

    for (const term of challenge.bannedTerms) {
      if (saidSoFar.includes(term.toLowerCase())) {
        bannedHits.add(term);
      }
    }
  }
  const recap = generateRecap(
    selectedTopic,
    progress,
    messages,
    who
  );
  if (showRecap) {
    // Once Grandma has judged the explanation, her verdict is the one that
    // counts — the keyword lists only stand in until it arrives.
    const gradedClear = aiGrade?.results
      ?.filter((result) => result.understood)
      .map((result) => result.point);

    const gradedUnclear = aiGrade?.results
      ?.filter((result) => !result.understood)
      .map((result) => result.point);

    const clearPoints = gradedClear ?? recap.completedPoints;
    const unclearPoints = gradedUnclear ?? recap.missingPoints;
    const gotEverythingAcross = unclearPoints.length === 0;

    return (
      <main className="app">
        <section className="recap-page">
          <div className="eyebrow">{whoUpper}'S NOTES</div>

          <h1>
            {gotEverythingAcross
              ? activeCharacter.headlineWin
              : activeCharacter.headlineRetry}
          </h1>

          <p className="recap-subtitle">
            Here's what {who} understood from your lesson on{" "}
            <strong>{selectedTopic.name}</strong>.
          </p>

          {FEATURES.progression && isGrading && !lessonXp && (
            <section className="completion-band">
              <p className="score-pending">
                {who} is marking your lesson…
              </p>
            </section>
          )}

          {FEATURES.progression && lessonXp && (
            <section className="completion-band">
              {lessonXp.score !== null ? (
                <div className="score-row">
                  <div
                    className={`feynman-score score-${bandForScore(
                      lessonXp.score
                    )}`}
                  >
                    <span className="score-number">
                      {displayScore ?? lessonXp.score}
                    </span>
                    <span className="score-denom">/ 100</span>
                  </div>

                  <div>
                    <div className="score-label">FEYNMAN SCORE</div>
                    <div className="score-verdict">
                      {verdictForScore(lessonXp.score, who)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="score-unavailable">
                  {who} couldn't mark this one — XP for coverage only.
                </p>
              )}

              <ul className="xp-list">
                {lessonXp.events.map((event) => (
                  <li key={event.label}>
                    <span className="xp-amount">+{event.xp}</span>

                    <span className="xp-what">
                      {event.label}
                      {event.quote && (
                        <em className="xp-quote"> — “{event.quote}”</em>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {FEATURES.confidenceGap &&
                confidence !== null &&
                lessonXp.score !== null && (
                  <div className="confidence-compare">
                    <span className="cc-cell">
                      <span className="cc-label">You predicted</span>
                      <span className="cc-value">{confidence}</span>
                    </span>

                    <span className="cc-cell">
                      <span className="cc-label">Measured</span>
                      <span className="cc-value">{lessonXp.score}</span>
                    </span>

                    <span className="cc-verdict">
                      {(() => {
                        const gap = confidence - lessonXp.score;

                        if (gap >= 20) {
                          return `You were ${gap} points more confident than the explanation turned out to be.`;
                        }

                        if (gap <= -20) {
                          return `You sold yourself short by ${-gap} points.`;
                        }

                        return "You knew roughly where you stood.";
                      })()}
                    </span>
                  </div>
                )}

              <div className="xp-total">
                <strong>+{lessonXp.total} XP</strong>
                {profileXp !== null && (
                  <span className="xp-running">
                    {" "}· {profileXp} XP total in this browser
                  </span>
                )}
              </div>

              {FEATURES.achievements && (
                <div className="achievement-strip">
                  {ACHIEVEMENTS.map((a) => {
                    const isNew = newAchievements.includes(a.id);
                    const owned =
                      isNew || Boolean(loadProfile().achievements?.[a.id]);

                    return (
                      <span
                        key={a.id}
                        className={`achievement-chip ${
                          owned ? "owned" : "locked"
                        } ${isNew ? "fresh" : ""}`}
                        title={a.how}
                      >
                        {a.icon} {a.name}
                        {isNew && <em className="achievement-new">NEW</em>}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <div className="grandma-verdict">
            <div className="grandma-verdict-avatar">{activeCharacter.glyph}</div>

            <div>
              <div className="grandma-verdict-label">
                {whoUpper} SAYS
              </div>

              <p>{aiGrade?.summary || recap.verdict}</p>

              {isGrading && (
                <p className="grading-status">
                  {who} is thinking it over…
                </p>
              )}
            </div>
          </div>

          {aiGrade?.results && (
            <section className="recap-card ai-grade-card">
              <div className="recap-head">
                <div className="recap-icon">🧠</div>
                <h2>Did {who} really understand?</h2>
              </div>

              <ul className="ai-grade-list">
                {aiGrade.results.map((result) => (
                  <li
                    key={result.point}
                    className={result.understood ? "understood" : "unclear"}
                  >
                    <span className="ai-grade-mark">
                      {result.understood ? "✓" : "○"}
                    </span>

                    <div>
                      <strong>{result.point}</strong>
                      <p>{result.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ambush && aiGrade?.misconceptionHandling && (
            <section className="recap-card myth-card">
              <div className="recap-head">
                <div className="recap-icon">🧨</div>
                <h2>The trap {who} set</h2>
              </div>

              <p className="myth-claim">
                Mid-lesson, {who} claimed: “{ambush.text}”
              </p>

              {aiGrade.misconceptionHandling.corrected ? (
                <p className="myth-verdict caught">
                  ✓ You caught it
                  {aiGrade.misconceptionHandling.quote && (
                    <em> — “{aiGrade.misconceptionHandling.quote}”</em>
                  )}
                </p>
              ) : (
                <p className="myth-verdict missed">
                  ○ {who} walked away still believing it. That false idea
                  went unchallenged.
                </p>
              )}
            </section>
          )}

          {FEATURES.difficultyPrediction &&
            aiGrade?.results &&
            selectedTopic.predictions && (
              <section className="recap-card predict-card">
                <div className="recap-icon">🔮</div>

                <h2>What it expected you to struggle with</h2>

                <p className="predict-intro">
                  Predicted before you said a word, from the topic alone.
                </p>

                <ul className="predict-list">
                  {selectedTopic.points.map((point, i) => {
                    const predicted =
                      selectedTopic.predictions[i]?.hardFor ?? null;
                    const understood = aiGrade.results.find(
                      (r) => r.point === point
                    )?.understood;

                    if (predicted === null || understood === undefined) {
                      return null;
                    }

                    const expectedTrouble = predicted !== "easy";
                    const hadTrouble = !understood;
                    const surprise = expectedTrouble !== hadTrouble;

                    return (
                      <li
                        key={point}
                        className={surprise ? "surprise" : "as-expected"}
                      >
                        <span className="predict-verdict">
                          {surprise
                            ? hadTrouble
                              ? "caught you out"
                              : "you beat it"
                            : hadTrouble
                              ? "as predicted"
                              : "as predicted"}
                        </span>

                        <span className="predict-point">
                          <strong>{point}</strong>
                          <em>
                            expected {predicted} · you{" "}
                            {understood ? "got it across" : "did not"}
                          </em>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

          {FEATURES.depthLadder && aiGrade?.depth && (
            <section className="recap-card depth-card">
              <div className="recap-head">
                <div className="recap-icon">🪜</div>
                <h2>How deep you went</h2>
              </div>

              <ol className="depth-ladder">
                {DEPTH_RUNGS.map((rung, i) => {
                  const reachedAt = DEPTH_RUNGS.findIndex(
                    (r) => r.key === aiGrade.depth.reached
                  );
                  const state =
                    i < reachedAt ? "below" : i === reachedAt ? "here" : "above";

                  return (
                    <li key={rung.key} className={`depth-rung ${state}`}>
                      <span className="depth-mark">
                        {state === "above" ? "○" : "●"}
                      </span>

                      <span className="depth-text">
                        <strong>{rung.label}</strong>
                        <em>{rung.hint}</em>
                      </span>

                      {state === "here" && (
                        <span className="depth-you">you got here</span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {aiGrade.depth.evidence && (
                <p className="depth-evidence">“{aiGrade.depth.evidence}”</p>
              )}

              {aiGrade.depth.next && (
                <p className="depth-next">
                  <strong>Next rung:</strong> {aiGrade.depth.next}
                </p>
              )}
            </section>
          )}

          {FEATURES.blindSpots && aiGrade?.blindSpots?.length > 0 && (
            <section className="recap-card">
              <div className="recap-head">
                <div className="recap-icon">🕳️</div>
                <h2>What you never went near</h2>
              </div>

              <p className="recap-sub">
                Not explained badly — never mentioned at all.
              </p>

              <ul className="blindspot-list">
                {aiGrade.blindSpots.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {FEATURES.aiJury && (
            <section className="recap-card jury-card">
              <div className="recap-head">
                <div className="recap-icon">🧑‍⚖️</div>
                <h2>The jury</h2>
              </div>

              {!jury ? (
                <>
                  <p className="recap-sub">
                    Four listeners, four standards. The same explanation can
                    land for one and fail for another.
                  </p>

                  <button
                    className="challenge-button"
                    onClick={convene}
                    disabled={isConvening}
                  >
                    {isConvening ? "The jury is deliberating…" : "Convene the jury →"}
                  </button>

                  {juryError && <p className="error-message">{juryError}</p>}
                </>
              ) : (
                <>
                  <div className="jury-rows">
                    {jury.verdicts.map((v) => (
                      <div className="juror" key={v.id}>
                        <span className="juror-name">{v.name}</span>

                        <span className="juror-bar">
                          <span
                            className={`juror-fill band-${bandForScore(v.score)}`}
                            style={{ width: `${v.score}%` }}
                          />
                        </span>

                        <span className="juror-score">{v.score}</span>

                        <span className="juror-said">
                          <strong>{v.headline}</strong> — {v.verdict}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="jury-spread">
                    {jury.spread >= 30
                      ? `${jury.spread} points between ${jury.kindest} and ${jury.toughest}. It worked for one of them and not the other — that gap is the thing worth fixing.`
                      : `Only ${jury.spread} points apart. It landed about the same for all four, which is the hard part.`}
                  </p>
                </>
              )}
            </section>
          )}

          {FEATURES.explainBack && isExplaining && !explainBack && (
            <section className="recap-card">
              <div className="recap-head">
                <div className="recap-icon">🔄</div>
                <h2>Let me see if I understood you</h2>
              </div>
              <p className="recap-pending">
                {who} is working out what {subj} actually took away…
              </p>
            </section>
          )}

          {FEATURES.explainBack && explainBack && (
            <section className="recap-card explainback-card">
              <div className="recap-head">
                <div className="recap-icon">🔄</div>
                <h2>Let me see if I understood you</h2>
              </div>

              {/* Counts, with their denominators visible. Coverage is what
                  you said; the other two are what actually landed. */}
              <div className="gap-scoreboard">
                <div className="gap-stat">
                  <span className="gap-label">You covered</span>
                  <span className="gap-value">
                    {progress.filter(Boolean).length} / {selectedTopic.points.length}
                  </span>
                </div>

                {aiGrade?.results && (
                  <div className="gap-stat">
                    <span className="gap-label">{who} followed</span>
                    <span className="gap-value">
                      {aiGrade.results.filter((r) => r.understood).length} /{" "}
                      {aiGrade.results.length}
                    </span>
                  </div>
                )}

                <div className="gap-stat">
                  <span className="gap-label">She could repeat back</span>
                  <span className="gap-value">
                    {explainBack.points.filter((p) => p.recalled === "correct").length}{" "}
                    / {explainBack.points.length}
                  </span>
                </div>
              </div>

              <div className="grandma-recall">
                <div className="recall-label">
                  {recallText
                    ? `What ${who} said out loud`
                    : `What ${who} took away`}
                </div>

                <p>{explainBack.recap}</p>
              </div>

              <ul className="recall-list">
                {explainBack.points.map((point) => (
                  <li key={point.point} className={`recall-${point.recalled}`}>
                    <span className="recall-mark">
                      {point.recalled === "correct"
                        ? "✓"
                        : point.recalled === "garbled"
                          ? "◐"
                          : "○"}
                    </span>

                    <div>
                      <strong>{point.point}</strong>

                      {point.grandmaSaid && (
                        <p className="recall-said">“{point.grandmaSaid}”</p>
                      )}

                      {point.gap && <p className="recall-gap">{point.gap}</p>}
                    </div>
                  </li>
                ))}
              </ul>

              {explainBack.unexplainedTerms.length > 0 && (
                <div className="unexplained">
                  <div className="recall-label">
                    Words you used but never explained
                  </div>

                  <div className="term-chips">
                    {explainBack.unexplainedTerms.map((term) => (
                      <span className="term-chip" key={term}>
                        {term}
                      </span>
                    ))}
                  </div>

                  <p className="recall-footnote">
                    Every word above came from your own explanation.
                  </p>
                </div>
              )}
            </section>
          )}

          {FEATURES.richNotes && aiGrade?.strongestMoment?.quote && (
            <section className="recap-card strongest-card">
              <div className="recap-head">
                <div className="recap-icon">💬</div>
                <h2>Your strongest moment</h2>
              </div>

              <blockquote className="strongest-quote">
                “{aiGrade.strongestMoment.quote}”
              </blockquote>

              {aiGrade.strongestMoment.why && (
                <p className="strongest-why">{aiGrade.strongestMoment.why}</p>
              )}
            </section>
          )}

          <div className="recap-grid">
            <section className="recap-card">
              <div className="recap-head">
                <div className="recap-icon">✓</div>
                <h2>What {who} followed</h2>
              </div>

              {clearPoints.length > 0 ? (
                <ul>
                  {clearPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p>Nothing came across clearly yet.</p>
              )}
            </section>

            <section className="recap-card">
              <div className="recap-head">
                <div className="recap-icon">💡</div>
                <h2>What to improve</h2>
              </div>

              {FEATURES.richNotes && aiGrade?.practiceThis && (
                <p className="practice-this">
                  🎯 {aiGrade.practiceThis}
                </p>
              )}

              {unclearPoints.length > 0 ? (
                <ul>
                  {unclearPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  {who} followed every point. That's the whole idea.
                </p>
              )}
            </section>
          </div>

          <div className="recap-card conversation-summary">
            <div className="recap-head">
              <div className="recap-icon">{activeCharacter.glyph}</div>
              <h2>Where {who} needed help</h2>
            </div>

            {FEATURES.richNotes && aiGrade?.stumbles?.length > 0 ? (
              <ul className="stumble-list">
                {aiGrade.stumbles.map((stumble, index) => (
                  <li key={index}>
                    “{stumble.grandmaQuote}”
                    {stumble.aboutTerm && (
                      <span className="stumble-term">
                        {stumble.aboutTerm}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : recap.clarificationMessages.length > 0 ? (
              <ul>
                {recap.clarificationMessages
                  .slice(0, 3)
                  .map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
              </ul>
            ) : recap.questions.length > 0 ? (
              <ul>
                {recap.questions
                  .slice(0, 3)
                  .map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
              </ul>
            ) : (
              <p>
                {who} didn't have any major questions about
                your explanation.
              </p>
            )}
          </div>
          <div className="recap-card">
            <div className="recap-head">
              <div className="recap-icon">💬</div>
              <h2>Your explanation</h2>
            </div>

            {recap.userMessages.length > 0 ? (
              <p>
                {recap.userMessages.join(" ").slice(0, 700)}
                {recap.userMessages.join(" ").length > 700 ? "..." : ""}
              </p>
            ) : (
              <p>
                You didn't give {who} an explanation yet.
              </p>
            )}
          </div>

          {FEATURES.mirrorMode && recap.userMessages.length > 0 && (
            <section className="recap-card mirror-card">
              <div className="recap-head">
                <div className="recap-icon">🪞</div>
                <h2>Now check {activeCharacter.obj === "her" ? "her" : "his"} work</h2>
              </div>

              {!mirror ? (
                <>
                  <p className="mirror-blurb">
                    {who} retells your lesson — with a couple of things
                    deliberately wrong. Catch them.
                  </p>

                  <button
                    className="mirror-button"
                    onClick={startMirror}
                    disabled={isBuildingMirror}
                  >
                    {isBuildingMirror
                      ? "Getting the story straight…"
                      : "🪞 Let's hear it →"}
                  </button>

                  {mirrorError && (
                    <p className="error-message">{mirrorError}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="mirror-intro">“{mirror.intro}”</p>

                  <p className="mirror-instructions">
                    {mirrorSubmitted
                      ? "Here's how you did:"
                      : `Flag every claim you think is wrong, then lock it in. (${
                          mirror.claims.filter((c) => c.isWrong).length
                        } of them are.)`}
                  </p>

                  <ol className="mirror-claims">
                    {mirror.claims.map((claim) => {
                      const flagged = mirrorFlags.has(claim.id);

                      let outcome = "";

                      if (mirrorSubmitted) {
                        if (claim.isWrong && flagged) outcome = "caught";
                        else if (claim.isWrong && !flagged) outcome = "missed";
                        else if (!claim.isWrong && flagged) outcome = "false-flag";
                        else outcome = "clean";
                      }

                      return (
                        <li key={claim.id}>
                          <button
                            className={`mirror-claim ${
                              flagged ? "flagged" : ""
                            } ${outcome}`}
                            onClick={() => toggleMirrorFlag(claim.id)}
                            disabled={mirrorSubmitted}
                          >
                            <span className="mirror-claim-text">
                              {claim.text}
                            </span>

                            {!mirrorSubmitted && flagged && (
                              <span className="mirror-flag-mark">
                                ⚑ that's wrong
                              </span>
                            )}

                            {mirrorSubmitted && outcome === "caught" && (
                              <span className="mirror-verdict caught">
                                ✓ caught it
                              </span>
                            )}
                            {mirrorSubmitted && outcome === "missed" && (
                              <span className="mirror-verdict missed">
                                ✗ this one was wrong — you let it through
                              </span>
                            )}
                            {mirrorSubmitted && outcome === "false-flag" && (
                              <span className="mirror-verdict false-flag">
                                ○ this one was actually fine
                              </span>
                            )}
                          </button>

                          {mirrorSubmitted && claim.why && (
                            <p className="mirror-why">{claim.why}</p>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {!mirrorSubmitted ? (
                    <button
                      className="mirror-button"
                      onClick={() => setMirrorSubmitted(true)}
                      disabled={mirrorFlags.size === 0}
                    >
                      Lock it in →
                    </button>
                  ) : (
                    <p className="mirror-score">
                      {(() => {
                        const wrong = mirror.claims.filter((c) => c.isWrong);
                        const caught = wrong.filter((c) =>
                          mirrorFlags.has(c.id)
                        ).length;
                        const falseFlags = mirror.claims.filter(
                          (c) => !c.isWrong && mirrorFlags.has(c.id)
                        ).length;

                        return `You caught ${caught} of ${wrong.length}${
                          falseFlags === 0
                            ? " — and didn't flag anything that was fine."
                            : ` — but flagged ${falseFlags} that ${
                                falseFlags === 1 ? "was" : "were"
                              } actually fine.`
                        }`;
                      })()}
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {FEATURES.teachOff && !teachoff && lessonXp?.score != null && (
            <section className="recap-card teachoff-card">
              <div className="recap-head">
                <div className="recap-icon">⚔️</div>
                <h2>Think someone can beat that?</h2>
              </div>

              <p className="teachoff-blurb">
                They teach the exact same lesson, {who} grades them the same
                way, one board settles it.
              </p>

              <div className="teachoff-form">
                <input
                  className="teachoff-input"
                  value={teachoffName}
                  onChange={(event) => setTeachoffName(event.target.value)}
                  placeholder="Your name"
                  maxLength={24}
                />

                <button
                  className="teachoff-button"
                  onClick={startTeachoff}
                  disabled={!teachoffName.trim()}
                >
                  ⚔️ Start a Teach-Off
                </button>
              </div>
            </section>
          )}

          {FEATURES.teachOff && teachoff && (
            <section className="recap-card teachoff-card">
              <div className="recap-head">
                <div className="recap-icon">⚔️</div>
                <h2>This Teach-Off</h2>
              </div>

              <p className="teachoff-code-line">
                Next teacher joins with code{" "}
                <strong className="teachoff-code">{teachoff.code}</strong> on
                the start page — same lesson, same judge.
              </p>

              {teachoffBoard && teachoffBoard.length > 1 ? (
                <ol className="teachoff-board">
                  {teachoffBoard.map((run, index) => (
                    <li
                      key={`${run.player}-${run.at}`}
                      className={
                        run.player === teachoff.player ? "current-player" : ""
                      }
                    >
                      <span className="board-rank">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                      </span>
                      <span className="board-player">{run.player}</span>
                      <span className="board-score">{run.score}</span>
                      {run.understoodCount !== null && (
                        <span className="board-detail">
                          {run.understoodCount}/{run.totalPoints} understood
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="teachoff-first">
                  You're first on the board. Hand someone the mic.
                </p>
              )}
            </section>
          )}

          {FEATURES.weaknessTraining && recap.userMessages.length > 0 && (
            <div className="challenge-entry">
              <button
                className="challenge-button"
                onClick={takeChallenge}
                disabled={isBuildingChallenge}
              >
                {isBuildingChallenge
                  ? "Working out what to target…"
                  : "🎯 Take the challenge →"}
              </button>

              {challengeError && (
                <p className="error-message">{challengeError}</p>
              )}
            </div>
          )}

          <button
            className="new-lesson-button"
            onClick={() => {
              setShowRecap(false);
              setSelectedTopic(null);
              setMessages([]);
              setError("");
              setAiGrade(null);
              setTopicInput("");
              setLessonError("");
              resetRecall();
              resetChallenge();
      resetChallengeCards();
      resetAmbush();
      resetTeachoff();
      resetMirror();
      resetMood();
      resetJury();
      setConfidence(null);
      resetProgression();
            }}      >
            ← Teach something else
          </button>
        </section>
      </main>
    );
  }
  return (
    <main className="app">
      <section className="session">
        <button
          className="back-button"
          onClick={async () => {
            if (isConnected) {
              await stopConversation();
            }

            setSelectedTopic(null);
            setTopicInput("");
            setLessonError("");
            resetRecall();
      resetChallenge();
      resetChallengeCards();
      resetAmbush();
      resetProgression();
      resetTeachoff();
      resetMirror();
          }}
        >
          ← Teach something else
        </button>

        <div className="session-header">
          <div>
            <div className="eyebrow">
              YOUR LESSON
              {selectedTopic.difficulty && (
                <span className="difficulty-tag">
                  {selectedTopic.difficulty}
                </span>
              )}
              {FEATURES.characterPicker && (
                <span className="difficulty-tag">
                  {activeCharacter.role} · {activeCharacter.difficulty}
                </span>
              )}
            </div>

            <h1>{selectedTopic.name}</h1>

            <p>{selectedTopic.description}</p>

            {FEATURES.topicAnalysis && selectedTopic.analysis && (
              <div className="topic-analysis">
                <div className="analysis-meter">
                  <span className="analysis-label">Concept density</span>
                  <span className="meter-dots">
                    {["Low", "Medium", "High"].map((level, i) => (
                      <span
                        key={level}
                        className={`meter-dot ${
                          ["Low", "Medium", "High"].indexOf(
                            selectedTopic.analysis.conceptDensity
                          ) >= i
                            ? "filled"
                            : ""
                        }`}
                      />
                    ))}
                  </span>
                </div>

                <div className="analysis-meter">
                  <span className="analysis-label">Prerequisites</span>
                  <span className="meter-dots">
                    {["Low", "Medium", "High"].map((level, i) => (
                      <span
                        key={level}
                        className={`meter-dot ${
                          ["Low", "Medium", "High"].indexOf(
                            selectedTopic.analysis.prerequisites
                          ) >= i
                            ? "filled"
                            : ""
                        }`}
                      />
                    ))}
                  </span>
                </div>

                {selectedTopic.analysis.prerequisiteNotes.length > 0 && (
                  <div className="prereq-chips">
                    {selectedTopic.analysis.prerequisiteNotes.map((note) => (
                      <span className="prereq-chip" key={note}>
                        {note}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {FEATURES.weaknessTraining && challenge && (
          <div className="challenge-banner">
            <div className="challenge-banner-title">
              🎯 {challenge.challengeTitle}
            </div>

            <p className="challenge-diagnosis">{challenge.diagnosis}</p>
            <p className="challenge-instruction">{challenge.instruction}</p>
          </div>
        )}

        {FEATURES.voiceOnly && (
          <button
            className="voice-only-toggle"
            onClick={() => setVoiceOnly((v) => !v)}
          >
            {voiceOnlyActive ? "🗒️ Show the panels" : "🎙️ Voice only"}
          </button>
        )}

        <div className={`session-layout ${voiceOnlyActive ? "voice-only" : ""}`}>
          <aside className="character-rail">
            <div
              className={`grandma-character ${
                activeCharacter.image ? "" : "glyph-character"
              } ${conversation.isSpeaking && !paused ? "speaking" : ""} ${
                paused ? "state-resting" : `state-${channel}`
              } ${FEATURES.characterMood && !paused ? `mood-${mood}` : ""}`}
            >
              <span className="mood-shell" key={mood}>
                {activeCharacter.image ? (
                  <span className="mouth-stack">
                    <img src={activeCharacter.image} alt={who} />
                    {FEATURES.characterMouth && activeCharacter.talkImage && (
                      <img
                        className="mouth-open"
                        src={activeCharacter.talkImage}
                        alt=""
                        aria-hidden="true"
                        style={{ opacity: mouthOpen }}
                      />
                    )}
                  </span>
                ) : (
                  <span
                    className="glyph-face"
                    style={{ background: activeCharacter.color }}
                  >
                    {activeCharacter.glyph}
                  </span>
                )}
              </span>
            </div>

            <div className="rail-name">{who}</div>

            {isConnected && (
              <div className={`rail-activity state-${paused ? "resting" : channel}`}>
                <span className="activity-dot" />
                {paused
                  ? "waiting for you"
                  : channel === "speaking"
                    ? `${who} is speaking`
                    : channel === "thinking"
                      ? `${who} is thinking`
                      : `${who} is listening`}
              </div>
            )}

            {FEATURES.characterMood &&
              isConnected &&
              !paused &&
              MOOD_LABEL[mood] && (
                <div className={`rail-mood mood-${mood}`}>
                  {MOOD_LABEL[mood]}
                </div>
              )}

          </aside>

          <section className="conversation">
            <div>
              {voiceOnlyActive ? (
                /* Pure conversation: everything still records and grades
                   exactly as normal — only the rendering is hidden. The
                   finish button must live here, because the usual one
                   sits inside the panel this mode removes. */
                <div className="voice-only-stage">
                  <p className="voice-only-line">
                    Just talk. {who} will tell you what {subj} understood
                    at the end.
                  </p>

                  {messages.some(
                    (m) => m.source === "user" && m.meta !== "prompt"
                  ) && (
                    <button
                      className="finish-button"
                      onClick={finishLesson}
                    >
                      Finish lesson →
                    </button>
                  )}
                </div>
              ) : (
              <div className="transcript">
                {messages.length === 0 && (
                  <div className="transcript-message grandma-message">
                    <div className="speaker">{whoUpper}</div>

                    <p>
                      {who} is ready. Press the microphone and start
                      teaching {obj} about {selectedTopic.name}.
                    </p>
                  </div>
                )}

                {messages.map((message, index) => {
                  if (message.source === "system") {
                    return (
                      <div
                        className="system-message"
                        key={`${index}-${message.message}`}
                      >
                        {message.message}
                      </div>
                    );
                  }

                  const role =
                    message.source === "user"
                      ? (you?.name ?? "YOU").toUpperCase()
                      : whoUpper;

                  const isStudent = message.source === "user";

                  return (
                    <div
                      className={`transcript-message ${isStudent
                        ? "user-message"
                        : "grandma-message"
                        }`}
                      key={`${index}-${message.message}`}
                    >
                      <div className="speaker">
                        {isStudent && you && (
                          <img
                            className="speaker-face"
                            src={you.src}
                            alt=""
                          />
                        )}
                        {role}
                      </div>
                      <p>{message.message}</p>
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
              )}
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </div>

            <div className="mic-area">
              {FEATURES.confidenceGap &&
                confidence === null &&
                messages.length === 0 && (
                  <div className="confidence-ask">
                    <div className="confidence-question">
                      Before you start — how well do you think you know{" "}
                      {selectedTopic.name}?
                    </div>

                    <div className="confidence-options">
                      {[
                        [30, "😕", "Shaky"],
                        [60, "🙂", "Pretty well"],
                        [90, "😎", "I could teach it"],
                      ].map(([value, icon, label]) => (
                        <button
                          key={value}
                          className="confidence-option"
                          onClick={() => setConfidence(value)}
                        >
                          <span className="confidence-icon">{icon}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {!isConnected ? (
                <>
                  <button
                    className="mic-button"
                    onClick={startConversation}
                    disabled={conversation.status === "connecting"}
                  >
                    🎙️
                  </button>

                  <p>
                    {conversation.status === "connecting"
                      ? `Connecting to ${who}...`
                      : "Press the microphone and start explaining."}
                  </p>
                </>
              ) : (
                <>
                  <div className="mic-controls">
                    <button
                      className={`mic-button ${
                        conversation.isMuted ? "muted" : "active"
                      }`}
                      onClick={() => {
                        if (paused) {
                          togglePause();
                          return;
                        }

                        conversation.setMuted(!conversation.isMuted);
                      }}
                      title={
                        conversation.isMuted
                          ? "Unmute your microphone"
                          : "Mute your microphone"
                      }
                    >
                      {conversation.isMuted ? "🔇" : "🎙️"}
                    </button>

                    <button
                      className={`pause-button ${paused ? "resting" : ""}`}
                      onClick={togglePause}
                      title={
                        paused
                          ? `Carry on — ${who} starts listening again`
                          : `Take a moment. ${who} waits, and won't ask if you're still there`
                      }
                    >
                      {paused ? "▶︎ I'm ready" : "🤔 Let me think"}
                    </button>

                    <button
                      className="end-call-button"
                      onClick={stopConversation}
                      title="End the conversation"
                    >
                      ⏹️ End conversation
                    </button>
                  </div>

                  {/* Asking her out loud is optional — the written version on
                      the recap does not depend on it. */}
                  {FEATURES.spokenRecall && (
                    <button
                      className="recall-button"
                      onClick={askGrandmaToRecall}
                      disabled={askedForRecall}
                      title="She'll say back what she thinks she understood"
                    >
                      {askedForRecall
                        ? `${activeCharacter.glyph} Asked — listen to what ${subj} got`
                        : `${activeCharacter.glyph} Ask ${who} what ${subj} understood`}
                    </button>
                  )}

                  <p>
                    {paused
                      ? `🤔 Take your time — ${who} is waiting quietly.`
                      : conversation.isMuted
                      ? `🔇 Microphone muted — ${who} can't hear you.`
                      : conversation.isSpeaking
                        ? `🔊 ${who} is speaking...`
                        : lastSpeakerWasStudent
                          ? `💭 ${who} is thinking...`
                          : conversation.isListening
                            ? `🎙️ ${who} is listening...`
                            : `🎙️ Start teaching ${who}...`}
                  </p>
                </>
              )}
            </div>
          </section>

          {!voiceOnlyActive && (
          <aside className="progress">
            <div className="progress-title">
              POINTS MENTIONED
            </div>

            <div className="progress-count">
              {completedCount} / {totalCount}
            </div>
            <div className="journey">
              <div className="journey-line" />

              {selectedTopic.points.map((point, index) => (
                <div
                  key={point}
                  className={`journey-stone ${
                    progress[index] ? "reached" : ""
                  }`}
                  style={{
                    left: `${((index + 1) / (totalCount + 1)) * 100}%`,
                  }}
                  title={point}
                >
                  {index + 1}
                </div>
              ))}

              <div
                className="journey-walker"
                style={{
                  left: `${
                    ((progress.lastIndexOf(true) + 1) / (totalCount + 1)) * 100
                  }%`,
                }}
              >
                <span
                  className="journey-hop"
                  key={`${completedCount}-${progress.lastIndexOf(true)}`}
                >
                  {activeCharacter.image ? (
                    <img src={activeCharacter.image} alt={who} />
                  ) : (
                    <span
                      className="journey-glyph"
                      style={{ background: activeCharacter.color }}
                    >
                      {activeCharacter.glyph}
                    </span>
                  )}
                </span>
              </div>
            </div>
            {selectedTopic.points.map((point, index) => {
              const completed = progress[index];

              return (
                <div
                  className={`progress-item ${completed ? "completed" : ""
                    }`}
                  key={point}
                >
                  <span className="progress-circle">
                    {completed ? "✓" : "○"}
                  </span>

                  <span>{point}</span>

                  {FEATURES.difficultyPrediction &&
                    selectedTopic.predictions?.[index]?.hardFor === "hard" && (
                      <span
                        className="predict-flag"
                        title={selectedTopic.predictions[index].hardWhy}
                      >
                        tricky
                      </span>
                    )}
                </div>
              );
            })}

            {FEATURES.weaknessTraining && challenge?.bannedTerms?.length > 0 && (
              <div className="banned-terms-panel">
                <div className="banned-terms-title">DON'T SAY</div>

                <div className="banned-chips">
                  {challenge.bannedTerms.map((term) => (
                    <span
                      key={term}
                      className={`banned-chip ${
                        bannedHits.has(term) ? "hit" : ""
                      }`}
                    >
                      {term}
                    </span>
                  ))}
                </div>

                {bannedHits.size > 0 && (
                  <p className="banned-hint">
                    {bannedHits.size} slipped through — that's fine, keep
                    going.
                  </p>
                )}
              </div>
            )}

            {FEATURES.challengeCards && selectedTopic.challenges.length > 0 && (
              <div className="challenge-deck">
                <div className="challenge-deck-title">
                  CHALLENGE {obj.toUpperCase()}
                </div>

                <div className="challenge-chips">
                  {selectedTopic.challenges.map((card) => {
                    const used = usedChallengeIds.includes(card.id);

                    return (
                      <button
                        key={card.id}
                        className={`challenge-chip ${used ? "used" : ""}`}
                        onClick={() => sendChallengeCard(card)}
                        disabled={used || !isConnected}
                        title={card.instruction}
                      >
                        {card.label}
                      </button>
                    );
                  })}
                </div>

                {challengeSentNotice && (
                  <p className="challenge-sent-notice">{challengeSentNotice}</p>
                )}
              </div>
            )}

            {FEATURES.misconceptionAttack &&
              selectedTopic.misconceptions.length > 0 && (
                <details className="misconceptions-panel">
                  <summary className="misconceptions-title">
                    WHAT BEGINNERS USUALLY GET WRONG (
                    {selectedTopic.misconceptions.length})
                  </summary>

                  <ul className="misconceptions-list">
                    {selectedTopic.misconceptions.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </details>
              )}

            {/* The celebration is for full coverage, but the way out of the
                lesson is not — an explanation that misses a keyword must
                still be able to reach the notes. */}
            <div className="completion-area">
              {completedCount === totalCount && (
                <>
                  <div className="completion-badge">
                    ✓
                  </div>

                  <div className="complete-message">
                    <strong>You covered all four points.</strong>
                    <span>
                      But did {who} actually follow it? Finish the lesson
                      and she'll tell you.
                    </span>
                  </div>
                </>
              )}

              {messages.length > 0 && (
                <button
                  className="finish-button"
                  onClick={finishLesson}
                >
                  See {who}'s Notes →
                </button>
              )}
            </div>
          </aside>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
