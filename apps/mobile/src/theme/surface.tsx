import { useEffect, useState, type ReactNode } from "react";
import { View, Image, useWindowDimensions, AppState } from "react-native";
import { SvgXml } from "react-native-svg";
import { themeBackgroundSvg } from "@circle/design-tokens";
import { api, authenticatedMediaSource } from "../lib/session";
import { useAppTheme } from "./store";
import * as SecureStore from "expo-secure-store";
export function ThemeBackground() {
  const t = useAppTheme(),
    { width, height } = useWindowDimensions(),
    [source, setSource] = useState<{
      uri: string;
      headers: Record<string, string>;
    } | null>(null);
  useEffect(() => {
    let live = true;
    if (t?.background.imageId)
      void authenticatedMediaSource("/v1/media/" + t.background.imageId)
        .then((x) => {
          if (live) setSource(x);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [t?.background.imageId]);
  if (!t) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <SvgXml
        xml={themeBackgroundSvg(t, width, height)}
        width={width}
        height={height}
      />
      {t.background.type === "image" && source && (
        <Image
          source={source}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: t.background.opacity * t.background.intensity * 0.15,
          }}
        />
      )}
    </View>
  );
}
export default function ThemeSurface({ children }: { children: ReactNode }) {
  const t = useAppTheme();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void SecureStore.getItemAsync("circle.session")
          .then((token) => {
            if (token) return api("themes/state");
          })
          .catch(() => {});
    });
    return () => sub.remove();
  }, []);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t?.colors.primaryBackground ?? "#0B0B0B",
      }}
    >
      <ThemeBackground />
      {children}
    </View>
  );
}
