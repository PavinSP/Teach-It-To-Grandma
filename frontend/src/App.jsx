import { useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { FEATURES } from "./features";
import "./App.css";

const AGENT_ID = "agent_8901kzzhzexhe2qt3903amp09nnq";

const GRADING_API = import.meta.env.VITE_GRADING_API || "http://localhost:3001";

// Starting points, not limits — any topic can be typed in.
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
    misconceptions: generated.misconceptions ?? [],
    analysis: generated.analysis ?? null,
    challenges: generated.challenges ?? [],
  };
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
function generateRecap(topic, progress, messages) {
  const grandmaMessages = messages
    .filter((message) => message.source !== "user")
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
      "You explained all the key ideas clearly enough for Grandma to follow. Well done, darling!";
  } else if (completedPoints.length >= 2) {
    verdict =
      "You're getting there, darling. Grandma understood several important ideas, but a few parts could be clearer.";
  } else {
    verdict =
      "That's a good start, darling. A few important ideas still need a little more explaining.";
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
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [showRecap, setShowRecap] = useState(false);
  const [aiGrade, setAiGrade] = useState(null);
  const [isGrading, setIsGrading] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [isBuildingLesson, setIsBuildingLesson] = useState(false);
  const [lessonError, setLessonError] = useState("");
  const [explainBack, setExplainBack] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [recallText, setRecallText] = useState("");
  const [askedForRecall, setAskedForRecall] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [isBuildingChallenge, setIsBuildingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [usedChallengeIds, setUsedChallengeIds] = useState([]);
  const [challengeSentNotice, setChallengeSentNotice] = useState("");
  const transcriptEndRef = useRef(null);
  // Her next reply after we ask is the recall itself — catch it as it lands.
  const pendingRecallRef = useRef(false);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to Grandma");
      setError("");
    },

    onDisconnect: () => {
      console.log("Disconnected from Grandma");
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

      setMessages((previous) => [
        ...previous,
        message,
      ]);
    },

    onError: (message) => {
      console.error("ElevenLabs error:", message);
      setError("Something went wrong connecting to Grandma.");
    },
  });

  // Everything the explain-back feature accumulates. Cleared wherever a
  // lesson ends, so the next one never inherits the last one's recall.
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

  const startConversation = async () => {
    try {
      setError("");
      setMessages([]);

      await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      await conversation.startSession({
        agentId: AGENT_ID,
        dynamicVariables: {
          topic: selectedTopic.name,
          topicDescription: selectedTopic.description,
        },
      });
    } catch (err) {
      console.error("Could not start conversation:", err);

      setError(
        "Could not start the microphone or connect to Grandma."
      );
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
          transcript: messages.filter((m) => m.meta !== "prompt"),
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
          transcript: messages.filter((m) => m.meta !== "prompt"),
          // If she already said it out loud, analyse those exact words.
          grandmaRecall: recallText || undefined,
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
      "Grandma, before I go — can you tell me back what you understood, in your own words?";

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
    if (!isConnected || usedChallengeIds.includes(card.id)) {
      return;
    }

    conversation.sendContextualUpdate(
      `The student has accepted a challenge. On your next turn, ask them this in your own words, in one short sentence, without explaining why you are asking: ${card.instruction}`
    );

    setUsedChallengeIds((previous) => [...previous, card.id]);
    setChallengeSentNotice("Challenge sent — Grandma will ask you next.");
    setTimeout(() => setChallengeSentNotice(""), 6000);
  };

  // Diagnoses the one weakness that actually showed up, then sends the
  // student back into the same lesson to fix specifically that. For a
  // jargon diagnosis, the banned words get enforced live in the sidebar.
  const takeChallenge = async () => {
    if (isBuildingChallenge) {
      return;
    }

    const priorTranscript = messages.filter((m) => m.meta !== "prompt");
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

      // Back into the same lesson, clean, for the re-run.
      setShowRecap(false);
      setMessages([]);
      setAiGrade(null);
      resetRecall();
    } catch (err) {
      console.error("Could not build challenge:", err);
      setChallengeError("Could not put together a challenge right now.");
    } finally {
      setIsBuildingChallenge(false);
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
        body: JSON.stringify({ topic: wanted }),
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

          <h2>What do you want to teach?</h2>

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
              Working out what Grandma would need to hear…
            </p>
          )}

          {lessonError && (
            <p className="error-message topic-error">{lessonError}</p>
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
        </section>
      </main>
    );
  }

  const isConnected = conversation.status === "connected";

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
    messages
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
          <div className="eyebrow">GRANDMA'S NOTES</div>

          <h1>
            {gotEverythingAcross
              ? "Well done, darling."
              : "Let's go over that again, darling."}
          </h1>

          <p className="recap-subtitle">
            Here's what Grandma understood from your lesson on{" "}
            <strong>{selectedTopic.name}</strong>.
          </p>

          <div className="grandma-verdict">
            <div className="grandma-verdict-avatar">👵</div>

            <div>
              <div className="grandma-verdict-label">
                GRANDMA SAYS
              </div>

              <p>{aiGrade?.summary || recap.verdict}</p>

              {isGrading && (
                <p className="grading-status">
                  Grandma is thinking it over…
                </p>
              )}
            </div>
          </div>

          {aiGrade?.results && (
            <section className="recap-card ai-grade-card">
              <div className="recap-icon">🧠</div>

              <h2>Did Grandma really understand?</h2>

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

          {FEATURES.explainBack && isExplaining && !explainBack && (
            <section className="recap-card">
              <div className="recap-icon">🔄</div>
              <h2>Let me see if I understood you</h2>
              <p className="recap-pending">
                Grandma is working out what she actually took away…
              </p>
            </section>
          )}

          {FEATURES.explainBack && explainBack && (
            <section className="recap-card explainback-card">
              <div className="recap-icon">🔄</div>

              <h2>Let me see if I understood you</h2>

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
                    <span className="gap-label">Grandma followed</span>
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
                    ? "What Grandma said out loud"
                    : "What Grandma took away"}
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

          <div className="recap-grid">
            <section className="recap-card">
              <div className="recap-icon">✓</div>

              <h2>What Grandma followed</h2>

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
              <div className="recap-icon">💡</div>

              <h2>What to improve</h2>

              {unclearPoints.length > 0 ? (
                <ul>
                  {unclearPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Grandma followed every point. That's the whole idea.
                </p>
              )}
            </section>
          </div>

          <div className="recap-card conversation-summary">
            <div className="recap-icon">👵</div>

            <h2>Where Grandma needed help</h2>

            {recap.clarificationMessages.length > 0 ? (
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
                Grandma didn't have any major questions about
                your explanation.
              </p>
            )}
          </div>
          <div className="recap-card">
            <div className="recap-icon">💬</div>

            <h2>Your explanation</h2>

            {recap.userMessages.length > 0 ? (
              <p>
                {recap.userMessages.join(" ").slice(0, 700)}
                {recap.userMessages.join(" ").length > 700 ? "..." : ""}
              </p>
            ) : (
              <p>
                You didn't give Grandma an explanation yet.
              </p>
            )}
          </div>

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

          <div className="grandma-wrapper">
            <div
              className={`grandma-character ${conversation.isSpeaking ? "speaking" : ""
                }`}
            >
              <img
                src="/grandma.png"
                alt="Grandma"
              />
            </div>

            <div
              className={`speaking-indicator ${conversation.isSpeaking ? "visible" : ""
                }`}
            >
              <span className="speaking-dot" />
              Grandma is speaking
            </div>
            <div
              className={`listening-indicator ${conversation.isListening && !conversation.isSpeaking
                ? "visible"
                : ""
                }`}
            >
              <span className="listening-dot" />
              Grandma is listening
            </div>
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

        <div className="session-layout">
          <section className="conversation">
            <div>
              <div className="transcript">
                {messages.length === 0 && (
                  <div className="transcript-message grandma-message">
                    <div className="speaker">GRANDMA</div>

                    <p>
                      Oh hello, darling! I see you want to teach me about{" "}
                      {selectedTopic.name}. Go on then, tell Grandma all
                      about it!
                    </p>
                  </div>
                )}

                {messages.map((message, index) => {
                  const role =
                    message.source === "user"
                      ? "YOU"
                      : "GRANDMA";

                  return (
                    <div
                      className={`transcript-message ${role === "YOU"
                        ? "user-message"
                        : "grandma-message"
                        }`}
                      key={`${index}-${message.message}`}
                    >
                      <div className="speaker">{role}</div>
                      <p>{message.message}</p>
                    </div>
                  );
                })}
                <div ref={transcriptEndRef} />
              </div>
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </div>

            <div className="mic-area">
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
                      ? "Connecting to Grandma..."
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
                      onClick={() =>
                        conversation.setMuted(!conversation.isMuted)
                      }
                      title={
                        conversation.isMuted
                          ? "Unmute your microphone"
                          : "Mute your microphone"
                      }
                    >
                      {conversation.isMuted ? "🔇" : "🎙️"}
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
                        ? "👵 Asked — listen to what she got"
                        : "👵 Ask Grandma what she understood"}
                    </button>
                  )}

                  <p>
                    {conversation.isMuted
                      ? "🔇 Microphone muted — Grandma can't hear you."
                      : conversation.isSpeaking
                        ? "🔊 Grandma is speaking..."
                        : conversation.isListening
                          ? "🎙️ Grandma is listening..."
                          : "🎙️ Start teaching Grandma..."}
                  </p>
                </>
              )}
            </div>
          </section>

          <aside className="progress">
            <div className="progress-title">
              POINTS MENTIONED
            </div>

            <div className="progress-count">
              {completedCount} / {totalCount}
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${(completedCount / totalCount) * 100}%`,
                }}
              />
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
                <div className="challenge-deck-title">CHALLENGE HER</div>

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
                <div className="misconceptions-panel">
                  <div className="misconceptions-title">
                    WHAT BEGINNERS USUALLY GET WRONG
                  </div>

                  <ul className="misconceptions-list">
                    {selectedTopic.misconceptions.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
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
                      But did Grandma actually follow it? Finish the lesson
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
                  See Grandma's Notes →
                </button>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
