// The student's own identity (#46, the student half): a name and a face
// you COMPOSE — skin tone, hair, facial hair, glasses, expression — not
// just pick. Every attribute is a separate dial over the Open Peeps set
// (CC0); the twelve presets are starting points for tweaking.
//
// On save, the composed image is fetched once and cached as a data URL,
// so the avatar keeps rendering with no network. If that fetch fails the
// live URL is stored instead — cosmetic feature, graceful degradation.

export const YOU_OPTIONS = {
  skin: [
    { value: "ffdbb4", label: "Skin 1" },
    { value: "edb98a", label: "Skin 2" },
    { value: "d08b5b", label: "Skin 3" },
    { value: "ae5d29", label: "Skin 4" },
    { value: "694d3d", label: "Skin 5" },
  ],
  head: [
    { value: "long", label: "Long" },
    { value: "longCurly", label: "Long curly" },
    { value: "longBangs", label: "Long bangs" },
    { value: "mediumBangs", label: "Medium bangs" },
    { value: "mediumStraight", label: "Medium straight" },
    { value: "bun", label: "Bun" },
    { value: "buns", label: "Two buns" },
    { value: "bantuKnots", label: "Bantu knots" },
    { value: "afro", label: "Afro" },
    { value: "longAfro", label: "Long afro" },
    { value: "dreads1", label: "Dreads" },
    { value: "cornrows", label: "Cornrows" },
    { value: "twists", label: "Twists" },
    { value: "hijab", label: "Hijab" },
    { value: "turban", label: "Turban" },
    { value: "flatTop", label: "Flat top" },
    { value: "pomp", label: "Pompadour" },
    { value: "short3", label: "Short" },
    { value: "short5", label: "Short crop" },
    { value: "mohawk", label: "Mohawk" },
    { value: "grayShort", label: "Gray short" },
    { value: "grayBun", label: "Gray bun" },
    { value: "noHair1", label: "Bald" },
    { value: "hatBeanie", label: "Beanie" },
  ],
  facialHair: [
    { value: "", label: "None" },
    { value: "chin", label: "Chin strap" },
    { value: "goatee1", label: "Goatee" },
    { value: "moustache1", label: "Moustache" },
    { value: "moustache4", label: "Thick moustache" },
    { value: "full", label: "Full beard" },
  ],
  accessories: [
    { value: "", label: "None" },
    { value: "glasses", label: "Glasses" },
    { value: "glasses2", label: "Round glasses" },
    { value: "glasses3", label: "Bold glasses" },
    { value: "sunglasses", label: "Sunglasses" },
  ],
  face: [
    { value: "smile", label: "Smile" },
    { value: "smileBig", label: "Big smile" },
    { value: "calm", label: "Calm" },
    { value: "cute", label: "Cheerful" },
    { value: "driven", label: "Determined" },
  ],
  bg: [
    { value: "e3b0c0", label: "Pink" },
    { value: "9db8d9", label: "Blue" },
    { value: "8fb8a2", label: "Green" },
    { value: "d8b4a0", label: "Clay" },
    { value: "a3a9b8", label: "Slate" },
    { value: "bda389", label: "Sand" },
  ],
};

export const DEFAULT_PARAMS = {
  skin: "edb98a",
  head: "short3",
  facialHair: "",
  accessories: "",
  face: "smile",
  bg: "9db8d9",
};

