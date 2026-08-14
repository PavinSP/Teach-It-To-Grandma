#!/usr/bin/env bash
# Backend half of the smoke test in TESTING.md, automated.
# The mic/voice half can't be scripted — this tells you where to pick it up.

set -uo pipefail
API="${VITE_GRADING_API:-http://localhost:3001}"
pass=0
fail=0

ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; fail=$((fail+1)); }

echo "== 1. Server health =="
if curl -s -o /dev/null -w '%{http_code}' "$API/health" | grep -q 200; then
  ok "server responds"
else
  bad "server not responding at $API — is 'cd server && npm run dev' running?"
  echo; echo "Stopping — nothing else can run without the server."; exit 1
fi

echo "== 2. Lesson generation =="
LESSON=$(curl -s -X POST "$API/api/lesson" -H 'Content-Type: application/json' \
  -d '{"topic":"backpropagation"}')
POINTS=$(echo "$LESSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('points',[])))" 2>/dev/null)
if [ "$POINTS" = "4" ]; then
  ok "generated 4 points for a real topic"
else
  bad "expected 4 points, got: $LESSON"
fi

REJECT=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/lesson" \
  -H 'Content-Type: application/json' -d '{"topic":"asdfgh qwerty"}')
if [ "$REJECT" = "422" ] || [ "$REJECT" = "400" ]; then
  ok "nonsense topic rejected ($REJECT)"
else
  bad "nonsense topic returned $REJECT, expected a rejection"
fi

echo "== 3. AI grading catches jargon-without-understanding =="
GRADE=$(curl -s -X POST "$API/api/grade" -H 'Content-Type: application/json' -d '{
  "topicName":"Neural Networks",
  "points":["Inputs are provided","Information passes through layers","Weights influence the output","The model learns by adjusting weights"],
  "transcript":[{"source":"user","message":"A neural network takes inputs and the data passes through layers. Each connection has weights that influence things. Then it learns by adjusting the weights during training."}]
}')
UNDERSTOOD=$(echo "$GRADE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(r['understood'] for r in d['results']))" 2>/dev/null)
if [ -n "$UNDERSTOOD" ] && [ "$UNDERSTOOD" -le 2 ]; then
  ok "vague jargon-y answer scored low ($UNDERSTOOD/4 understood) — the core thesis holds"
else
  bad "vague answer scored $UNDERSTOOD/4 understood — grading may have drifted lenient"
fi

echo "== 4. Explain-back (#9) holds the closed world =="
EXPLAIN=$(curl -s -X POST "$API/api/explainback" -H 'Content-Type: application/json' -d '{
  "topicName":"Backpropagation",
  "points":["The network makes a prediction and we measure the error","The error travels backwards through the layers","Each weight learns how much it contributed","The weights are nudged to reduce the error"],
  "transcript":[{"source":"user","message":"You use the chain rule to get the gradient and then you update the weights."}]
}')
TERMS=$(echo "$EXPLAIN" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('unexplainedTerms',[])))" 2>/dev/null)
if [ -n "$TERMS" ] && [ "$TERMS" -ge 1 ]; then
  ok "flagged $TERMS undefined term(s) instead of quietly understanding them"
else
  bad "expected undefined terms to be caught, got: $EXPLAIN"
fi

echo
echo "== Backend: $pass passed, $fail failed =="
if [ "$fail" -gt 0 ]; then
  echo "Fix the backend before testing the UI — see TESTING.md's 'where to look' table."
  exit 1
fi

cat <<'MANUAL'

== Now the part only a human can run ==
1. Open the app (Vite prints its port — usually 5173 or 5174).
2. Type "backpropagation", press "Teach it →".
3. Press the mic. Grandma should greet you BY TOPIC NAME.
4. Say two or three sentences. Transcript fills in and auto-scrolls.
5. Press "Finish lesson" — recap appears immediately, AI verdict fills in
   a moment later.
6. Press "👵 Ask Grandma what she understood" DURING a session (before
   finishing) to check the spoken half of #9.
7. Press "Teach something else" — confirm no leftover transcript, progress,
   or recall from the previous lesson.

If anything above misbehaves, add ?off=<flagName> to the URL and retry
before assuming it's broken.
MANUAL
