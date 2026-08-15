import { useEffect, useRef, useState } from "react";
import { FEATURES } from "../features";
import { CHARACTERS } from "../characters";
import { resetNow } from "../reset";
import {
  YOU_OPTIONS,
  YOU_PRESETS,
  DEFAULT_PARAMS,
  buildYouUrl,
} from "../you";

// Both codes are in ElevenLabs' supported set and configured on the agent.
const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

// Starting points, not limits — any topic can be typed in.
const SUGGESTED_TOPICS_DE = [
  "Neuronale Netze",
  "Backpropagation",
  "Gradientenverfahren",
  "Überanpassung",
  "Transformer und Attention",
  "Faltungsnetze",
  "Embeddings",
  "Bestärkendes Lernen",
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

// The first screen: who you are, who you're teaching, and what about.
// Every value below is owned by App — this renders it and calls back.
export function Landing({
  character,
  isBuildingLesson,
  isJoining,
  isSavingYou,
  joinCode,
  joinError,
  joinTeachoff,
  language,
  lessonError,
  applyPhotoToAvatar,
  openQuiz,
  youPhotoState,
  saveYouProfile,
  setCharacter,
  setJoinCode,
  setLanguage,
  setShowYouEditor,
  setTeachoffName,
  setTopicInput,
  setYouDraftName,
  setYouDraftParams,
  showYouEditor,
  startLesson,
  stepYouParam,
  taglineName,
  teachoffName,
  topicInput,
  tt,
  uiLang,
  you,
  youDraftName,
  youDraftParams,
}) {
  const photoInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Cutting the tracks is what turns the webcam light off. Leaving a camera
  // live behind a closed panel is alarming in a room full of people.
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setCameraError("");

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      setCameraOpen(true);
    } catch (err) {
      // Named, like the microphone errors — "it didn't work" leaves someone
      // clicking the same button again.
      setCameraError(
        err?.name === "NotAllowedError"
          ? tt("cameraBlocked")
          : tt("cameraMissing")
      );
    }
  };

  // The <video> only exists once the panel is open, so the stream is attached
  // after that render rather than at the moment it was granted.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  // Leaving the landing view mid-capture must not leave the camera running.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const capturePhoto = () => {
    const video = videoRef.current;

    if (!video?.videoWidth) {
      return;
    }

    // Same 512px ceiling the file path uses, so both routes send a
    // comparably sized image.
    const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    stopCamera();
    applyPhotoToAvatar(dataUrl);
  };

  return (
      <main className="app">
        <section className="hero">
          <div className="eyebrow">TEACH IT TO GRANDMA</div>

          <h1>
            {tt("heroLine1")}
            <br />
            <span>{tt("heroLine2", { name: taglineName })}</span>
            <br />
            {tt("heroLine3")}
          </h1>

          <p className="subtitle">
            {tt("heroSub")}
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
                  title={tt("editCharacter")}
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
                  🙂 {tt("createCharacter")}
                </button>
              )}

              {showYouEditor && (
                <div className="you-editor">
                  <input
                    className="you-name-input"
                    value={youDraftName}
                    onChange={(event) => setYouDraftName(event.target.value)}
                    placeholder={tt("yourName")}
                    maxLength={24}
                    autoFocus
                  />

                  {FEATURES.selfieAvatar && (
                    <div className="you-photo-row">
                      <input
                        ref={photoInputRef}
                        className="you-photo-input"
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          // Cleared so picking the same file twice still
                          // fires a change event.
                          event.target.value = "";
                          applyPhotoToAvatar(file);
                        }}
                      />

                      {/* capture="user" opens the camera on a phone and is
                          ignored on a laptop, so the demo machine needs a
                          real getUserMedia path beside the file picker. */}
                      {typeof navigator !== "undefined" &&
                        navigator.mediaDevices?.getUserMedia && (
                          <button
                            className="you-photo-button"
                            onClick={openCamera}
                            disabled={
                              youPhotoState === "reading" || cameraOpen
                            }
                          >
                            {youPhotoState === "reading"
                              ? tt("photoReading")
                              : tt("takePhoto")}
                          </button>
                        )}

                      <button
                        className="you-photo-button subtle"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={youPhotoState === "reading"}
                      >
                        {tt("usePhoto")}
                      </button>

                      <span
                        className={`you-photo-note ${
                          youPhotoState === "failed" || cameraError
                            ? "failed"
                            : ""
                        }`}
                      >
                        {cameraError
                          ? cameraError
                          : youPhotoState === "failed"
                            ? tt("photoFailed")
                            : youPhotoState === "matched"
                              ? tt("photoMatched")
                              : tt("photoPrivacy")}
                      </span>
                    </div>
                  )}

                  {cameraOpen && (
                    <div className="you-camera">
                      <video
                        ref={videoRef}
                        className="you-camera-view"
                        autoPlay
                        playsInline
                        muted
                      />

                      <div className="you-camera-actions">
                        <button
                          className="you-photo-button"
                          onClick={capturePhoto}
                        >
                          {tt("photoCapture")}
                        </button>

                        <button
                          className="you-photo-button subtle"
                          onClick={stopCamera}
                        >
                          {tt("photoCancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="you-presets">
                    {YOU_PRESETS.map((preset, index) => (
                      <button
                        key={index}
                        className="you-preset"
                        title={tt("presetHint")}
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
                      alt={tt("yourCharacter")}
                    />

                    <div className="you-dials">
                      {[
                        ["head", tt("hair")],
                        ["facialHair", tt("facialHair")],
                        ["accessories", tt("glasses")],
                        ["face", tt("expression")],
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
                                {(uiLang === "de"
                                  ? current?.labelDe ?? current?.label
                                  : current?.label) ?? "—"}
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
                        <span className="you-dial-title">{tt("skin")}</span>

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
                              title={
                                uiLang === "de" ? o.labelDe ?? o.label : o.label
                              }
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
                        <span className="you-dial-title">{tt("backdrop")}</span>

                        <span className="you-swatches">
                          {YOU_OPTIONS.bg.map((o) => (
                            <button
                              key={o.value}
                              className={`you-swatch ${
                                youDraftParams.bg === o.value ? "selected" : ""
                              }`}
                              style={{ background: `#${o.value}` }}
                              title={
                                uiLang === "de" ? o.labelDe ?? o.label : o.label
                              }
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
                    {isSavingYou ? tt("saving") : tt("thatsMe")}
                  </button>
                </div>
              )}
            </div>
          )}

          {FEATURES.characterPicker && CHARACTERS.length > 1 && (
            <>
              <h2>{tt("whoTeaching")}</h2>

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

                    <span className="character-card-name">
                      {uiLang === "de" ? c.roleDe ?? c.role : c.role}
                    </span>
                    <span className="character-card-level">
                      {tt(c.difficulty)}
                    </span>
                    <span className="character-card-hook">
                      {uiLang === "de" ? c.hookDe ?? c.hook : c.hook}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h2>{tt("whatTeach")}</h2>

          {FEATURES.multilingual && (
            <div className="language-row">
              <span className="language-label">{tt("teachIn")}</span>

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
              placeholder={tt("topicPlaceholder")}
              disabled={isBuildingLesson}
              autoFocus
            />

            <button
              className="topic-submit"
              type="submit"
              disabled={isBuildingLesson || !topicInput.trim()}
            >
              {isBuildingLesson ? tt("preparing") : tt("teachIt")}
            </button>
          </form>

          {isBuildingLesson && (
            <p className="topic-status">
              {tt("workingOut")}
            </p>
          )}

          {lessonError && (
            <p className="error-message topic-error">{lessonError}</p>
          )}

          {FEATURES.teachOff && (
            <div className="teachoff-join">
              <span className="topic-suggestions-label">
                {tt("gotCode")}
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
                placeholder={tt("yourName")}
                maxLength={24}
              />

              <button
                className="join-button"
                onClick={joinTeachoff}
                disabled={isJoining || !joinCode.trim() || !teachoffName.trim()}
              >
                {isJoining ? tt("preparing") : tt("join")}
              </button>

              {joinError && <span className="join-error">{joinError}</span>}
            </div>
          )}

          {/* Below the teaching flow and styled as its sibling, never as a
              headline. The product's argument is that recall is not
              understanding; a quiz measures recall, so it gets a row down
              here and a sentence saying which of the two it is. */}
          {FEATURES.quizGame && (
            <div className="teachoff-join">
              <span className="topic-suggestions-label">
                {tt("quizEntryLabel")}
              </span>

              <button className="join-button" onClick={openQuiz}>
                {tt("quizEntryButton")}
              </button>

              <span className="topic-suggestions-label">
                {tt("quizEntryNote")}
              </span>
            </div>
          )}

          <div className="topic-suggestions">
            <span className="topic-suggestions-label">{tt("orTry")}</span>

            {(uiLang === "de" ? SUGGESTED_TOPICS_DE : SUGGESTED_TOPICS).map((topic) => (
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
              title={tt("clearLessonHint")}
            >
              {tt("clearLesson")}
            </button>

            <span className="reset-sep">·</span>

            <button
              className="reset-link danger"
              onClick={() => {
                const sure = window.confirm(tt("resetAllConfirm"));

                if (sure) {
                  resetNow("all");
                }
              }}
              title={tt("resetAllHint")}
            >
              {tt("resetAll")}
            </button>
          </div>
        </section>
      </main>
  );
}
