import { useMemo, useState } from "react";

// After a file is uploaded: which part of it will you rehearse?
//
// A real presenter practises one part at a time, and a lesson stays sharp when
// it covers one part. So the document is listed by its own sections (slides,
// pages, headings) and the presenter picks one, or several, or all of it.
//
//   One at a time   choosing a row replaces the choice
//   Several         rows are ticked, as many as fit
//   Whole document  everything, offered only when it fits in one go
//
// How much fits is the server's own limit (`outline.limit`, in characters), so
// the bar here and the refusal there can never disagree.

export function SectionPicker({ outline, tt, busy, onStart, onCancel }) {
  const [several, setSeveral] = useState(false);
  const [chosen, setChosen] = useState(() => new Set());

  const { sections, limit } = outline;
  const total = useMemo(() => sections.reduce((sum, s) => sum + s.chars, 0), [sections]);
  const used = useMemo(
    () => sections.filter((s) => chosen.has(s.index)).reduce((sum, s) => sum + s.chars, 0),
    [sections, chosen]
  );

  const wholeFits = total <= limit;
  const tooMuch = used > limit;

  const toggle = (index) => {
    setChosen((current) => {
      if (!several) {
        return new Set([index]);
      }

      const next = new Set(current);

      if (!next.delete(index)) {
        next.add(index);
      }

      return next;
    });
  };

  const switchMode = (value) => {
    setSeveral(value);

    // Back to one at a time keeps just the first thing that was chosen.
    if (!value) {
      setChosen((current) => new Set([...current].slice(0, 1)));
    }
  };

  const start = () => onStart([...chosen].sort((a, b) => a - b));

  return (
    <section className="section-picker" aria-label={tt("pickTitle")}>
      <div className="section-picker-head">
        <div>
          <h2>{tt("pickTitle")}</h2>
          <p className="section-picker-file">
            📄 {outline.fileName} · {tt("pickCount", { n: sections.length })}
          </p>
        </div>

        <button type="button" className="section-picker-cancel" onClick={onCancel} disabled={busy}>
          {tt("pickOther")}
        </button>
      </div>

      <p className="section-picker-help">{tt("pickHelp")}</p>

      <div className="section-picker-tools">
        <div className="segmented" role="group" aria-label={tt("pickTitle")}>
          <button
            type="button"
            className={!several ? "active" : ""}
            aria-pressed={!several}
            onClick={() => switchMode(false)}
          >
            {tt("pickOne")}
          </button>
          <button
            type="button"
            className={several ? "active" : ""}
            aria-pressed={several}
            onClick={() => switchMode(true)}
          >
            {tt("pickSeveral")}
          </button>
        </div>

        <button
          type="button"
          className="section-picker-whole"
          disabled={!wholeFits}
          title={wholeFits ? "" : tt("pickTooLong")}
          onClick={() => {
            setSeveral(true);
            setChosen(new Set(sections.map((s) => s.index)));
          }}
        >
          {tt("pickWhole")}
        </button>
      </div>

      <ul className="section-list">
        {sections.map((section) => {
          const on = chosen.has(section.index);

          return (
            <li key={section.index}>
              <label className={`section-row ${on ? "on" : ""}`}>
                <input
                  type={several ? "checkbox" : "radio"}
                  name="document-section"
                  checked={on}
                  onChange={() => toggle(section.index)}
                />
                <span className="section-ref">{section.ref}</span>
                <span className="section-title">{section.title || "—"}</span>
                <span className="section-size">
                  {tt("pickWords", { n: Math.max(1, Math.round(section.chars / 6)) })}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="section-picker-foot">
        <p className={`section-picker-note ${tooMuch ? "over" : ""}`}>
          {tooMuch
            ? tt("pickOver")
            : chosen.size
              ? tt("pickChosen", { n: chosen.size })
              : tt("pickNone")}
        </p>

        <button
          type="button"
          className="join-button section-picker-start"
          onClick={start}
          disabled={busy || !chosen.size || tooMuch}
        >
          {tt("pickStart")}
        </button>
      </div>
    </section>
  );
}
