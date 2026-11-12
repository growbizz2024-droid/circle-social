import type { ThemeConfig } from "@circle/shared-types";
export const THEME_VERSION = 1;
export const THEME_COLOR_LABELS: Record<keyof ThemeConfig["colors"], string> = {
  primaryBackground: "Main background",
  secondaryBackground: "Feed background",
  surface: "Cards and panels",
  primaryAccent: "Primary accent",
  secondaryAccent: "Secondary accent",
  primaryText: "Primary text",
  secondaryText: "Muted text",
  border: "Borders and dividers",
  inputBackground: "Input background",
  inputBorder: "Input borders",
  navigationBackground: "Navigation background",
  navigationActive: "Navigation active",
  buttonText: "Button text",
};
export const DEFAULT_THEME: ThemeConfig = {
  version: 1,
  appearance: "dark",
  background: {
    type: "linear",
    stops: [
      { color: "#0B0B0B", position: 0 },
      { color: "#24130F", position: 100 },
    ],
    angle: 135,
    opacity: 0.65,
    intensity: 0.7,
    pattern: "dots",
    imageId: null,
  },
  colors: {
    primaryBackground: "#0B0B0B",
    secondaryBackground: "#101010",
    surface: "#1A1A1A",
    primaryAccent: "#FF6A00",
    secondaryAccent: "#FFB583",
    primaryText: "#FFFFFF",
    secondaryText: "#B8B8B8",
    border: "#777777",
    inputBackground: "#131313",
    inputBorder: "#777777",
    navigationBackground: "#101010",
    navigationActive: "#FF6A00",
    buttonText: "#0B0B0B",
  },
  typography: { family: "inter", baseSize: 16, lineHeight: 1.55 },
  effects: { radius: 16, shadows: true, motion: true },
};
export const THEME_PALETTES: {
  id: string;
  name: string;
  config: ThemeConfig;
}[] = [
  { id: "ember", name: "Midnight Ember", config: DEFAULT_THEME },
  {
    id: "paper",
    name: "Warm Paper",
    config: {
      ...DEFAULT_THEME,
      appearance: "light",
      background: {
        ...DEFAULT_THEME.background,
        stops: [
          { color: "#FFF7ED", position: 0 },
          { color: "#EFE8DE", position: 100 },
        ],
      },
      colors: {
        primaryBackground: "#FFF7ED",
        secondaryBackground: "#F4EDE3",
        surface: "#FFFFFF",
        primaryAccent: "#963700",
        secondaryAccent: "#763D11",
        primaryText: "#171717",
        secondaryText: "#4D4841",
        border: "#77716B",
        inputBackground: "#FFFAF4",
        inputBorder: "#77716B",
        navigationBackground: "#F5EFE7",
        navigationActive: "#963700",
        buttonText: "#FFFFFF",
      },
    } as ThemeConfig,
  },
  {
    id: "teal",
    name: "Quiet Teal",
    config: {
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_THEME.background,
        stops: [
          { color: "#091716", position: 0 },
          { color: "#122A27", position: 100 },
        ],
      },
      colors: {
        ...DEFAULT_THEME.colors,
        primaryBackground: "#091716",
        secondaryBackground: "#101E1D",
        surface: "#152825",
        inputBackground: "#0E1C1A",
        navigationBackground: "#0C1B18",
        primaryAccent: "#73E3C6",
        secondaryAccent: "#A0EED9",
        navigationActive: "#73E3C6",
        buttonText: "#081712",
      },
    },
  },
  {
    id: "violet",
    name: "Velvet Night",
    config: {
      ...DEFAULT_THEME,
      background: {
        ...DEFAULT_THEME.background,
        stops: [
          { color: "#120E1A", position: 0 },
          { color: "#25152D", position: 100 },
        ],
      },
      colors: {
        ...DEFAULT_THEME.colors,
        primaryBackground: "#120E1A",
        secondaryBackground: "#18121F",
        surface: "#21192A",
        inputBackground: "#18111E",
        navigationBackground: "#16101E",
        primaryAccent: "#C7AAFF",
        secondaryAccent: "#E3D1FF",
        navigationActive: "#C7AAFF",
      },
    },
  },
];
export function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function blend(color: string, base: string, alpha: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(color.slice(i, i + 2), 16) * alpha +
            parseInt(base.slice(i, i + 2), 16) * (1 - alpha),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function themeContrastIssues(config: ThemeConfig): string[] {
  const c = config.colors,
    issues: string[] = [],
    surfaces = [
      c.primaryBackground,
      c.secondaryBackground,
      c.surface,
      c.inputBackground,
      c.navigationBackground,
    ];
  const alpha = config.background.opacity * config.background.intensity;
  if (
    config.background.type === "linear" ||
    config.background.type === "radial"
  ) {
    const stops = [...config.background.stops].sort(
      (a, b) => a.position - b.position,
    );
    for (let i = 0; i < stops.length - 1; i++)
      for (let n = 0; n <= 8; n++)
        surfaces.push(
          blend(
            blend(stops[i + 1].color, stops[i].color, n / 8),
            c.primaryBackground,
            alpha,
          ),
        );
  }
  if (
    config.background.type === "pattern" ||
    config.background.type === "texture"
  )
    surfaces.push(blend(c.secondaryAccent, c.primaryBackground, alpha * 0.07));
  if (config.background.type === "image" && config.background.imageId)
    surfaces.push(
      blend("#FFFFFF", c.primaryBackground, alpha * 0.15),
      blend("#000000", c.primaryBackground, alpha * 0.15),
    );
  if (
    config.background.type === "pattern" ||
    config.background.type === "texture"
  )
    surfaces.push(blend(c.secondaryAccent, c.primaryBackground, alpha * 0.07));
  for (const [name, text] of [
    ["Primary text", c.primaryText],
    ["Muted text", c.secondaryText],
  ] as const)
    if (surfaces.some((bg) => contrast(text, bg) < 4.5))
      issues.push(`${name} needs 4.5:1 contrast on all backgrounds.`);
  for (const [name, color] of [
    ["Primary accent", c.primaryAccent],
    ["Secondary accent", c.secondaryAccent],
    ["Navigation active", c.navigationActive],
  ] as const)
    if (
      [c.primaryBackground, c.surface, c.navigationBackground].some(
        (bg) => contrast(color, bg) < 4.5,
      )
    )
      issues.push(`${name} needs 4.5:1 contrast against the interface.`);
  if (
    contrast(c.buttonText, c.primaryAccent) < 4.5 ||
    contrast(c.buttonText, c.navigationActive) < 4.5
  )
    issues.push(
      "Button text needs 4.5:1 contrast on accent and active backgrounds.",
    );
  if (contrast(c.inputBorder, c.inputBackground) < 3)
    issues.push("Input borders need 3:1 contrast against inputs.");
  return issues;
}
export function isThemeConfig(value: unknown): value is ThemeConfig {
  if (!value || typeof value !== "object") return false;
  const t = value as ThemeConfig;
  return (
    t.version === 1 &&
    ["dark", "light"].includes(t.appearance) &&
    !!t.colors &&
    Object.keys(THEME_COLOR_LABELS).every((k) =>
      /^#[0-9a-f]{6}$/i.test(t.colors[k as keyof typeof t.colors]),
    ) &&
    Object.keys(t.colors).length === 13 &&
    !!t.background &&
    ["solid", "linear", "radial", "pattern", "texture", "image"].includes(
      t.background.type,
    ) &&
    Array.isArray(t.background.stops) &&
    t.background.stops.length >= 2 &&
    t.background.stops.length <= 5 &&
    t.background.stops.every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        /^#[0-9a-f]{6}$/i.test(s.color) &&
        Number.isFinite(s.position) &&
        s.position >= 0 &&
        s.position <= 100,
    ) &&
    Number.isFinite(t.background.angle) &&
    t.background.angle >= 0 &&
    t.background.angle <= 360 &&
    [t.background.opacity, t.background.intensity].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    ) &&
    ["dots", "grid", "waves", "grain"].includes(t.background.pattern) &&
    (t.background.imageId === null ||
      /^[0-9a-f-]{36}$/i.test(t.background.imageId)) &&
    !!t.typography &&
    ["inter", "system", "rounded"].includes(t.typography.family) &&
    Number.isFinite(t.typography.baseSize) &&
    t.typography.baseSize >= 14 &&
    t.typography.baseSize <= 18 &&
    Number.isFinite(t.typography.lineHeight) &&
    t.typography.lineHeight >= 1.35 &&
    t.typography.lineHeight <= 1.8 &&
    !!t.effects &&
    Number.isFinite(t.effects.radius) &&
    t.effects.radius >= 4 &&
    t.effects.radius <= 28 &&
    typeof t.effects.motion === "boolean" &&
    typeof t.effects.shadows === "boolean"
  );
}
export function safeTheme(value: unknown): ThemeConfig {
  return isThemeConfig(value) && !themeContrastIssues(value).length
    ? value
    : (JSON.parse(JSON.stringify(DEFAULT_THEME)) as ThemeConfig);
}
export function themeBackgroundSvg(
  config: ThemeConfig,
  width = 1200,
  height = 1000,
): string {
  const t = isThemeConfig(config) ? config : DEFAULT_THEME,
    b = t.background,
    c = t.colors,
    alpha = b.opacity * b.intensity,
    stops = [...b.stops]
      .sort((a, z) => a.position - z.position)
      .map((s) => `<stop offset="${s.position}%" stop-color="${s.color}"/>`)
      .join(""),
    angle = (b.angle * Math.PI) / 180,
    x = (Math.cos(angle) * width) / 2,
    y = (Math.sin(angle) * height) / 2;
  let layer = "";
  if (b.type === "linear")
    layer = `<defs><linearGradient id="t" gradientUnits="userSpaceOnUse" x1="${width / 2 - x}" y1="${height / 2 - y}" x2="${width / 2 + x}" y2="${height / 2 + y}">${stops}</linearGradient></defs><rect width="100%" height="100%" fill="url(#t)" opacity="${alpha}"/>`;
  if (b.type === "radial")
    layer = `<defs><radialGradient id="t">${stops}</radialGradient></defs><rect width="100%" height="100%" fill="url(#t)" opacity="${alpha}"/>`;
  if (b.type === "pattern" || b.type === "texture") {
    const p = b.type === "texture" ? "grain" : b.pattern,
      shape =
        p === "grid"
          ? `<path d="M0 0H40V40"/>`
          : p === "waves"
            ? `<path d="M-20 20q20-25 40 0t40 0"/>`
            : p === "grain"
              ? Array.from(
                  { length: 12 },
                  (_, i) =>
                    `<circle cx="${(i * 17) % 40}" cy="${(i * 29) % 40}" r=".7"/>`,
                ).join("")
              : `<circle cx="20" cy="20" r="2"/>`;
    layer = `<defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><g fill="${p === "grid" || p === "waves" ? "none" : c.secondaryAccent}" stroke="${c.secondaryAccent}" stroke-width="1" opacity="${alpha * 0.07}">${shape}</g></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="${c.primaryBackground}"/>${layer}</svg>`;
}
export function themeBackgroundDataUri(config: ThemeConfig) {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(themeBackgroundSvg(config))
  );
}
export function themeCssVariables(config: ThemeConfig): Record<string, string> {
  const t = isThemeConfig(config) ? config : DEFAULT_THEME,
    c = t.colors;
  return {
    "--theme-main": c.primaryBackground,
    "--theme-feed": c.secondaryBackground,
    "--theme-surface": c.surface,
    "--theme-accent": c.primaryAccent,
    "--theme-highlight": c.secondaryAccent,
    "--theme-text": c.primaryText,
    "--theme-muted": c.secondaryText,
    "--theme-border": c.border,
    "--theme-field": c.inputBackground,
    "--theme-input-border": c.inputBorder,
    "--theme-nav": c.navigationBackground,
    "--theme-nav-active": c.navigationActive,
    "--theme-button-text": c.buttonText,
    "--theme-radius": `${t.effects.radius}px`,
    "--theme-font-size": `${t.typography.baseSize}px`,
    "--theme-line-height": String(t.typography.lineHeight),
    "--theme-bg-image": `url("${themeBackgroundDataUri(t)}")`,
  };
}
