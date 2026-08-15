import { useMemo } from "react";
import { buildDebt } from "../jargon";

// Renders the live jargon ledger. The measurement itself lives in
// jargon.js so it can be tested without a browser.
export function JargonDebt({ topic, messages, tt }) {
  const rows = useMemo(() => buildDebt(topic, messages), [topic, messages]);
  const queried = rows.filter((r) => r.state === "queried").length;

  return (
    <section className="jargon">
      <div className="jargon-head">
        <span className="progress-title">{tt("jargonTitle")}</span>

        <span className="jargon-count tabular">
          {rows.length}
          <em>·</em>
          <strong className={queried ? "hot" : ""}>{queried}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="jargon-empty">{tt("jargonEmpty")}</p>
      ) : (
        <>
          <ul className="jargon-list">
            {rows.map((row) => (
              <li key={row.term} className={`jargon-row ${row.state}`}>
                <span className="jargon-term">{row.term}</span>
                <span className="jargon-state">{tt(`jargon_${row.state}`)}</span>
              </li>
            ))}
          </ul>

          <p className="jargon-note">
            {queried > 0 ? tt("jargonStopped", { count: queried }) : tt("jargonSoFar")}
          </p>
        </>
      )}
    </section>
  );
}
