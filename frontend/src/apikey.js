// A visitor's own TitanomGPT key, for when the deploy's own key has expired.
//
// sessionStorage, and that is the security decision rather than a convenience
// one. The key lives in this tab and dies with it: closing the tab clears it,
// another tab never sees it, and nothing on this machine keeps a copy after
// the browser is shut. localStorage would have saved a paste per visit at the
// cost of leaving somebody's credential sitting on disk indefinitely, which is
// not a trade worth making for a demo.
//
// The server side of the same promise: the key rides one header on one
// request, builds a client for the life of that call, and is never logged,
// never persisted and never echoed back.

const KEY = "titanom-byo-key";
const BASE = "titanom-byo-base";
const MODEL_KEY = "titanom-byo-model";

// Known OpenAI-compatible providers, so nobody has to remember a base URL.
// "Compatible" means the /chat/completions shape the OpenAI SDK speaks, which
// is most of them now — including Google's and Anthropic's own gateways.
export const PROVIDERS = [
  {
    id: "titanom",
    label: "DeutschlandGPT",
    base: "https://api.deutschlandgpt.de/v2",
    model: "gemini-3.1-flash-lite",
    hint: "What this was built for",
  },
  {
    id: "openai",
    label: "OpenAI",
    base: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "platform.openai.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    hint: "aistudio.google.com",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    base: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    // Anthropic's OpenAI-compatible layer covers chat completions but treats
    // response_format as a hint rather than a guarantee — it ignores `strict`.
    // Every graded route here asks for JSON, so a reply that drifts from the
    // schema fails validation and the recap falls back to keyword grading.
    // Works, and worth knowing it is the least exact of these four.
    hint: "console.anthropic.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.0-flash-001",
    hint: "One key, most models",
  },
];

export function byoKey() {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setByoKey(value) {
  try {
    const clean = String(value ?? "").trim();

    if (clean) {
      sessionStorage.setItem(KEY, clean);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Private mode. Nothing to do — the paste simply will not survive a
    // reload, and the prompt reappears, which is the correct behaviour.
  }
}

export function clearByoKey() {
  setByoKey("");
  setByoProvider("", "");
}

// Folded into every request that reaches a model. Absent when there is no
// key, so a working deploy sends nothing extra.
export function byoBase() {
  try {
    return sessionStorage.getItem(BASE) ?? "";
  } catch {
    return "";
  }
}

export function byoModel() {
  try {
    return sessionStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setByoProvider(base, model) {
  try {
    base ? sessionStorage.setItem(BASE, base) : sessionStorage.removeItem(BASE);
    model
      ? sessionStorage.setItem(MODEL_KEY, model)
      : sessionStorage.removeItem(MODEL_KEY);
  } catch {
    // Private mode. The choice applies for this page load and no longer.
  }
}

// A key is useless without knowing where to send it and what to ask for, so
// all three travel together or none of them do.
export function keyHeaders() {
  const key = byoKey();

  if (!key) {
    return {};
  }

  const headers = { "x-titanom-key": key };
  const base = byoBase();
  const model = byoModel();

  if (base) {
    headers["x-ai-base-url"] = base;
  }

  if (model) {
    headers["x-ai-model"] = model;
  }

  return headers;
}
