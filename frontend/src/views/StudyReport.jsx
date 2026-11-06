import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// A study sheet for the presenter, written after a document rehearsal:
//
//   a plain summary of the part, written from the document
//   what they said, tidied for reading, beside what they actually said
//   the points they missed, each with a way to say it
//
// It is made by the model on this machine and shown on this page. "Save as
// PDF" is the browser's own print dialog, so the file is made here too: no
// document, no words and no report is sent anywhere or kept.

export function StudyReport({
  api,
  language,
  tt,
  topic,
  listener,
  results,
  said,
  source,
  onClose,
}) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  // The part-by-part guide fills in as the model writes each part.
  const [parts, setParts] = useState([]);
  const [partsTotal, setPartsTotal] = useState(0);
  const [partsState, setPartsState] = useState(source ? "working" : "none");

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${api}/api/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            language,
            lessonName: topic.name,
            said,
            points: topic.points.map((label, i) => ({
              label,
              understood: results[i],
              passage: topic.sources?.[i]?.context || topic.sources?.[i]?.quote || "",
            })),
          }),
        });

        const body = await response.json();

        if (!response.ok) {
          setError(body.error || tt("reportFailed"));
          return;
        }

        setReport(body);

        // Then the detailed guide, one part at a time, if the file is still
        // here to be read again (after a reload it is not).
        if (!source?.file) {
          return;
        }

        const form = new FormData();
        form.append("file", source.file);
        form.append("language", language);
        form.append("lessonName", topic.name);
        form.append("audience", listener);

        if (source.sections?.length) {
          form.append("sections", source.sections.join(","));
        }

        const stream = await fetch(`${api}/api/report/detail`, {
          method: "POST",
          body: form,
          signal: controller.signal,
        });

        if (!stream.ok || !stream.body) {
          setPartsState("failed");
          return;
        }

        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";

        const handle = (text) => {
          if (!text.trim()) {
            return;
          }

          const item = JSON.parse(text);

          if (item.total) {
            setPartsTotal(item.total);
          } else if (item.done) {
            setPartsState("done");
          } else if (item.title) {
            setParts((current) => [...current, item]);
          }
        };

        for (;;) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          lines.forEach(handle);
        }

        handle(pending);
        setPartsState((state) => (state === "working" ? "done" : state));
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(tt("reportFailed"));
        }
      }
    })();

    return () => controller.abort();
    // Written once, when it is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doc = topic.document;
  const part = doc?.partial ? doc.parts.join(", ") : tt("reportWholeDoc");
  const date = new Date().toLocaleDateString(language === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const missed = topic.points
    .map((label, i) => ({ label, source: topic.sources?.[i] }))
    .filter((_, i) => !results[i]);
  const covered = results.filter(Boolean).length;

  // Rendered straight into <body>, so printing can hide the whole app
  // (#root) and leave only the sheet, with no blank pages behind it.
  return createPortal(
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label={tt("reportTitle")}>
      <div className="report-bar">
        <button type="button" className="report-close" onClick={onClose}>
          ← {tt("reportBack")}
        </button>

        <button
          type="button"
          className="join-button"
          onClick={() => window.print()}
          disabled={!report || partsState === "working"}
        >
          {tt("reportSave")}
        </button>
      </div>

      <article className="report-sheet">
        <header className="report-head">
          <p className="report-kicker">{tt("reportTitle")}</p>
          <h1>{topic.name}</h1>
          <p className="report-meta">
            {doc?.fileName} · {part} · {tt("reportListener", { name: listener })} · {date}
          </p>
          <p className="report-meta">{tt("reportCovered", { n: covered, total: topic.points.length })}</p>
        </header>

        {!report && !error && <p className="report-wait">{tt("reportWriting")}</p>}
        {error && <p className="error-message">{error}</p>}

        {report && (
          <>
            <section>
              <h2>{tt("reportMissed")}</h2>

              {missed.length === 0 ? (
                <p>{tt("reportNoneMissed")}</p>
              ) : (
                <ul className="report-list">
                  {missed.map((point) => {
                    const fix = report.fixes.find((f) => f.point === point.label);

                    return (
                      <li key={point.label}>
                        <strong>{point.label}</strong>
                        {fix && <p>{tt("reportSayIt")} {fix.sayIt}</p>}
                        {point.source?.verified && (
                          <blockquote>
                            “{point.source.quote}” <span>{point.source.ref}</span>
                          </blockquote>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {source?.file && (
              <section>
                <h2>{tt("reportGuide")}</h2>

                {parts.map((part) => (
                  <div className="report-part" key={part.index}>
                    <h3>
                      {part.title} <span>{part.ref}</span>
                    </h3>

                    {part.oneSentence && (
                      <p className="report-one">
                        <strong>{tt("reportOneSentence")}</strong> {part.oneSentence}
                      </p>
                    )}

                    {part.thin && <p className="report-thin">{tt("reportThin")}</p>}

                    {part.inPlainWords.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}

                    {part.terms.length > 0 && (
                      <>
                        <h4>{tt("reportTerms")}</h4>
                        <dl className="report-terms">
                          {part.terms.map((t) => (
                            <div key={t.term}>
                              <dt>{t.term}</dt>
                              <dd>{t.meaning}</dd>
                            </div>
                          ))}
                        </dl>
                      </>
                    )}

                    {part.questions.length > 0 && (
                      <>
                        <h4>{tt("reportQuestions")}</h4>
                        <ul className="report-qa">
                          {part.questions.map((q) => (
                            <li key={q.question}>
                              <strong>{q.question}</strong>
                              <p>{q.answer}</p>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}

                {partsState === "working" && (
                  <p className="report-wait">
                    {tt("reportPartsWorking", { n: parts.length, total: partsTotal || "…" })}
                  </p>
                )}

                {partsState === "failed" && <p className="report-wait">{tt("reportPartsFailed")}</p>}
              </section>
            )}

            <section>
              <h2>{tt("reportSummary")}</h2>
              {report.summary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>

            <section>
              <h2>{tt("reportTidied")}</h2>
              <p>{report.tidied || "—"}</p>

              <details className="report-original" open>
                <summary>{tt("reportOriginal")}</summary>
                <p>{said || "—"}</p>
              </details>
            </section>

            <footer className="report-foot">{tt("reportFoot")}</footer>
          </>
        )}
      </article>
    </div>,
    document.body
  );
}
