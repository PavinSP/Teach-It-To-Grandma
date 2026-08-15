import { useEffect, useRef, useState } from "react";
import {
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import { FEATURES } from "./features";
import { MOODS, MOOD_LABEL, guessMood, channelState } from "./mood";
import {
  feynmanScore,
  xpForLesson,
  loadProfile,
  commitLessonXp,
  evaluateAchievements,
} from "./progression";
import { CHARACTERS, buildPersonaPrompt, DIRECTOR } from "./characters";
import { loadSnapshot, saveSnapshot } from "./snapshot";

import { t, speakerVars } from "./strings";
import { YOU_OPTIONS, DEFAULT_PARAMS, loadYou, saveYou } from "./you";
import { Landing } from "./views/Landing";
import { Recap } from "./views/Recap";
import "./App.css";

const AGENT_ID = "agent_8901kzzhzexhe2qt3903amp09nnq";

// Dev talks to the server on its own port. A deployed build reads
// VITE_GRADING_API, which the frontend's Vercel project sets to the API
// project's URL — the two halves deploy separately so each gets Vercel's
// zero-config detection, Vite on one side and Express on the other.
//
// `??` rather than `||` on purpose: an explicitly empty value means "same
// origin", which is what a single-domain setup would want, and `||` would
// silently discard it and fall back to localhost in production.
const GRADING_API =
  import.meta.env.VITE_GRADING_API ??
  (import.meta.env.DEV ? "http://localhost:3001" : "");



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

// The listener stopping to ask what something MEANT or HOW it worked — the
// signal that friction, not curiosity, interrupted the lesson. This feeds 15%
// of the Feynman score, so it stays a deterministic list an engineer can point
// at rather than something a model decides.
//
// Kept deliberately narrow. "And who turns all these dials?" is interest, and
// counting ordinary curiosity would punish a lesson that was going well. Only
// phrasings that mean "that did not land" belong here.
//
// The German half is not optional. Without it a German lesson could never
// register friction at all, which quietly handed every German run up to 15
// free points and made Teach-Off scores incomparable across languages.
const CLARIFICATION_PATTERNS = [
  // English — asking for a meaning or a mechanism
  /what exactly/,
  /what does/,
  /what do you mean/,
  /what kind of/,
  /how does/,
  /why does/,
  /can you explain/,
  /could you explain/,
  // English — saying plainly that it did not land
  /what on earth is/,
  /what in the world is/,
  /i don'?t understand/,
  /i'?m lost/,
  /you(?:'ve| have)? lost me/,
  /slow down/,

  // German — asking for a meaning or a mechanism
  /was bedeutet/,
  /was hei(?:ß|ss)t/,
  /was meinst du/,
  /was meinen sie/,
  /wie funktioniert/,
  /was f(?:ü|ue)r ein/,
  /kannst du (?:das |mir |mir das )?erkl(?:ä|ae)ren/,
  /k(?:ö|oe)nnen sie (?:das |mir |mir das )?erkl(?:ä|ae)ren/,
  // German — saying plainly that it did not land
  /ich verstehe (?:das )?nicht/,
  /ich bin verwirrt/,
  /langsamer/,
];

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

    return CLARIFICATION_PATTERNS.some((pattern) => pattern.test(text));
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
  const [language, setLanguage] = useState(snap?.language ?? "en");
  // 0 = mouth closed, 1 = open. Driven by her real output volume.
  const [mouthOpen, setMouthOpen] = useState(0);
  // What the student predicted before teaching, 0-100, or null if they
  // skipped the question. Snapshotted so a refresh keeps the comparison.
  const [confidence, setConfidence] = useState(snap?.confidence ?? null);
  const [jury, setJury] = useState(snap?.jury ?? null);
  const [isConvening, setIsConvening] = useState(false);
  const [juryError, setJuryError] = useState("");
  const [openJuror, setOpenJuror] = useState(null);
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
  // onDisconnect fires from a closure created at mount; these keep it
  // reading the current character and language rather than the first ones.
  const whoRef = useRef("Grandma");
  const uiLangRef = useRef("en");
  // Her next reply after we ask is the recall itself — catch it as it lands.
  const pendingRecallRef = useRef(false);
  // One lesson attempt = one XP award. The id is minted once per attempt
  // (double-clicking Finish must not mint twice), and the commit effect
  // refuses to run for an id it has already paid out.
  const lessonIdRef = useRef(snap?.lessonId ?? null);
  const committedRef = useRef(snap?.committedId ?? null);
  // When the mic first opened for this attempt — Speed Teacher's clock.
  const sessionStartedAtRef = useRef(snap?.sessionStartedAt ?? null);
  const [lessonDurationMs, setLessonDurationMs] = useState(
    snap?.lessonDurationMs ?? null
  );
  const [replayCopied, setReplayCopied] = useState(false);

  // With the picker off, every derived name resolves to Grandma and the app
  // reads exactly as it did before characters existed.
  const activeCharacter = FEATURES.characterPicker ? character : CHARACTERS[0];
  const who = activeCharacter.shortName;
  const whoUpper = who.toUpperCase();
  const subj = activeCharacter.subj;
  const obj = activeCharacter.obj;
  const voiceOnlyActive = FEATURES.voiceOnly && voiceOnly;

  // Deduplicated, single words first (multi-word phrases help ASR least),
  // capped because the boost list is a hint, not a dictionary.
  const asrKeywords = (() => {
    if (!selectedTopic) {
      return [];
    }

    const seen = new Set();
    const words = [];

    for (const term of [
      selectedTopic.name,
      ...(selectedTopic.checks ?? []).flatMap((c) => c.keywords ?? []),
    ]) {
      const clean = String(term ?? "").trim();
      const key = clean.toLowerCase();

      if (clean && !seen.has(key)) {
        seen.add(key);
        words.push(clean);
      }
    }

    return words.slice(0, 25);
  })();
  // The UI speaks whatever the lesson is being taught in — a German
  // conversation captioned in English reads as half-finished.
  const uiLang = FEATURES.multilingual ? language : "en";
  const sv = speakerVars(uiLang, activeCharacter);
  const taglineName =
    uiLang === "de" && activeCharacter.shortName === activeCharacter.role
      ? activeCharacter.roleDe ?? activeCharacter.shortName
      : activeCharacter.shortName;
  const tt = (key, extra) => t(uiLang, key, { ...sv, ...extra });

  whoRef.current = who;
  uiLangRef.current = uiLang;

  useEffect(() => {
    // scrollIntoView walks up the tree and scrolls every scrollable ancestor
    // it needs to, including the page itself. On a phone, where the whole
    // document scrolls, that jerked the entire layout upward on every single
    // message — the header, the character and the controls all moved while
    // someone was mid-sentence. Scrolling the transcript's own box moves the
    // transcript and nothing else.
    const box = transcriptEndRef.current?.parentElement;

    box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
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
      language,
      topicInput,
      confidence,
      jury,
      characterId: character.id,
      lessonId: lessonIdRef.current,
      committedId: committedRef.current,
      sessionStartedAt: sessionStartedAtRef.current,
      lessonDurationMs,
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
    lessonDurationMs,
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

      // "user" is the student hanging up deliberately — silent. Anything
      // else ended without them asking, and saying so beats a dead screen.
      if (details?.reason && details.reason !== "user") {
        setError(t(uiLangRef.current, "dropped", { name: whoRef.current }));
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
    setOpenJuror(null);
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
    // Anything already said means this is a resume, not a fresh start.
    const resuming = messages.some(
      (m) => m.source === "user" && m.meta !== "prompt"
    );

    try {
      setError("");

      if (!resuming) {
        setMessages([]);
      }

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
                // The lesson already knows the technical words that are
                // about to be spoken, and those are exactly the words
                // speech recognition mishears. Feeding them in improves the
                // transcript, which improves both the coverage bar and the
                // grade built on it.
                ...(FEATURES.asrKeywords && asrKeywords.length > 0
                  ? { asr: { keywords: asrKeywords } }
                  : {}),
              },
            }
          : {}),
      });

      // A reconnect is a brand new session to ElevenLabs — she remembers
      // nothing. Our transcript survived, so hand back the gist rather
      // than letting her ask the student to start over.
      if (resuming) {
        const alreadySaid = messages
          .filter((m) => m.source === "user" && m.meta !== "prompt")
          .map((m) => m.message)
          .slice(-4)
          .join(" ");

        if (alreadySaid) {
          conversation.sendContextualUpdate(
            `[note] From now on: the call dropped and has just reconnected. The student already told you this, so do not make them repeat it — carry on from here: "${alreadySaid}"`
          );
        }
      }
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

      setLessonDurationMs(
        sessionStartedAtRef.current
          ? Date.now() - sessionStartedAtRef.current
          : null
      );

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
      <Landing
        character={character}
        isBuildingLesson={isBuildingLesson}
        isJoining={isJoining}
        isSavingYou={isSavingYou}
        joinCode={joinCode}
        joinError={joinError}
        joinTeachoff={joinTeachoff}
        language={language}
        lessonError={lessonError}
        saveYouProfile={saveYouProfile}
        setCharacter={setCharacter}
        setJoinCode={setJoinCode}
        setLanguage={setLanguage}
        setShowYouEditor={setShowYouEditor}
        setTeachoffName={setTeachoffName}
        setTopicInput={setTopicInput}
        setYouDraftName={setYouDraftName}
        setYouDraftParams={setYouDraftParams}
        showYouEditor={showYouEditor}
        startLesson={startLesson}
        stepYouParam={stepYouParam}
        taglineName={taglineName}
        teachoffName={teachoffName}
        topicInput={topicInput}
        tt={tt}
        uiLang={uiLang}
        you={you}
        youDraftName={youDraftName}
        youDraftParams={youDraftParams}
      />
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
    return (
      <Recap
        activeCharacter={activeCharacter}
        aiGrade={aiGrade}
        ambush={ambush}
        challengeError={challengeError}
        confidence={confidence}
        convene={convene}
        displayScore={displayScore}
        explainBack={explainBack}
        isBuildingChallenge={isBuildingChallenge}
        isBuildingMirror={isBuildingMirror}
        isConvening={isConvening}
        isExplaining={isExplaining}
        isGrading={isGrading}
        jury={jury}
        juryError={juryError}
        lessonDurationMs={lessonDurationMs}
        lessonXp={lessonXp}
        mirror={mirror}
        mirrorError={mirrorError}
        mirrorFlags={mirrorFlags}
        mirrorSubmitted={mirrorSubmitted}
        newAchievements={newAchievements}
        openJuror={openJuror}
        profileXp={profileXp}
        progress={progress}
        recallText={recallText}
        recap={recap}
        replayCopied={replayCopied}
        resetAmbush={resetAmbush}
        resetChallenge={resetChallenge}
        resetChallengeCards={resetChallengeCards}
        resetJury={resetJury}
        resetMirror={resetMirror}
        resetMood={resetMood}
        resetProgression={resetProgression}
        resetRecall={resetRecall}
        resetTeachoff={resetTeachoff}
        selectedTopic={selectedTopic}
        setAiGrade={setAiGrade}
        setConfidence={setConfidence}
        setError={setError}
        setLessonError={setLessonError}
        setMessages={setMessages}
        setMirrorSubmitted={setMirrorSubmitted}
        setOpenJuror={setOpenJuror}
        setReplayCopied={setReplayCopied}
        setSelectedTopic={setSelectedTopic}
        setShowRecap={setShowRecap}
        setTeachoffName={setTeachoffName}
        setTopicInput={setTopicInput}
        startMirror={startMirror}
        startTeachoff={startTeachoff}
        subj={subj}
        takeChallenge={takeChallenge}
        teachoff={teachoff}
        teachoffBoard={teachoffBoard}
        teachoffName={teachoffName}
        toggleMirrorFlag={toggleMirrorFlag}
        tt={tt}
        who={who}
        whoUpper={whoUpper}
      />
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
          {tt("teachSomethingElse")}
        </button>

        <div className="session-header">
          <div>
            <div className="eyebrow">
              {tt("yourLesson")}
              {selectedTopic.difficulty && (
                <span className="difficulty-tag">
                  {tt(selectedTopic.difficulty)}
                </span>
              )}
              {FEATURES.characterPicker && (
                <span className="difficulty-tag">
                  {uiLang === "de"
                    ? activeCharacter.roleDe ?? activeCharacter.role
                    : activeCharacter.role}{" "}
                  · {tt(activeCharacter.difficulty)}
                </span>
              )}
            </div>

            <h1>{selectedTopic.name}</h1>

            <p>{selectedTopic.description}</p>

            {FEATURES.topicAnalysis && selectedTopic.analysis && (
              <div className="topic-analysis">
                <div className="analysis-meter">
                  <span className="analysis-label">{tt("conceptDensity")}</span>
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
                  <span className="analysis-label">{tt("prerequisites")}</span>
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
            {voiceOnlyActive ? tt("showPanels") : tt("voiceOnly")}
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
                  ? tt("waiting")
                  : channel === "speaking"
                    ? tt("isSpeaking")
                    : channel === "thinking"
                      ? tt("isThinking")
                      : tt("isListening")}
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
                    {tt("justTalk")}
                  </p>

                  {messages.some(
                    (m) => m.source === "user" && m.meta !== "prompt"
                  ) && (
                    <button
                      className="finish-button"
                      onClick={finishLesson}
                    >
                      {tt("finish")}
                    </button>
                  )}
                </div>
              ) : (
              <div className="transcript">
                {messages.length === 0 && (
                  <div className="transcript-message grandma-message">
                    <div className="speaker">{whoUpper}</div>

                    <p>
                      {tt("ready", { topic: selectedTopic.name })}
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
                      ? (you?.name ?? tt("you")).toUpperCase()
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
                      {tt("confidenceQ", { topic: selectedTopic.name })}
                    </div>

                    <div className="confidence-options">
                      {[
                        [30, "😕", tt("confShaky")],
                        [60, "🙂", tt("confOk")],
                        [90, "😎", tt("confStrong")],
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
                      ? tt("connecting")
                      : tt("pressMic")}
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
                      {paused ? tt("imReady") : tt("letMeThink")}
                    </button>

                    <button
                      className="end-call-button"
                      onClick={stopConversation}
                      title="End the conversation"
                    >
                      {tt("endCall")}
                    </button>
                  </div>

                  {/* Asking her out loud is optional — the written version on
                      the recap does not depend on it. */}
                  {FEATURES.spokenRecall && (
                    <button
                      className="recall-button"
                      onClick={askGrandmaToRecall}
                      disabled={askedForRecall}
                      title={tt("recallHint")}
                    >
                      {askedForRecall ? tt("asked") : tt("askUnderstood")}
                    </button>
                  )}

                  <p>
                    {paused
                      ? tt("restingHint")
                      : conversation.isMuted
                      ? tt("muted")
                      : conversation.isSpeaking
                        ? tt("speaking")
                        : lastSpeakerWasStudent
                          ? tt("thinking")
                          : conversation.isListening
                            ? tt("listening")
                            : tt("startTeaching")}
                  </p>
                </>
              )}
            </div>
          </section>

          {!voiceOnlyActive && (
          <aside className="progress">
            <div className="progress-title">
              {tt("pointsMentioned")}
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
                  // Clamped the way the forensics track is. The walker is
                  // centred on its own position, so an unclamped 0% hangs
                  // half the portrait off the left edge — which is where it
                  // sits for the whole opening of every lesson, and is very
                  // obvious on a narrow screen.
                  left: `${Math.min(
                    Math.max(
                      ((progress.lastIndexOf(true) + 1) / (totalCount + 1)) *
                        100,
                      7
                    ),
                    93
                  )}%`,
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
                <div className="banned-terms-title">{tt("dontSay")}</div>

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
                  {tt("challenge", { themAcc: sv.themAcc.toUpperCase() })}
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
                    {tt("commonWrong")} ({selectedTopic.misconceptions.length})
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
                    <strong>{tt("coveredAll")}</strong>
                    <span>{tt("butDid")}</span>
                  </div>
                </>
              )}

              {messages.length > 0 && (
                <button
                  className="finish-button"
                  onClick={finishLesson}
                >
                  {tt("seeNotes")}
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
