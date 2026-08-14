# Quiet-Room Test Scripts

Read each script out loud to Grandma, roughly in order. Each one is written to hit all 4 checklist points for that topic so you can confirm the progress bar reaches 4/4 and "Grandma's Notes" generates a sane recap.

> **These were written against the old fixed topics.** Topics are now typed in
> and their checklists are generated per lesson, so the wording of the points —
> and the exact scores below — will vary run to run. Type the topic name to use
> a script; treat the numbers as indicative, not exact.

---

## 1. Recursion

Checklist: function calls itself · stopping condition · why it matters · concrete example

> So recursion is when a **function calls itself** — the function literally calls itself again from inside its own body, so it's this idea of a function calling itself over and over.
>
> But it can't just call itself forever, so there's a **stopping condition**, also called a base case, that tells it when to stop.
>
> That stopping condition matters because without it the function would never stop — it would just keep calling itself forever and infinite, and eventually crash.
>
> For example, imagine a function that counts down from 5 — it's like each call handles one number, then calls itself again with a smaller number, until it hits the base case.

Notes:
- The first point needs "function," "call," and "itself" all mentioned — the phrasing above says all three explicitly.
- The example line only counts if it also mentions a recursion-related word nearby (function, base case, recursive, call itself) — covered by "each call handles one number... calls itself again."

---

## 2. Neural Networks

Checklist: inputs provided · info passes through layers · weights influence output · model learns by adjusting weights

> A neural network starts with some **inputs** — like data you feed into it.
>
> That data then **passes through layers** of the network, one layer after another.
>
> Each connection has a **weight**, and those weights **influence** how much each input matters to the output.
>
> The network **learns** by **adjusting** those weights during **training**, so it gets better over time.

---

## 3. Mitosis

Checklist: cell prepares to divide · DNA is copied · chromosomes separate · two daughter cells produced

> Mitosis starts when a **cell prepares** for **division** — it's getting ready to split into two.
>
> Before it splits, the **DNA** gets **copied**, so there are two full sets.
>
> Then the **chromosomes separate**, getting pulled to opposite ends of the cell.
>
> Finally the cell splits into **two daughter cells**, each with a full copy of the DNA.

---

## 4. Supply & Demand

Checklist: buyers create demand · sellers create supply · price affects both · supply/demand affect equilibrium

> So **buyers** create **demand** — that's how much people want to buy something.
>
> **Sellers** create the **supply** — how much of it is available.
>
> **Price** **affects** both sides — if the price goes up, buyers want less and sellers want to offer more.
>
> Eventually supply and demand settle into a **balance**, called **equilibrium**, where the price stops changing much.

---

# Vague scripts (the demo moment)

These deliberately hit every keyword while explaining nothing. The keyword
checklist should still reach **4/4**, but the AI grader should say Grandma
didn't actually understand. That contrast is the thing worth showing judges.

Requires the grading server running (`cd server && npm run dev`).

## Recursion — vague

> So recursion is basically when a function calls itself. There's a base case, and that's the stopping condition, so it doesn't go on forever or infinite. It's a really useful technique. For example, like factorial — that's a classic example of recursion.

Every checklist keyword is present, but: never says what a function *is*, never says what the base case actually checks, never walks through a single step of factorial. Circular too — "recursion is a recursive technique."

## Neural Networks — vague

> A neural network takes some inputs, and the data passes through layers. Each connection has weights that influence things. Then it learns by adjusting the weights during training. That's basically how it works.

Names every component in the right order without saying what any of them do. "Influence things" and "that's basically how it works" are the tells.

## Mitosis — vague

> So in mitosis the cell prepares for division. The DNA gets copied, then the chromosomes separate, and you end up with two daughter cells. It's the process cells use to divide.

Reads like a memorised sequence. Never explains *why* DNA must be copied first, or what separating the chromosomes accomplishes.

## Supply & Demand — vague

> Buyers create demand and sellers create supply. Price affects both of them. Then supply and demand reach equilibrium, which is the balance point. That's the basic economics of it.

States four definitions without a single causal link — never says which way prices move when demand rises, or why equilibrium is stable.

---

## What to expect

Measured against the live grader, back when checklists were fixed:

| Vague script | Keyword grader | AI grader |
|---|---|---|
| Recursion | 4 / 4 | 2 / 4 understood |
| Neural Networks | 4 / 4 | **0 / 4 understood** |
| Mitosis | 4 / 4 | 2 / 4 understood |
| Supply & Demand | 4 / 4 | varies |

**Use Neural Networks for the demo** — it produced the sharpest contrast.
Mitosis is the weakest, since reciting the correct sequence reads as partial
understanding on its own.

Now that checklists are generated per lesson these exact splits will drift, but
the effect holds: jargon reliably fills the coverage bar while the AI grader
marks the same answer down. Do a dry run of whichever topic you plan to demo
and check the contrast is still sharp before you rely on it.

If both graders agree on the vague script, the AI call probably failed — check
the server is up on :3001 and look at the browser console.

Grandma will likely interrupt mid-way to challenge the vagueness (the agent is
interruptible). That's good demo material — let her, then continue.

---

## Test checklist per topic

- [ ] Select topic → Grandma greets with topic-aware first message
- [ ] Read script → transcript updates live
- [ ] Progress bar reaches 4/4
- [ ] Click "Finish lesson" → Grandma's Notes recap renders without a blank screen
- [ ] "Start another lesson" resets cleanly (no stale transcript/progress)
