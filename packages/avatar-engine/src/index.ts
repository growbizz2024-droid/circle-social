import type { AvatarConfig, AvatarSpec } from "@circle/shared-types";
export const AVATAR_VERSION = 1;
const options = (items: readonly string[]) =>
  items.map((id) => ({
    id,
    label: id.replaceAll("-", " ").replace(/\b\w/g, (x) => x.toUpperCase()),
  }));
export const AVATAR_OPTIONS = {
  style: options(["faceless", "abstract", "expressive"]),
  head: options(["oval", "round", "angular", "pill"]),
  body: options(["relaxed", "broad", "tapered"]),
  skinTone: options([
    "porcelain",
    "sand",
    "warm-beige",
    "olive",
    "golden",
    "caramel",
    "umber",
    "cocoa",
    "espresso",
    "deep",
  ]),
  hair: options([
    "crop",
    "swept",
    "waves",
    "curls",
    "locs",
    "bob",
    "long",
    "bun",
    "shaved",
  ]),
  hairColor: options([
    "ink",
    "espresso",
    "chestnut",
    "copper",
    "honey",
    "silver",
    "plum",
    "teal",
  ]),
  outfit: options([
    "hoodie",
    "bomber",
    "knit",
    "tee",
    "blazer",
    "jersey",
    "techwear",
    "future",
  ]),
  accessory: options([
    "none",
    "round-glasses",
    "shades",
    "headphones",
    "cap",
    "beanie",
    "visor",
  ]),
  background: options([
    "ember-gradient",
    "night-solid",
    "cream-solid",
    "orange-solid",
    "plum-gradient",
    "teal-gradient",
    "orbital-abstract",
    "contour-abstract",
  ]),
} as const;
export type AvatarAttribute = keyof typeof AVATAR_OPTIONS;
export const AVATAR_LABELS: Record<AvatarAttribute, string> = {
  style: "Avatar style",
  head: "Head shape",
  body: "Body shape",
  skinTone: "Skin tone",
  hair: "Hairstyle",
  hairColor: "Hair color",
  outfit: "Outfit",
  accessory: "Accessories",
  background: "Background",
};
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function generateAvatar(seed: string): AvatarSpec {
  seed = /^[A-Za-z0-9_-]{1,100}$/.test(seed)
    ? seed
    : "seed-" + hash(seed).toString(36);
  let state = hash(seed) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const config = {} as AvatarConfig;
  for (const key of Object.keys(AVATAR_OPTIONS) as AvatarAttribute[]) {
    const list = AVATAR_OPTIONS[key];
    config[key] = list[Math.floor(next() * list.length)].id;
  }
  return { version: 1, seed, config };
}
export function isAvatarSpec(value: unknown): value is AvatarSpec {
  if (!value || typeof value !== "object") return false;
  const s = value as AvatarSpec;
  return (
    s.version === 1 &&
    typeof s.seed === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(s.seed) &&
    !!s.config &&
    typeof s.config === "object" &&
    Object.keys(s.config).length === 9 &&
    (Object.keys(AVATAR_OPTIONS) as AvatarAttribute[]).every((k) =>
      AVATAR_OPTIONS[k].some((o) => o.id === s.config[k]),
    )
  );
}
export function avatarOrFallback(
  value: unknown,
  seed = "circle-fallback",
): AvatarSpec {
  return isAvatarSpec(value)
    ? value
    : generateAvatar(
        seed.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "circle-fallback",
      );
}
const skin: Record<string, string> = {
  porcelain: "#F2D4C3",
  sand: "#E8BD99",
  "warm-beige": "#D8A47C",
  olive: "#B58C61",
  golden: "#C98C4C",
  caramel: "#AB713F",
  umber: "#8D5736",
  cocoa: "#71442E",
  espresso: "#523225",
  deep: "#37251F",
};
const hair: Record<string, string> = {
  ink: "#151618",
  espresso: "#2B1D1A",
  chestnut: "#5B3427",
  copper: "#AA542D",
  honey: "#BE9557",
  silver: "#B7B9BD",
  plum: "#63445C",
  teal: "#2A6666",
};
function shade(hex: string, factor: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * factor))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function renderAvatarSvg(
  input: unknown,
  fallbackSeed = "circle-fallback",
): string {
  const s = avatarOrFallback(input, fallbackSeed),
    c = Object.fromEntries(
      (Object.keys(AVATAR_OPTIONS) as AvatarAttribute[]).map((k) => [
        k,
        s.config[k],
      ]),
    ) as unknown as AvatarConfig,
    p = "a" + hash(s.seed + JSON.stringify(c)).toString(36),
    face = skin[c.skinTone],
    locks = hair[c.hairColor],
    outfit = ["hoodie", "bomber", "tee", "jersey"].includes(c.outfit)
      ? "#FF5A0A"
      : c.outfit === "knit"
        ? "#A99680"
        : c.outfit === "blazer"
          ? "#343842"
          : "#20282C";
  const gradient = (id: string, color: string, shadow = shade(color, 0.35)) =>
    `<linearGradient id="${p}${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${shade(color, 1.2)}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${shadow}"/></linearGradient>`;
  const head =
    c.head === "round"
      ? '<rect x="73" y="59" width="110" height="122" rx="54"/>'
      : c.head === "angular"
        ? '<path d="M78 90Q78 54 128 54Q178 54 178 90L174 146Q170 167 128 181Q86 167 82 146Z"/>'
        : c.head === "pill"
          ? '<rect x="84" y="48" width="89" height="139" rx="44"/>'
          : '<ellipse cx="128" cy="118" rx="49" ry="65"/>';
  const shoulder =
    c.body === "broad"
      ? "M27 256V234Q26 187 99 179L156 179Q228 187 229 234V256Z"
      : c.body === "tapered"
        ? "M64 256 54 217Q58 187 105 179L151 179Q198 187 202 217L192 256Z"
        : "M43 256V226Q45 190 101 179L155 179Q211 190 213 226V256Z";
  const hairShapes: Record<string, string> = {
    crop: '<path d="M77 103Q59 49 109 43Q165 27 183 75L176 105 161 77Q113 90 88 73Z"/>',
    swept:
      '<path d="M74 107Q56 69 85 48Q136 13 180 55L185 94Q158 89 154 65Q130 94 84 86Z"/>',
    waves:
      '<path d="M72 110Q51 76 74 58Q64 37 96 35Q111 16 133 34Q161 21 174 46Q199 52 182 95L170 111 160 74Q141 94 120 72Q104 91 84 76Z"/>',
    curls: Array.from(
      { length: 10 },
      (_, i) =>
        `<circle cx="${73 + i * 12}" cy="${65 - Math.sin((i / 9) * Math.PI) * 25}" r="19"/>`,
    ).join(""),
    locs: Array.from(
      { length: 9 },
      (_, i) =>
        `<path d="M${79 + i * 12} ${60 - Math.sin((i / 8) * Math.PI) * 14}q-8 20 ${i % 2 ? 4 : -6} ${48 + (i % 3) * 8}" fill="none" stroke="${locks}" stroke-width="14" stroke-linecap="round"/>`,
    ).join(""),
    bob: '<path d="M70 160Q48 80 82 49Q125 20 168 51Q201 85 184 166L169 161 169 82Q128 97 84 76L87 163Z"/>',
    long: '<path d="M64 203Q47 134 66 74Q76 32 128 34Q180 34 190 79L198 206 167 195 167 80Q120 94 87 75L89 196Z"/>',
    bun: '<circle cx="140" cy="36" r="26"/><path d="M76 111Q57 56 107 43Q173 24 182 80L176 111 165 72Q124 88 86 72Z"/>',
    shaved:
      '<path d="M80 84Q92 43 130 51Q164 53 177 87L169 78Q128 59 88 82Z" opacity=".65"/>',
  };
  let clothing =
    c.outfit === "hoodie"
      ? '<path d="M101 177 128 206 155 177Q171 184 171 195L128 220 85 195Q85 185 101 177Z" fill="#27282A"/><path d="M110 207v29m36-29v29" stroke="#FFD2B3" stroke-width="3" stroke-linecap="round"/><path d="M99 245q29-18 58 0" fill="none" stroke="#C33C04" stroke-width="3"/>'
      : c.outfit === "blazer"
        ? '<path d="m105 178 23 30 23-30-10 78h-26Z" fill="#E6DDCE"/><path d="m96 184 20 51-18-16m62-35-20 51 18-16" fill="none" stroke="#60636A" stroke-width="5"/>'
        : c.outfit === "future" || c.outfit === "techwear"
          ? '<path d="m69 208 24 9 11 39m83-48-24 9-11 39M128 200v56" fill="none" stroke="#FF5A0A" stroke-width="4"/><path d="M104 218h48v15h-48Z" fill="#111"/><path d="M111 225h33" stroke="#F3AA6C" stroke-width="3"/>'
          : c.outfit === "bomber"
            ? '<path d="M128 195v61M64 218l21 5m107-5-21 5" stroke="#202124" stroke-width="4"/><path d="m98 182 30 19 30-19" fill="none" stroke="#1D2024" stroke-width="8"/>'
            : c.outfit === "knit"
              ? Array.from(
                  { length: 7 },
                  (_, i) =>
                    `<path d="M${69 + i * 20} 211v45" stroke="#625A52" opacity=".3" stroke-width="3"/>`,
                ).join("")
              : '<path d="M106 181q22 26 44 0" fill="none" stroke="#202124" stroke-width="8"/>';
  if (c.outfit === "jersey")
    clothing =
      '<path d="M103 183q25 27 50 0" fill="none" stroke="#F2E8DA" stroke-width="7"/><path d="m72 211 24 45m88-45-24 45" stroke="#FFF2E4" stroke-width="12" opacity=".8"/>';
  const accessory =
    c.accessory === "round-glasses"
      ? '<g fill="none" stroke="#D5BA96" stroke-width="4"><circle cx="105" cy="116" r="18"/><circle cx="151" cy="116" r="18"/><path d="M123 114h10m-48-3-9-4m95 4 9-4"/></g>'
      : c.accessory === "shades"
        ? '<path d="M83 103h90l-7 27h-27l-10-18-10 18H91Z" fill="#14171A"/><path d="m91 108 13 6m37-6 14 6" stroke="#FFFFFF" opacity=".2" stroke-width="3"/>'
        : c.accessory === "headphones"
          ? '<path d="M70 125V99a58 58 0 0 1 116 0v26" fill="none" stroke="#25292F" stroke-width="12"/><path d="M70 124V99a58 58 0 0 1 116 0v25" fill="none" stroke="#FF5A0A" stroke-width="3"/><rect x="61" y="108" width="22" height="44" rx="10" fill="#25292F"/><rect x="173" y="108" width="22" height="44" rx="10" fill="#25292F"/>'
          : c.accessory === "cap"
            ? '<path d="M74 91q-3-53 54-54 56 0 54 54Z" fill="#252A30"/><path d="M67 89q69-19 132 9-52 12-125 2Z" fill="#FF5A0A"/><path d="M128 43v36" fill="none" stroke="#51545A" stroke-width="2"/>'
            : c.accessory === "beanie"
              ? '<path d="M71 91q0-61 57-61t57 61Z" fill="#BA6139"/><rect x="68" y="77" width="120" height="23" rx="9" fill="#E5834A"/><path d="M92 49v27m24-37v37m24-37v37m24-27v27" stroke="#824024" opacity=".6" stroke-width="3"/>'
              : c.accessory === "visor"
                ? '<rect x="78" y="100" width="101" height="32" rx="14" fill="#163C40"/><path d="M89 111h78" stroke="#78D5C8" stroke-width="3"/>'
                : "";
  const expressive =
    c.style === "expressive"
      ? '<path d="M99 112v5m58-5v5" stroke="#28201D" stroke-width="5" stroke-linecap="round"/><path d="M116 145q12 8 24 0" stroke="#68432F" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : "";
  const bg =
    c.background === "cream-solid"
      ? "#EADCCA"
      : c.background === "orange-solid"
        ? "#FF5A0A"
        : c.background === "night-solid"
          ? "#11151A"
          : `url(#${p}bg)`;
  const bgColor =
    c.background === "plum-gradient"
      ? "#68466B"
      : c.background === "teal-gradient"
        ? "#326A71"
        : "#C44C13";
  const abstract =
    c.style === "abstract"
      ? `<path d="M88 124 128 78 168 124 128 166Z" fill="url(#${p}mask)"/><circle cx="128" cy="123" r="22" fill="#FB9758" opacity=".7"/><path d="M99 116q31-17 59 0" stroke="#FFE1BA" stroke-width="3" fill="none" opacity=".6"/>`
      : expressive;
  const rings =
    c.background === "contour-abstract"
      ? `<g fill="none" stroke="#FFBA84" stroke-width="2" opacity=".2">${Array.from({ length: 6 }, (_, i) => `<path d="M-20 ${170 + i * 20}Q60 ${-30 + i * 20} 160 ${30 + i * 20}T290 ${40 + i * 20}"/>`).join("")}</g>`
      : c.background.includes("abstract")
        ? `<g fill="none" stroke="#FFAA70" opacity=".2" stroke-width="2">${Array.from({ length: 4 }, (_, i) => `<ellipse cx="${40 + (hash(s.seed) % 50)}" cy="${70 + i * 25}" rx="${110 + i * 22}" ry="${40 + i * 21}" transform="rotate(-28 128 128)"/>`).join("")}</g>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><radialGradient id="${p}skin" cx="32%" cy="28%" r="78%"><stop stop-color="${shade(face, 1.2)}"/><stop offset=".48" stop-color="${face}"/><stop offset="1" stop-color="${shade(face, 0.56)}"/></radialGradient>${gradient("body", outfit, "#11151A")}${gradient("hair", locks, "#101114")}${gradient("bg", bgColor, "#0B0B0B")}${gradient("mask", "#535D68", "#20232C")}<radialGradient id="${p}light" cx=".25" cy=".2" r=".85"><stop stop-color="#FFF" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient><clipPath id="${p}clip"><circle cx="128" cy="128" r="128"/></clipPath></defs><g clip-path="url(#${p}clip)"><rect width="256" height="256" fill="${bg}"/>${rings}<ellipse cx="132" cy="248" rx="100" ry="18" fill="#000" opacity=".35"/>${["long", "bob"].includes(c.hair) ? `<g fill="url(#${p}hair)">${hairShapes[c.hair]}</g>` : ""}<path d="${shoulder}" fill="url(#${p}body)"/>${clothing}<path d="M109 158h38v31q-19 24-38 0Z" fill="${face}"/><path d="M109 166q19 16 38 0v14q-19 10-38-1Z" fill="#000" opacity=".12"/><ellipse cx="79" cy="123" rx="9" ry="16" fill="${face}"/><ellipse cx="177" cy="123" rx="9" ry="16" fill="${face}"/><g fill="#000" opacity=".16" transform="translate(4 6)">${head}</g><g fill="url(#${p}skin)">${head}</g><g fill="url(#${p}light)" opacity=".7">${head}</g>${abstract}<g fill="url(#${p}hair)">${hairShapes[(c.accessory === "cap" || c.accessory === "beanie") && c.hair === "bun" ? "crop" : c.hair]}</g>${accessory}<path d="m63 241 14-25m104 26-6-24" stroke="#000" stroke-width="7" stroke-linecap="round" opacity=".12"/><path d="M50 226q2-20 21-29" stroke="#FFF" opacity=".08" stroke-width="5" fill="none" stroke-linecap="round"/></g></svg>`;
}
export function avatarDataUri(spec: unknown, fallbackSeed?: string): string {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(renderAvatarSvg(spec, fallbackSeed))
  );
}
