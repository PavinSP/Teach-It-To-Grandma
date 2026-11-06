// The opening screen's spoken lines must say what the page shows. The server
// keeps its own copy (it cannot import the front end when deployed), so this
// fails the day one side is edited and the other is not.
//
// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { INTRO_LINES } from "../introLines.js";
import { t } from "../../frontend/src/strings.js";

const keyFor = (id) => id.replace(/^q(\d)w(\d)$/, "introQ$1Why$2").replace(/^q(\d)$/, "introQ$1");

test("every question and follow-up the page shows has a matching voice line", () => {
  for (const [id, line] of Object.entries(INTRO_LINES)) {
    if (id === "gap" || id === "swap") {
      continue;
    }

    for (const lang of ["en", "de"]) {
      assert.equal(line[lang], t(lang, keyFor(id)), `${id} (${lang}) matches strings.js`);
    }
  }

  // And no line shown on the page is missing here.
  for (const n of [1, 2, 3]) {
    assert.ok(INTRO_LINES[`q${n}`], `q${n}`);

    for (const w of [1, 2, 3]) {
      assert.ok(INTRO_LINES[`q${n}w${w}`], `q${n}w${w}`);
    }
  }
});
