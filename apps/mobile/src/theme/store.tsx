import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isThemeConfig, themeContrastIssues } from "@circle/design-tokens";
import type { ThemeConfig } from "@circle/shared-types";
let current: ThemeConfig | null = null;
const listeners = new Set<() => void>();
export function setAppTheme(config: unknown) {
  const next =
    isThemeConfig(config) && !themeContrastIssues(config).length
      ? config
      : null;
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  current = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const Override = createContext<ThemeConfig | null | undefined>(undefined);
export function useAppTheme() {
  const global = useSyncExternalStore(
      subscribe,
      () => current,
      () => null,
    ),
    local = useContext(Override);
  return local === undefined ? global : local;
}
export function ThemeScope({
  config,
  children,
}: {
  config: ThemeConfig | null;
  children: ReactNode;
}) {
  return <Override.Provider value={config}>{children}</Override.Provider>;
}
