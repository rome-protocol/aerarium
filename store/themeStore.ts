// Theme preference store — lifted from a companion Aave demo's themeStore.
// Compound-on-Rome's globals.css switches palettes via the
// `html[data-theme="light"]` attribute (dark is the `:root` default), so the
// effective theme is applied as a data-theme attribute (see hooks/useTheme.ts).

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      // Distinct from the Rome web app's "the Rome web app-theme" and a companion Aave demo's
      // "rome-aave-theme" so the three apps don't share preferences when
      // served from sibling origins during local dev.
      name: "rome-compound-theme",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function resolveEffectiveTheme(
  preference: ThemePreference,
  osPrefersDark: boolean,
): EffectiveTheme {
  if (preference === "system") return osPrefersDark ? "dark" : "light";
  return preference;
}
