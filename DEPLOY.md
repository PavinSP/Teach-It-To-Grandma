# Deploying

Two Vercel projects from this one repo. They deploy separately because each
half then gets Vercel's zero-config detection — Vite on one side, Express on
the other — and neither needs a `vercel.json`.

Nothing here changes how the app runs locally. `npm run dev` in both folders
behaves exactly as it always has, against the local JSON file.

---

## Why the teach-off store had to change

Serverless has no durable disk. Vercel's filesystem is read-only apart from
`/tmp`, `/tmp` does not survive between invocations, and two concurrent
instances share nothing.

A file-backed board would work whenever both requests happened to hit the
same warm instance and fail the rest of the time. That is worse than failing
outright: it passes casual testing and loses a judge's code on stage.

So `server/store.js` now has two backends behind one interface. Upstash Redis
when its credentials are present, the original JSON file when they are not.
A deployed build **refuses to boot** without Redis rather than half-working —
check `/health`, which reports `{"ok":true,"store":"redis"}`.

---

## 1. The API project

**Add New → Project → import `PavinSP/titanom-hackathon`.**

| Setting | Value |
|---|---|
| Root Directory | `server` — click **Edit** beside it and pick the folder |
| Framework Preset | Express (auto-detected) |

Add one environment variable before deploying:

| Name | Value |
|---|---|
| `TITANOM_API_KEY` | the key from your local `.env` |

**This first deploy is expected to fail.** The store refuses to boot without
Redis, and the build log will say so in a sentence. That is the guard
working, not a broken build — Redis is the next step.

Note: with a Root Directory set, the build cannot read files above it. That
is fine here. `server/` is self-contained, and the `dotenv` call that looks
for `../.env` simply finds nothing and moves on, because on Vercel the
environment variables come from the platform instead.

## 2. Attach Redis

Vercel KV no longer exists; Redis comes through the Marketplace.

**Marketplace → search "redis" → Upstash → Install**, and connect it to the
API project you just made. The free tier is ample — a board is a few
kilobytes and expires after fourteen days.

Vercel injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
itself. You never copy a token by hand.

Now **redeploy** the API project. Check `https://<api-url>/health` — it must
say `{"ok":true,"store":"redis"}`. If it says `"file"`, the integration is
attached to a different project.

## 3. The frontend project

**Add New → Project → import the same repo again.** One repo, two projects,
which is expected and supported.

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Framework Preset | Vite (auto-detected) |

| Name | Value |
|---|---|
| `VITE_GRADING_API` | the API project's URL, no trailing slash |

This is read at build time, not run time — changing it needs a redeploy, not
just a reload.

## 4. Close the CORS loop

Back in the **API** project's settings, add:

| Name | Value |
|---|---|
| `ALLOWED_ORIGIN` | the frontend's URL, no trailing slash |

Redeploy the API. Comma-separate the value to allow more than one origin.

Without this every request fails CORS, which shows up in the browser console
and as a silent dead button in the UI.

---

## Verifying it actually works across devices

The point of all this is one thing, so test that one thing:

1. Open the frontend URL on your **laptop**. Teach anything, finish, press
   **Start a Teach-Off**, note the code.
2. Open the same URL on your **phone**. Enter that code and a name, press
   **Join**.
3. The phone must load the *same lesson* — same points, same description.

If the phone says "Could not find that teach-off", the API is on the file
backend. Check `/health`.

Microphone access needs HTTPS, which Vercel provides. It will not work over
a plain LAN IP to your laptop, which is why deploying is the shortest route
to testing on a phone at all.

---

## Rolling back

Two independent mechanisms — do not reach for the wrong one under pressure.

**The live site:** Vercel dashboard → Deployments → pick a previous one →
Promote to Production. Takes seconds and needs no git.

**Your laptop:** `git checkout main`. This does nothing to the live site.

---

## What is not covered

The rate limiter in `server/index.js` keeps its window in memory, so on
serverless it becomes per-instance rather than global. It fails permissive,
never restrictive, and the API key is still server-side. Fine for a demo,
not something to leave running unattended for a month.
