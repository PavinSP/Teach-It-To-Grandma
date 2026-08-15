// The student's own identity (#46, the student half): a name and a face,
// chosen once, kept in this browser. Faces are a fixed grid of Open Peeps
// compositions spanning hair, skin tones, beards and glasses — you pick
// the one that looks like you, and no option carries a demographic label.

export const YOU_FACES = Array.from(
  { length: 12 },
  (_, i) => `/you-${i + 1}.png`
);

const YOU_KEY = "teachit.you.v1";

export function loadYou() {
  try {
    const raw = localStorage.getItem(YOU_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (
      parsed &&
      typeof parsed.name === "string" &&
      parsed.name.trim() &&
      YOU_FACES.includes(parsed.face)
    ) {
      return { name: parsed.name.trim().slice(0, 24), face: parsed.face };
    }
  } catch {
    // Corrupt or unavailable storage — behave as if never set up.
  }

  return null;
}

export function saveYou(name, face) {
  const you = {
    name: String(name).trim().slice(0, 24),
    face: YOU_FACES.includes(face) ? face : YOU_FACES[0],
  };

  if (!you.name) {
    return null;
  }

  try {
    localStorage.setItem(YOU_KEY, JSON.stringify(you));
  } catch {
    // Still usable for this session even if it can't persist.
  }

  return you;
}
