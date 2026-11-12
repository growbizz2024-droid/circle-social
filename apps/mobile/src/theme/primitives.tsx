import { createContext, useContext, forwardRef, type ElementRef } from "react";
import * as RN from "react-native";
import type { ThemeConfig } from "@circle/shared-types";
import {
  SafeAreaView as NativeSafeAreaView,
  type SafeAreaViewProps,
} from "react-native-safe-area-context";
import { useAppTheme } from "./store";
const Foreground = createContext<string | undefined>(undefined);
const Navigation = createContext(false);
function mapColor(
  value: unknown,
  t: ThemeConfig,
  kind: "text" | "background" | "border" | "tint",
  foreground?: string,
): unknown {
  if (typeof value !== "string") return value;
  let h = value.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h))
    h =
      "#" +
      h
        .slice(1)
        .split("")
        .map((x) => x + x)
        .join("");
  const base = h.slice(0, 7),
    alpha = /^#[0-9a-f]{8}$/.test(h) ? h.slice(7) : "";
  const c = t.colors;
  const dark = ["#0b0b0b", "#000000", "#111111", "#171717"],
    surface = [
      "#1a1a1a",
      "#151515",
      "#181818",
      "#202020",
      "#ffffff",
      "#fff7ed",
      "#fffaf4",
      "#f4ede3",
    ],
    muted = ["#a3a3a3", "#888888", "#66615b", "#999999", "#bbbbbb", "#cccccc"],
    border = ["#2a2a2a", "#333333", "#e6ddd2", "#444444"];
  let next: string | undefined;
  if (kind === "text" || kind === "tint") {
    if (
      foreground &&
      [
        "#0b0b0b",
        "#111111",
        "#000000",
        "#171717",
        "#ffffff",
        "#1a1a1a",
      ].includes(base)
    )
      next = foreground;
    else if (dark.includes(base) || base === "#ffffff" || base === "#1a1a1a")
      next = c.primaryText;
    else if (muted.includes(base)) next = c.secondaryText;
  } else if (kind === "background") {
    if (dark.includes(base) || base === "#fff7ed") next = c.primaryBackground;
    else if (surface.includes(base)) next = c.surface;
    else if (base === "#131313") next = c.inputBackground;
  } else if (border.includes(base)) next = c.border;
  if (["#ff6a00", "#ff5a0a", "#9d4200", "#963700", "#ffa552", "#4f46e5", "#0f766e", "#be185d", "#92400e"].includes(base))
    next = base === "#ffa552" ? c.secondaryAccent : c.primaryAccent;
  if (base === "#fb7185" || base === "#9f1239")
    next = t.appearance === "light" ? "#9F1239" : "#FF91A4";
  if (base === "#86efac" || base === "#166534")
    next = t.appearance === "light" ? "#166534" : "#A1F3BA";
  if (foreground && (kind === "text" || kind === "tint")) return foreground;
  return next ? next + alpha : value;
}
function resolve(
  style: unknown,
  t: ThemeConfig | null,
  text = false,
  fg?: string,
): unknown {
  if (!t) return style;
  const flat = {
    ...RN.StyleSheet.flatten(style as RN.StyleProp<RN.ViewStyle>),
  } as Record<string, unknown>;
  for (const key of Object.keys(flat))
    if (/color$/i.test(key))
      flat[key] = mapColor(
        flat[key],
        t,
        key === "backgroundColor"
          ? "background"
          : key === "color"
            ? "text"
            : key === "tintColor"
              ? "tint"
              : "border",
        fg,
      );
  if (text) {
    const size = typeof flat.fontSize === "number" ? flat.fontSize : 14;
    flat.fontSize = (size * t.typography.baseSize) / 16;
    flat.lineHeight = Number(flat.fontSize) * t.typography.lineHeight;
    flat.fontFamily =
      t.typography.family === "system"
        ? undefined
        : t.typography.family === "rounded"
          ? "Chillax"
          : "Inter";
    if (!flat.color) flat.color = fg ?? t.colors.primaryText;
  }
  if (
    typeof flat.borderRadius === "number" &&
    flat.borderRadius >= 4 &&
    flat.borderRadius <= 28
  )
    flat.borderRadius = t.effects.radius;
  if (
    flat.flex === 1 &&
    typeof flat.backgroundColor === "string" &&
    flat.backgroundColor === t.colors.primaryBackground
  )
    flat.backgroundColor = "transparent";
  if (!t.effects.shadows) {
    flat.shadowOpacity = 0;
    flat.elevation = 0;
  }
  return flat;
}
export const View = forwardRef<ElementRef<typeof RN.View>, RN.ViewProps>(
  (p, r) => {
    const t = useAppTheme();
    const navigation = p.nativeID === "theme-navigation";
    return (
      <RN.View
        {...p}
        ref={r}
        style={[
          resolve(p.style, t) as RN.ViewStyle,
          navigation && t
            ? {
                backgroundColor: t.colors.navigationBackground,
                borderColor: t.colors.border,
              }
            : undefined,
        ]}
      >
        {navigation ? (
          <Navigation.Provider value={true}>{p.children}</Navigation.Provider>
        ) : (
          p.children
        )}
      </RN.View>
    );
  },
);
export const Text = forwardRef<ElementRef<typeof RN.Text>, RN.TextProps>(
  (p, r) => {
    const t = useAppTheme(),
      fg = useContext(Foreground);
    return (
      <RN.Text
        {...p}
        ref={r}
        style={resolve(p.style, t, true, fg) as RN.TextStyle}
      />
    );
  },
);
export const TextInput = forwardRef<
  ElementRef<typeof RN.TextInput>,
  RN.TextInputProps
