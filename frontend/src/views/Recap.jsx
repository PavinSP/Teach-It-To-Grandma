import { FEATURES } from "../features";
import { CHARACTERS } from "../characters";
import { analyseDelivery, deliveryReadings } from "../speech";
import {
  verdictForScore,
  bandForScore,
  headlineBandForScore,
  loadProfile,
  ACHIEVEMENTS,
} from "../progression";

// Kinds of turning point, labelled for whoever was listening — "Lost him"
// when it was Marcus. Everywhere else in the recap is character-aware and a
// hardcoded "her" here would stand out.
function turningPointLabel(kind, obj) {
  if (kind === "landed") return "Landed";
  if (kind === "lost") return `Lost ${obj}`;
  if (kind === "recovered") return "Recovered";
  return "Jargon";
}

function formatDuration(ms) {
  if (!ms || ms < 1000) return "—";

  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

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

// The notes screen. App owns every value below; what this file adds is
// the derivation only the recap needs, and the rendering.
export function Recap({
  activeCharacter,
  aiGrade,
  ambush,
  challengeError,
  confidence,
  convene,
  displayScore,
  explainBack,
  isBuildingChallenge,
  isBuildingMirror,
  isConvening,
  isExplaining,
  isGrading,
  jury,
  juryError,
  lessonDurationMs,
  lessonXp,
  mirror,
  mirrorError,
  mirrorFlags,
  mirrorSubmitted,
  newAchievements,
  openJuror,
  profileXp,
  progress,
  recallText,
  recap,
  replayCopied,
  resetAmbush,
  resetChallenge,
  resetChallengeCards,
  resetJury,
  resetMirror,
  resetMood,
  resetProgression,
  resetRecall,
  resetTeachoff,
  selectedTopic,
  setAiGrade,
  setConfidence,
  setError,
  setLessonError,
  setMessages,
  setMirrorSubmitted,
  setOpenJuror,
  setReplayCopied,
  setSelectedTopic,
  setShowRecap,
  setTeachoffName,
  setTopicInput,
  startMirror,
  startTeachoff,
  subj,
  takeChallenge,
  teachoff,
  teachoffBoard,
  teachoffName,
  toggleMirrorFlag,
  tt,
  who,
  whoUpper,
}) {
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

    // Before the AI grade lands there is no score to band, so fall back to
    // what the keyword pass can see. Once it arrives the headline moves with
    // the number under it.
    const headlineBand =
      lessonXp?.score != null
        ? headlineBandForScore(lessonXp.score)
        : gotEverythingAcross
          ? "aced"
          : "lost";

    // The character's own words about THIS lesson when the model supplied
    // them, the static line for that band otherwise. The band is chosen from
    // the computed score either way — the model writes all four blind and
    // never picks which one shows.
    const recapHeadline =
      (FEATURES.aiHeadline && aiGrade?.headlines?.[headlineBand]) ||
      activeCharacter.headlines[headlineBand];

    const openVerdict =
      jury?.verdicts?.find((v) => v.id === openJuror) ?? null;

    const delivery = FEATURES.deliveryAnalysis
      ? analyseDelivery(recap.userMessages, lessonDurationMs)
      : null;
    const readings = deliveryReadings(delivery);

    // Turning points are placed by where their quote falls in the student's
    // own words, so the track shows the lesson's real shape rather than the
    // order the model happened to list them in. A quote the server verified
    // but that spans two utterances won't be found here — it drops out
    // rather than piling up at position zero.
    const studentTranscript = recap.userMessages.join(" ").toLowerCase();
    const turningPoints = (
      FEATURES.forensics && Array.isArray(aiGrade?.turningPoints)
        ? aiGrade.turningPoints
        : []
    )
      .map((tp) => {
        const at = studentTranscript.indexOf(tp.quote.toLowerCase());

        return {
          ...tp,
          at: at < 0 ? null : at / Math.max(studentTranscript.length, 1),
        };
      })
      .filter((tp) => tp.at !== null)
      .sort((a, b) => a.at - b.at);

    const understoodCount = clearPoints.length;
    const totalPoints = selectedTopic.points.length;

    const copyReplay = async () => {
      const lines = [
        `${selectedTopic.name} — taught to ${who}`,
        lessonXp?.score != null ? `Feynman score: ${lessonXp.score}/100` : null,
        `Points followed: ${understoodCount}/${totalPoints}`,
        lessonDurationMs ? `Time on the mic: ${formatDuration(lessonDurationMs)}` : null,
        aiGrade?.strongestMoment?.quote
          ? `Best line: "${aiGrade.strongestMoment.quote}"`
          : null,
        teachoff ? `Teach-Off code: ${teachoff.code}` : null,
      ].filter(Boolean);

      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        setReplayCopied(true);
        setTimeout(() => setReplayCopied(false), 2000);
      } catch {
        // Clipboard permission is the browser's call, not ours. The card
        // itself is the deliverable — it stays on screen either way.
        setReplayCopied(false);
      }
    };

    return (
      <main className="app">
        <section className="recap-page">
          <div className="eyebrow">{tt("notesOf", { name: whoUpper })}</div>

          <h1>{recapHeadline}</h1>

          <p className="recap-subtitle">
            {tt("recapSub")}{" "}
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
                    <div className="score-label">{tt("feynmanScore")}</div>
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
                {tt("says", { name: whoUpper })}
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
                <div className="recap-head">
                  <div className="recap-icon">🧠</div>
                  <h2>{tt("reallyUnderstand")}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">🧨</div>
                  <h2>{tt("trapTitle")}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">🔮</div>
                  <h2>{tt("predictTitle")}</h2>
                </div>

                <p className="predict-intro">
                  {tt("predictIntro")}
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
                <div className="recap-head">
                  <div className="recap-icon">🪜</div>
                  <h2>{tt("depthTitle")}</h2>
                </div>
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
                        <span className="depth-you">{tt("youGotHere")}</span>
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
                  <strong>{tt("nextRung")}</strong> {aiGrade.depth.next}
                </p>
              )}
            </section>
          )}

          {FEATURES.blindSpots && aiGrade?.blindSpots?.length > 0 && (
            <section className="recap-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🕳️</div>
                  <h2>{tt("blindTitle")}</h2>
                </div>
              </div>

              <p className="recap-sub">
                {tt("blindIntro")}
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
                <div className="recap-head">
                  <div className="recap-icon">🧑‍⚖️</div>
                  <h2>{tt("juryTitle")}</h2>
                </div>
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
                  {/* The scores stay on the bench so the SPREAD — the actual
                      finding — is readable without clicking anything. Only the
                      reasoning is behind a tap. */}
                  <div className="jury-bench">
                    {jury.verdicts.map((v) => {
                      const juror = CHARACTERS.find((c) => c.id === v.id);
                      const isOpen = openJuror === v.id;

                      return (
                        <button
                          type="button"
                          key={v.id}
                          className={`juror-seat ${isOpen ? "open" : ""}`}
                          onClick={() => setOpenJuror(isOpen ? null : v.id)}
                          aria-expanded={isOpen}
                          aria-label={`${v.name} scored ${v.score} out of 100`}
                        >
                          <span
                            className={`juror-portrait band-${bandForScore(v.score)}`}
                            style={
                              juror?.color
                                ? { backgroundColor: juror.color }
                                : undefined
                            }
                          >
                            {juror?.image ? (
                              <img src={juror.image} alt="" />
                            ) : (
                              <span className="juror-glyph">
                                {juror?.glyph ?? "🧑"}
                              </span>
                            )}
                          </span>

                          <span className="juror-seat-name">{v.name}</span>

                          <span
                            className={`juror-seat-score band-${bandForScore(v.score)}`}
                          >
                            {v.score}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {openVerdict ? (
                    // Keyed on the juror so switching seats remounts the panel
                    // and replays its entrance, rather than swapping the text
                    // underneath a static box.
                    <div className="juror-verdict" key={openVerdict.id}>
                      <div className="juror-verdict-head">
                        <strong>{openVerdict.headline}</strong>
                        <span className="juror-verdict-score">
                          {openVerdict.score}
                          <em>/100</em>
                        </span>
                      </div>

                      <span className="juror-bar">
                        <span
                          className={`juror-fill band-${bandForScore(openVerdict.score)}`}
                          style={{ width: `${openVerdict.score}%` }}
                        />
                      </span>

                      <p>{openVerdict.verdict}</p>
                    </div>
                  ) : (
                    <p className="jury-hint">
                      Tap a juror to hear what they made of it.
                    </p>
                  )}

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
                <div className="recap-head">
                  <div className="recap-icon">🔄</div>
                  <h2>{tt("explainBackTitle")}</h2>
                </div>
              </div>
              <p className="recap-pending">
                {who} is working out what {subj} actually took away…
              </p>
            </section>
          )}

          {FEATURES.explainBack && explainBack && (
            <section className="recap-card explainback-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🔄</div>
                  <h2>{tt("explainBackTitle")}</h2>
                </div>
              </div>

              {/* A ladder, not three peer metrics. Saying the words is easier
                  than getting them repeated back, which is easier than being
                  followed — so they run loosest-first and the numbers descend.
                  Flat and in the old order, 2 / 0 / 1 read as three graders
                  contradicting each other; ordered, the drop between them is
                  the finding. */}
              <div className="gap-scoreboard">
                <div className="gap-stat">
                  <span className="gap-label">{tt("youCovered")}</span>
                  <span className="gap-value">
                    {progress.filter(Boolean).length} / {selectedTopic.points.length}
                  </span>
                </div>

                <div className="gap-stat">
                  <span className="gap-label">{tt("couldRepeat")}</span>
                  <span className="gap-value">
                    {explainBack.points.filter((p) => p.recalled === "correct").length}{" "}
                    / {explainBack.points.length}
                  </span>
                </div>

                {aiGrade?.results && (
                  <div className="gap-stat">
                    <span className="gap-label">{tt("theyFollowed")}</span>
                    <span className="gap-value">
                      {aiGrade.results.filter((r) => r.understood).length} /{" "}
                      {aiGrade.results.length}
                    </span>
                  </div>
                )}
              </div>

              <p className="gap-ladder">{tt("gapLadder")}</p>

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
                    {tt("undefinedWords")}
                  </div>

                  <div className="term-chips">
                    {explainBack.unexplainedTerms.map((term) => (
                      <span className="term-chip" key={term}>
                        {term}
                      </span>
                    ))}
                  </div>

                  <p className="recall-footnote">
                    {tt("fromYourOwn")}
                  </p>
                </div>
              )}
            </section>
          )}

          {FEATURES.richNotes && aiGrade?.strongestMoment?.quote && (
            <section className="recap-card strongest-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">💬</div>
                  <h2>{tt("strongest")}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">✓</div>
                  <h2>{tt("theyFollowedTitle")}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">💡</div>
                  <h2>{tt("toImprove")}</h2>
                </div>
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
              <div className="recap-head">
                <div className="recap-icon">{activeCharacter.glyph}</div>
                <h2>{tt("neededHelp")}</h2>
              </div>
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
              <div className="recap-head">
                <div className="recap-icon">💬</div>
                <h2>{tt("yourExplanation")}</h2>
              </div>
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

          {FEATURES.forensics && turningPoints.length > 0 && (
            <section className="recap-card forensics-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🕵️</div>
                  <h2>{tt("turnedTitle")}</h2>
                </div>
              </div>

              <p className="forensics-intro">
                The moments that decided this lesson, in the order they
                happened.
              </p>

              <div className="forensics-track">
                {turningPoints.map((tp, index) => (
                  <span
                    key={index}
                    className={`forensics-mark ${tp.kind}`}
                    style={{
                      left: `${Math.min(Math.max(tp.at * 100, 1.5), 98.5)}%`,
                    }}
                    title={tp.note}
                  />
                ))}
              </div>

              <div className="forensics-axis">
                <span>start of your lesson</span>
                <span>end</span>
              </div>

              <ol className="forensics-list">
                {turningPoints.map((tp, index) => (
                  <li key={index} className={tp.kind}>
                    <span className="forensics-kind">
                      {turningPointLabel(tp.kind, activeCharacter.obj)}
                    </span>
                    <blockquote>“{tp.quote}”</blockquote>
                    <p>{tp.note}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {FEATURES.deliveryAnalysis && delivery && (
            <section className="recap-card delivery-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🗣️</div>
                  <h2>{tt("deliveryTitle")}</h2>
                </div>
              </div>

              <p className="delivery-intro">
                Counted from your own words — {delivery.wordCount} of them
                {lessonDurationMs
                  ? ` over ${formatDuration(lessonDurationMs)}`
                  : ""}
                . This is about delivery, not whether you were right.
              </p>

              <ul className="delivery-readings">
                {readings.map((reading) => (
                  <li key={reading.id} className={reading.band}>
                    <div className="delivery-figure">
                      <span className="delivery-value">{reading.value}</span>
                      <span className="delivery-label">{reading.label}</span>
                    </div>
                    <div className="delivery-unit">{reading.unit}</div>
                    <p className="delivery-note">{reading.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {FEATURES.mirrorMode && recap.userMessages.length > 0 && (
            <section className="recap-card mirror-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🪞</div>
                  <h2>{tt("mirrorTitle", { theirs: activeCharacter.obj === "her" ? "her" : "his" })}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">⚔️</div>
                  <h2>{tt("teachoffTitle")}</h2>
                </div>
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
                <div className="recap-head">
                  <div className="recap-icon">⚔️</div>
                  <h2>{tt("thisTeachoff")}</h2>
                </div>
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

          {FEATURES.lessonReplay && lessonXp && (
            <section className="recap-card replay-card">
              <div className="recap-head">
                <div className="recap-head">
                  <div className="recap-icon">🎞️</div>
                  <h2>{tt("runTitle")}</h2>
                </div>
              </div>

              <div className="replay-sheet">
                <div className="replay-topline">
                  <span className="replay-topic">{selectedTopic.name}</span>
                  <span className="replay-taught">taught to {who}</span>
                </div>

                <div className="replay-stats">
                  <div>
                    <strong>{lessonXp.score ?? "—"}</strong>
                    <span>Feynman score</span>
                  </div>
                  <div>
                    <strong>
                      {understoodCount}/{totalPoints}
                    </strong>
                    <span>points followed</span>
                  </div>
                  <div>
                    <strong>{formatDuration(lessonDurationMs)}</strong>
                    <span>on the mic</span>
                  </div>
                  <div>
                    <strong>+{lessonXp.total}</strong>
                    <span>XP earned</span>
                  </div>
                </div>

                {aiGrade?.strongestMoment?.quote && (
                  <blockquote className="replay-quote">
                    “{aiGrade.strongestMoment.quote}”
                  </blockquote>
                )}

                {teachoff && (
                  <p className="replay-code">
                    Teach-Off <strong>{teachoff.code}</strong>
                  </p>
                )}
              </div>

              <button className="replay-copy" onClick={copyReplay}>
                {replayCopied ? "✓" : tt("copySummary")}
              </button>
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
                  ? tt("preparing")
                  : tt("takeChallenge")}
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
            {tt("teachSomethingElse")}
          </button>
        </section>
      </main>
    );
}
