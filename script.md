# Quiet-Room Test Scripts

Read each script out loud to Grandma, roughly in order. Each one is written to hit all 4 checklist points for that topic so you can confirm the progress bar reaches 4/4 and "Grandma's Notes" generates a sane recap.

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

## Test checklist per topic

- [ ] Select topic → Grandma greets with topic-aware first message
- [ ] Read script → transcript updates live
- [ ] Progress bar reaches 4/4
- [ ] Click "Finish lesson" → Grandma's Notes recap renders without a blank screen
- [ ] "Start another lesson" resets cleanly (no stale transcript/progress)
