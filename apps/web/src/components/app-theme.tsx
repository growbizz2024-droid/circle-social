"use client";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import type { AppliedTheme } from "@circle/shared-types";
import {
  isThemeConfig,
  themeContrastIssues,
  themeCssVariables,
} from "@circle/design-tokens";
export default function AppTheme({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<AppliedTheme | null>(null);
  useEffect(() => {
    let authenticated = false;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      authenticated = detail.authenticated !== false;
      const next = detail.activeTheme;
      setActive(
        next &&
          isThemeConfig(next.config) &&
          !themeContrastIssues(next.config).length
          ? next
          : null,
      );
    };
    const refresh = () => {
      if (authenticated)
        void fetch("/api/v1/themes/state", { cache: "no-store" })
          .then(async (r) => {
            if (r.status === 401) {
              authenticated = false;
              setActive(null);
            } else if (r.ok)
              receive(
                new CustomEvent("circle:theme", {
                  detail: { ...(await r.json()).data, authenticated: true },
                }),
              );
          })
          .catch(() => {});
    };
    window.addEventListener("circle:theme", receive);
    window.addEventListener("focus", refresh);
    const visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("circle:theme", receive);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement,
      keys = Object.keys(themeCssVariables(active?.config ?? ({} as never)));
    if (active) {
      const t = active.config;
      root.dataset.customTheme = "true";
      root.dataset.themeMotion = t.effects.motion ? "on" : "off";
      for (const [k, v] of Object.entries(themeCssVariables(t)))
        root.style.setProperty(k, v);
      root.style.setProperty(
        "--theme-font-family",
        t.typography.family === "system"
          ? "system-ui, sans-serif"
          : t.typography.family === "rounded"
            ? "var(--font-heading), sans-serif"
            : "var(--font-body), sans-serif",
      );
      root.style.setProperty(
        "--theme-shadow",
        t.effects.shadows ? "0 12px 36px #0002" : "none",
      );
      root.style.colorScheme = t.appearance;
    } else {
      delete root.dataset.customTheme;
      delete root.dataset.themeMotion;
      for (const k of keys) root.style.removeProperty(k);
      for (const k of ["--theme-font-family", "--theme-shadow", "color-scheme"])
        root.style.removeProperty(k);
    }
  }, [active]);
  return (
    <>
      {active && (
        <div className="app-theme-background" aria-hidden="true">
          {active.config.background.type === "image" &&
            active.config.background.imageId && (
              <Image
                unoptimized
                fill
                sizes="100vw"
                src={`/api/v1/media/${active.config.background.imageId}`}
                alt=""
                style={{
                  objectFit: "cover",
                  opacity:
                    active.config.background.opacity *
                    active.config.background.intensity *
                    0.15,
                }}
              />
            )}
        </div>
      )}
      <div className="circle-theme-content">{children}</div>
    </>
  );
}
