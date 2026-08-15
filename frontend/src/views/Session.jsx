import { FEATURES } from "../features";
import { MOOD_LABEL } from "../mood";

// The live lesson. Everything here is driven by App: the ElevenLabs
// conversation object, the transcript, the coverage the keyword pass
// computes, and every control that acts on the call.
export function Session({
  activeCharacter,
  askGrandmaToRecall,
  askedForRecall,
  bannedHits,
  challenge,
  challengeSentNotice,
  channel,
  completedCount,
  confidence,
  conversation,
  error,
  finishLesson,
  isConnected,
  lastSpeakerWasStudent,
  messages,
  mood,
  mouthOpen,
  paused,
  progress,
  resetAmbush,
  resetChallenge,
  resetChallengeCards,
  resetMirror,
  resetProgression,
  resetRecall,
  resetTeachoff,
  selectedTopic,
  sendChallengeCard,
  setConfidence,
  setLessonError,
  setSelectedTopic,
  setTopicInput,
  setVoiceOnly,
  startConversation,
  stopConversation,
  sv,
  togglePause,
  totalCount,
  transcriptEndRef,
  tt,
  uiLang,
  usedChallengeIds,
  voiceOnlyActive,
  who,
  whoUpper,
  you,
}) {
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
