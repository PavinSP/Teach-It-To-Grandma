Two notes before the ideas: your dev server died when the previous background shell was torn down (npm run dev is no longer serving), and it's 16:23 — about 65 minutes to 17:30. So I'm ordering these by what actually fits, and I'll flag what's pitch-only.

Also worth saying plainly: the export never records the actual judging criteria, so "what wins" below is my inference from the demo script — not something I can verify from your spec.

The one feature that could genuinely swing it (~20 min)
A Feynman Score. Right now the payoff is "4/4 boxes ticked," which reads as a checklist app. One number turns it into a product:


GRANDMA'S NOTES

Feynman Score: 72 / 100

Concepts explained      4 / 4
Jargon Grandma caught   3
Times she needed help   2
Time to clarity         1:48
All of it is arithmetic on state you already hold — progress, recap.clarificationMessages, recap.questions, userMessages.length, plus a Date.now() at session start. Zero API, zero backend, no new failure mode. It also retroactively justifies the line in your closing slide about jargon counts, which the code currently doesn't compute.

Why it matters for judging: a score is memorable, comparable, and quotable. "I got a 54 and my teammate got an 81" is the thing a judge repeats to another judge. A checklist isn't.

Three user-friendliness fixes under 10 minutes each
1. Tell people what's about to happen. Your landing page jumps from a topic grid straight into a mic session. A first-timer doesn't know they're about to talk out loud. A three-step strip under the subtitle — Pick a topic → Explain it out loud → Grandma pokes holes — costs one <div> and removes the "wait, what do I do" beat that will also happen to a judge who tries it themselves.

2. Separate mic-denied from connection-failed. App.jsx:268 collapses both into "Could not start the microphone or connect to Grandma." A user who denied permission gets no path forward. Check err.name === "NotAllowedError" and say "Microphone blocked — click the padlock in your address bar and allow access." This is the single most likely thing to go wrong for anyone who tries your app after the demo.

3. Give silence a state. You have speaking and listening, but nothing between — when Grandma is generating, the UI looks frozen and users start clicking. A "Grandma is thinking…" state on isConnected && !isSpeaking && !isListening prevents the most common misread of a voice app.

Make the wow moment impossible to miss (~10 min, high demo leverage)
Highlight the jargon in the transcript. When Grandma asks "what's an algorithm?", the term she's asking about is almost always in quotes or is the noun in her question — you can pull it and wrap matches in the student's previous message with a <mark>. The judges then see the causal link: you said a word → she flagged that exact word. Right now they have to infer it by listening carefully, and the export already worries twice that the audience won't catch every spoken word.

Cheaper variant if that feels fiddly: animate the checklist tick — pulse the row and the progress bar when a point flips to complete. The tick is your wow moment and it currently happens silently.

Zero-code moves that help you win
Fail on purpose, early. Your demo script already does this. Lead with the bad explanation so the first thing judges see is Grandma catching you. Most teams demo their thing working; you demo it catching a human, which is more interesting.
Hand a judge the mic. If the room allows it, letting a judge try to explain something for 30 seconds is worth more than a polished monologue. Only do this if fix #2 above is in — a judge hitting a dead mic error is the worst possible outcome.
Name the insight, not the feature. "We don't grade what you said. We grade whether a beginner could follow it." That's the sentence people remember.
Show the roadmap as a slide, not as code. Grandma → skeptical 8-year-old → impatient colleague; teacher dashboards; any topic on demand. The export explicitly tells you not to build multiple personas today, and it's right — but describing them costs nothing and makes a demo look like a product.
Post-hackathon (don't touch today)
Client tools so Grandma marks the checklist herself (from my last message), attempt-over-attempt improvement tracking, difficulty tiers, and topics loaded from data/topics.json.

My honest recommendation for the next 65 minutes: the three fixes from my previous message (~15 min), then the Feynman Score (~20 min), then stop and rehearse — the export's own plan gives you 15:00–16:00 for five full run-throughs and you haven't had them. Everything else here is better as a roadmap slide than as code written 40 minutes before you present.

Want me to restart the dev server and implement the score plus the three quick fixes? I can have them in within about 20 minutes, and I'll leave the keyword grader untouched so nothing that currently works can break.