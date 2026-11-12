export const brand = {
  orange: "#FF6A00",
  orangeLight: "#FFA552",
  black: "#0B0B0B",
  surface: "#1A1A1A",
  cream: "#FFF7ED",
  white: "#FFFFFF",
  muted: "#A3A3A3",
  border: "#2A2A2A",
  tagline: "Real People. Open Conversations.",
} as const;
export const colors = {
  brand: brand.orange,
  background: brand.black,
  surface: brand.surface,
  text: brand.white,
  muted: brand.muted,
  border: brand.border,
  danger: "#FB7185",
  success: "#86EFAC",
} as const;
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
export const typography = {
  family: { heading: "Chillax", body: "Inter" },
  size: { small: 14, body: 16, title: 24 },
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;
export const radii = { small: 8, medium: 12, large: 24, pill: 9999 } as const;
export const shadows = {
  small: { color: "#000000", opacity: 0.08, radius: 4, offsetX: 0, offsetY: 2 },
} as const;
export const themes = {
  dark: colors,
  light: {
    ...colors,
    background: brand.cream,
    surface: "#FFFFFF",
    text: "#1A1A1A",
    muted: "#66615B",
    border: "#E6DDD2",
    danger: "#9F1239",
    success: "#166534",
  },
} as const;

export {feedIconPaths,type FeedIconName} from "./feed-icons";
export * from './theme';