>((p, r) => {
  const t = useAppTheme();
  return (
    <RN.TextInput
      {...p}
      ref={r}
      placeholderTextColor={t?.colors.secondaryText ?? p.placeholderTextColor}
      selectionColor={t?.colors.secondaryAccent ?? p.selectionColor}
      style={
        t
          ? [
              resolve(p.style, t, true) as RN.TextStyle,
              {
                backgroundColor: t.colors.inputBackground,
                borderColor: t.colors.inputBorder,
                color: t.colors.primaryText,
              },
            ]
          : p.style
      }
    />
  );
});
export const Pressable = forwardRef<
  ElementRef<typeof RN.Pressable>,
  RN.PressableProps
>((p, r) => {
  const t = useAppTheme(),
    style =
      typeof p.style === "function" ? p.style({ pressed: false }) : p.style,
    flat = RN.StyleSheet.flatten(style),
    active =
      !!t &&
      typeof flat?.backgroundColor === "string" &&
      [
        "#ff6a00",
        "#ff5a0a",
        "#9d4200",
        t.colors.primaryAccent.toLowerCase(),
        t.colors.navigationActive.toLowerCase(),
      ].includes(flat.backgroundColor.toLowerCase());
  const navigation = useContext(Navigation);
  const fg =
    navigation && p.accessibilityState?.selected
      ? t?.colors.navigationActive
      : active
        ? t?.colors.buttonText
        : undefined;
  return (
    <RN.Pressable
      {...p}
      ref={r}
      style={
        typeof p.style === "function"
          ? (s) =>
              resolve(
                (
                  p.style as (
                    s: RN.PressableStateCallbackType,
                  ) => RN.StyleProp<RN.ViewStyle>
                )(s),
                t,
              ) as RN.ViewStyle
          : (resolve(p.style, t) as RN.ViewStyle)
      }
    >
      {typeof p.children === "function" ? (
        (s) => (
          <Foreground.Provider value={fg}>
            {(
              p.children as (
                s: RN.PressableStateCallbackType,
              ) => React.ReactNode
            )(s)}
          </Foreground.Provider>
        )
      ) : (
        <Foreground.Provider value={fg}>{p.children}</Foreground.Provider>
      )}
    </RN.Pressable>
  );
});
export const ScrollView = forwardRef<RN.ScrollViewInstance, RN.ScrollViewProps>(
  (p, r) => {
    const t = useAppTheme();
    return (
      <RN.ScrollView
        {...p}
        ref={r}
        style={resolve(p.style, t) as RN.ViewStyle}
        contentContainerStyle={
          resolve(p.contentContainerStyle, t) as RN.ViewStyle
        }
      />
    );
  },
);
export const Image = forwardRef<ElementRef<typeof RN.Image>, RN.ImageProps>(
  (p, r) => {
    const t = useAppTheme(),
      fg = useContext(Foreground);
    return (
      <RN.Image
        {...p}
        ref={r}
        style={resolve(p.style, t, false, fg) as RN.ImageStyle}
      />
    );
  },
);
export const ImageBackground = forwardRef<
  ElementRef<typeof RN.ImageBackground>,
  RN.ImageBackgroundProps
>((p, r) => {
  const t = useAppTheme();
  return (
    <RN.ImageBackground
      {...p}
      ref={r}
      source={t ? undefined : p.source}
      style={resolve(p.style, t) as RN.ViewStyle}
    />
  );
});
export const SafeAreaView = forwardRef<
  ElementRef<typeof NativeSafeAreaView>,
  SafeAreaViewProps
>((p, r) => {
  const t = useAppTheme();
  return (
    <NativeSafeAreaView
      {...p}
      ref={r}
      style={resolve(p.style, t) as RN.ViewStyle}
    />
  );
});
export function Modal(p: RN.ModalProps) {
  const t = useAppTheme();
  return (
    <RN.Modal
      {...p}
      animationType={t && !t.effects.motion ? "none" : p.animationType}
    />
  );
}