// Starting points — the previous fixed grid, now editable after picking.
export const YOU_PRESETS = [
  { skin: "ffdbb4", head: "long", facialHair: "", accessories: "", face: "smile", bg: "e3b0c0" },
  { skin: "ae5d29", head: "short3", facialHair: "", accessories: "", face: "smileBig", bg: "9db8d9" },
  { skin: "694d3d", head: "afro", facialHair: "", accessories: "", face: "smile", bg: "8fb8a2" },
  { skin: "d08b5b", head: "bun", facialHair: "", accessories: "", face: "calm", bg: "d8b4a0" },
  { skin: "edb98a", head: "flatTop", facialHair: "", accessories: "", face: "cute", bg: "a3a9b8" },
  { skin: "694d3d", head: "dreads1", facialHair: "goatee1", accessories: "", face: "smile", bg: "bda389" },
  { skin: "ffdbb4", head: "mediumBangs", facialHair: "", accessories: "glasses", face: "smile", bg: "9db8d9" },
  { skin: "ae5d29", head: "buns", facialHair: "", accessories: "", face: "cute", bg: "e3b0c0" },
  { skin: "d08b5b", head: "hijab", facialHair: "", accessories: "", face: "smile", bg: "8fb8a2" },
  { skin: "edb98a", head: "short5", facialHair: "full", accessories: "", face: "calm", bg: "d8b4a0" },
  { skin: "694d3d", head: "longCurly", facialHair: "", accessories: "", face: "smileBig", bg: "a3a9b8" },
  { skin: "ffdbb4", head: "grayShort", facialHair: "moustache4", accessories: "", face: "smile", bg: "bda389" },
];

export function buildYouUrl(params, size = 256) {
  const q = new URLSearchParams({
    size: String(size),
    seed: "you",
    skinColor: params.skin,
    head: params.head,
    face: params.face,
    backgroundColor: params.bg,
    facialHairProbability: params.facialHair ? "100" : "0",
    accessoriesProbability: params.accessories ? "100" : "0",
  });

  if (params.facialHair) {
    q.set("facialHair", params.facialHair);
  }

  if (params.accessories) {
    q.set("accessories", params.accessories);
  }

  return `https://api.dicebear.com/9.x/open-peeps/png?${q.toString()}`;
}

const YOU_KEY = "teachit.you.v2";
const LEGACY_KEY = "teachit.you.v1";

function validParams(p) {
  return (
    p &&
    YOU_OPTIONS.skin.some((o) => o.value === p.skin) &&
    YOU_OPTIONS.head.some((o) => o.value === p.head) &&
    YOU_OPTIONS.facialHair.some((o) => o.value === (p.facialHair ?? "")) &&
    YOU_OPTIONS.accessories.some((o) => o.value === (p.accessories ?? "")) &&
    YOU_OPTIONS.face.some((o) => o.value === p.face) &&
    YOU_OPTIONS.bg.some((o) => o.value === p.bg)
  );
}

export function loadYou() {
  try {
    const raw = localStorage.getItem(YOU_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (
      parsed &&
      typeof parsed.name === "string" &&
      parsed.name.trim() &&
      typeof parsed.src === "string" &&
      validParams(parsed.params)
    ) {
      return {
        name: parsed.name.trim().slice(0, 24),
        src: parsed.src,
        params: parsed.params,
      };
    }

    // A v1 profile (fixed-grid era) still renders: its preset index maps
    // onto the same params so editing picks up where the old face was.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    const match = /you-(\d+)\.png$/.exec(legacy?.face ?? "");

    if (legacy?.name && match) {
      const params = YOU_PRESETS[Number(match[1]) - 1];

      if (params) {
        return {
          name: String(legacy.name).trim().slice(0, 24),
          src: legacy.face,
          params,
        };
      }
    }
  } catch {
    // Corrupt or unavailable storage — behave as if never set up.
  }

  return null;
}

// Fetches the composed face once and stores it as a data URL so later
// renders need no network. Falls back to storing the live URL.
export async function saveYou(name, params) {
  const trimmed = String(name).trim().slice(0, 24);

  if (!trimmed || !validParams(params)) {
    return null;
  }

  const url = buildYouUrl(params);
  let src = url;

  try {
    const response = await fetch(url);

    if (response.ok) {
      const blob = await response.blob();

      src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Offline or blocked — the live URL still works when the network does.
  }

  const you = { name: trimmed, src, params };

  try {
    localStorage.setItem(YOU_KEY, JSON.stringify(you));
  } catch {
    // Usable for this session even if it can't persist.
  }

  return you;
}
