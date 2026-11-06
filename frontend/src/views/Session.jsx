import { useEffect, useState } from "react";
import { FEATURES } from "../features";
import { MOOD_LABEL } from "../mood";
import { JargonDebt } from "../components/JargonDebt";

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
  requestHelp,
  isHelping,
  helpCard,
  dismissHelp,
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  // Opening the transcript lands on the latest line, not the first.
  useEffect(() => {
    if (!transcriptOpen) {
      return;
    }

    const box = transcriptEndRef.current?.parentElement;

    box?.scrollTo({ top: box.scrollHeight, behavior: "instant" });
  }, [transcriptOpen, transcriptEndRef]);

  // The last two things said, shown as captions under the character: the
  // earlier one dim, the latest large. The full transcript is one tap away.
  const spoken = messages.filter(
    (m) => m.source !== "system" && m.meta !== "prompt" && m.message
  );
  const latest = spoken[spoken.length - 1];
  const before = spoken[spoken.length - 2];
  const speakerOf = (m) =>
    m.source === "user" ? (you?.name ?? tt("you")) : who;
  const nextPoint = progress.findIndex((done) => !done);
  // A reference on every chip is noise when all the points come from one place.
  const refsDiffer =
    new Set((selectedTopic.sources ?? []).map((source) => source?.ref)).size > 1;

  const leave = async () => {
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
  };

  const statusLine = paused
    ? tt("restingHint")
    : conversation.isMuted
      ? tt("muted")
      : conversation.isSpeaking
        ? tt("speaking")
        : lastSpeakerWasStudent
          ? tt("thinking")
          : conversation.isListening
            ? tt("listening")
            : tt("startTeaching");

  return (
    <main className="app">
      <section className="session stage-session">
        <div className="stage-bar">
          <button className="stage-back" onClick={leave}>
            {tt("teachSomethingElse")}
          </button>

          <h1 className="stage-title">{selectedTopic.name}</h1>

          {selectedTopic.document && selectedTopic.privacy?.local && (
            <span className="stage-local">
              🔒 {tt("docLocalShort")}
            </span>
          )}

          <span className="stage-spacer" />

          <span className="stage-count">
            {tt("pointsOf", { n: completedCount, total: totalCount })}
          </span>

          {FEATURES.voiceOnly && (
            <button
              className="stage-pill"
              onClick={() => setVoiceOnly((v) => !v)}
            >
              {voiceOnlyActive ? tt("showPanels") : tt("voiceOnly")}
            </button>
          )}

          <button
            className="stage-pill"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {tt("lessonDetails")} {detailsOpen ? "▴" : "▾"}
          </button>
        </div>

        {detailsOpen && (
          <div className="stage-details">
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

            <p className="stage-description">{selectedTopic.description}</p>

            {selectedTopic.document && (
              <p className="document-source">
                <span className="document-file">
                  📄 {tt("docFrom", { file: selectedTopic.document.fileName })}
                </span>
                {selectedTopic.privacy?.local && (
                  <span className="document-local">
                    {tt("docLocal", { model: selectedTopic.privacy.model })}
                  </span>
                )}
                {selectedTopic.document.partial && (
                  <span className="document-note">
                    {tt("docPart", {
                      parts: selectedTopic.document.parts.join(", "),
                      total: selectedTopic.document.totalSections,
                    })}
                  </span>
                )}
                {selectedTopic.document.truncated && (
                  <span className="document-note">
                    {tt("docTruncated", { ref: selectedTopic.document.readUpTo })}
                  </span>
                )}
              </p>
            )}

            {FEATURES.topicAnalysis && selectedTopic.analysis && (
              <div className="topic-analysis">
                {[
                  ["conceptDensity", selectedTopic.analysis.conceptDensity],
                  ["prerequisites", selectedTopic.analysis.prerequisites],
                ].map(([label, value]) => (
                  <div className="analysis-meter" key={label}>
                    <span className="analysis-label">{tt(label)}</span>
                    <span className="meter-dots">
                      {["Low", "Medium", "High"].map((level, i) => (
                        <span
                          key={level}
                          className={`meter-dot ${
                            ["Low", "Medium", "High"].indexOf(value) >= i
                              ? "filled"
                              : ""
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                ))}

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
          </div>
        )}

        {FEATURES.weaknessTraining && challenge && (
          <div className="challenge-banner">
            <div className="challenge-banner-title">
              🎯 {challenge.challengeTitle}
            </div>

            <p className="challenge-diagnosis">{challenge.diagnosis}</p>
            <p className="challenge-instruction">{challenge.instruction}</p>
          </div>
        )}

        {FEATURES.weaknessTraining && challenge?.bannedTerms?.length > 0 && (
          <div className="banned-terms-panel">
            <div className="banned-terms-title">{tt("dontSay")}</div>

            <div className="banned-chips">
              {challenge.bannedTerms.map((term) => (
                <span
                  key={term}
                  className={`banned-chip ${bannedHits.has(term) ? "hit" : ""}`}
                >
                  {term}
                </span>
              ))}
            </div>

            {bannedHits.size > 0 && (
              <p className="banned-hint">
                {tt("bannedSlipped", { count: bannedHits.size })}
              </p>
            )}
          </div>
        )}

        <div className="stage-main">
          <div
            className={`grandma-character stage-character ${
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
              <div className={`rail-mood mood-${mood}`}>{MOOD_LABEL[mood]}</div>
            )}

          {!voiceOnlyActive && (
            <ol className="stage-points" aria-label={tt("pointsMentioned")}>
              {selectedTopic.points.map((point, index) => {
                const done = progress[index];
                const source = selectedTopic.sources?.[index];

                return (
                  <li
                    key={point}
                    className={`stage-point ${done ? "done" : ""} ${
                      index === nextPoint ? "next" : ""
                    }`}
                    title={source?.quote || undefined}
                  >
                    <i>{done ? "✓" : index + 1}</i>
                    <span>{point}</span>
                    {source?.ref && refsDiffer && <small>{source.ref}</small>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {FEATURES.confidenceGap &&
          confidence === null &&
          messages.length === 0 && (
            <div className="confidence-ask stage-confidence">
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

        <div className="captions-card">
          <div className="captions-head">
            <span className="eyebrow">{tt("liveCaptions")}</span>

            <span className="stage-spacer" />

            {!voiceOnlyActive && (
              <button
                className="stage-pill"
                aria-expanded={transcriptOpen}
                onClick={() => setTranscriptOpen((open) => !open)}
              >
                {transcriptOpen ? tt("hideTranscript") : tt("fullTranscript")}
              </button>
            )}

            {!isConnected ? (
              <button
                className="mic-button stage-mic"
                onClick={startConversation}
                disabled={conversation.status === "connecting"}
                title={tt("pressMic")}
              >
                🎙️
              </button>
            ) : (
              <div className="mic-controls stage-mic-controls">
                <button
                  className={`mic-button stage-mic ${
                    conversation.isMuted ? "muted" : "active"
                  }`}
                  onClick={() => {
                    if (paused) {
                      togglePause();
                      return;
                    }

                    conversation.setMuted(!conversation.isMuted);
                  }}
                  title={conversation.isMuted ? tt("micUnmute") : tt("micMute")}
                >
                  {conversation.isMuted ? "🔇" : "🎙️"}
                </button>

                <button
                  className={`pause-button ${paused ? "resting" : ""}`}
                  onClick={togglePause}
                  title={paused ? tt("resumeHint") : tt("pauseHint")}
                >
                  {paused ? tt("imReady") : tt("letMeThink")}
                </button>

                <button
                  className="end-call-button"
                  onClick={stopConversation}
                  title={tt("endCallHint")}
                >
                  {tt("endCall")}
                </button>
              </div>
            )}
          </div>

          {voiceOnlyActive ? (
            /* Pure conversation: everything still records and grades as
               normal; only the rendering is hidden. */
            <p className="captions-line">{tt("justTalk")}</p>
          ) : transcriptOpen ? (
            <>
            <details className="stage-words">
              <summary>{tt("jargonTitle")}</summary>
              <JargonDebt topic={selectedTopic} messages={messages} tt={tt} />
            </details>

            <div className="transcript stage-transcript">
              {messages.length === 0 && (
                <div className="transcript-message grandma-message">
                  <div className="speaker">{whoUpper}</div>
                  <p>{tt("ready", { topic: selectedTopic.name })}</p>
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

                const isStudent = message.source === "user";
                const role = isStudent
                  ? (you?.name ?? tt("you")).toUpperCase()
                  : whoUpper;

                return (
                  <div
                    className={`transcript-message ${
                      isStudent ? "user-message" : "grandma-message"
                    }`}
                    key={`${index}-${message.message}`}
                  >
                    <div className="speaker">
                      {isStudent && you && (
                        <img className="speaker-face" src={you.src} alt="" />
                      )}
                      {role}
                    </div>
                    <p>{message.message}</p>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>
            </>
          ) : (
            <div className="captions-body" aria-live="polite">
              {!latest ? (
                <p className="captions-line">
                  {tt("ready", { topic: selectedTopic.name })}
                </p>
              ) : (
                <>
                  {before && (
                    <p className="captions-before">
                      <b>{speakerOf(before)}:</b> {before.message}
                    </p>
                  )}
                  <p className={`captions-line ${latest.source === "user" ? "mine" : ""}`}>
                    {latest.source === "user" ? "" : <b>{speakerOf(latest)}: </b>}
                    {latest.message}
                  </p>
                </>
              )}
            </div>
          )}

          <p className="captions-status">
            {!isConnected
              ? conversation.status === "connecting"
                ? tt("connecting")
                : tt("pressMic")
              : statusLine}
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="stage-actions">
          {isConnected && requestHelp && (
            <button
              className="help-button"
              onClick={requestHelp}
              disabled={isHelping}
              title={tt("helpHint")}
            >
              {isHelping ? tt("helpWorking") : tt("help")}
            </button>
          )}

          {isConnected && FEATURES.spokenRecall && (
            <button
              className="recall-button"
              onClick={askGrandmaToRecall}
              disabled={askedForRecall}
              title={tt("recallHint")}
            >
              {askedForRecall ? tt("asked") : tt("askUnderstood")}
            </button>
          )}

          {FEATURES.challengeCards &&
            isConnected &&
            selectedTopic.challenges.length > 0 && (
              <span className="stage-label">
                {tt("challenge", { themAcc: sv.themAcc.toUpperCase() })}
              </span>
            )}

          {FEATURES.challengeCards &&
            isConnected &&
            selectedTopic.challenges.length > 0 &&
            selectedTopic.challenges.map((card) => {
              const used = usedChallengeIds.includes(card.id);

              return (
                <button
                  key={card.id}
                  className={`challenge-chip ${used ? "used" : ""}`}
                  onClick={() => sendChallengeCard(card)}
                  disabled={used}
                  title={card.instruction}
                >
                  {card.label}
                </button>
              );
            })}

          {(messages.length > 0 || completedCount === totalCount) && (
            <button className="finish-button stage-finish" onClick={finishLesson}>
              {tt("seeNotes")}
            </button>
          )}
        </div>

        {helpCard && (
          <div className={`help-card ${helpCard.spoken ? "spoken" : ""}`}>
            {helpCard.none ? (
              <p>{tt("helpNone")}</p>
            ) : helpCard.failed ? (
              <p>{tt("helpFailed")}</p>
            ) : (
              <>
                <div className="help-card-head">
                  <span className="help-card-label">
                    {helpCard.spoken ? tt("helpExplained") : tt("helpHintLabel")}
                  </span>
                  <span className="help-card-point">{helpCard.point}</span>
                </div>

                <p className="help-card-text">{helpCard.text}</p>

                <p className="help-card-note">
                  {helpCard.spoken ? tt("helpSpokenNotice") : tt("helpPrivateNotice")}
                </p>
              </>
            )}

            <button className="help-card-close" onClick={dismissHelp}>
              {tt("helpClose")}
            </button>
          </div>
        )}

        {FEATURES.challengeCards && challengeSentNotice && (
          <p className="challenge-sent-notice">{challengeSentNotice}</p>
        )}

        {completedCount === totalCount && (
          <div className="complete-message stage-complete">
            <strong>{tt("coveredAll")}</strong>
            <span>{tt("butDid")}</span>
          </div>
        )}
      </section>
    </main>
  );
}
