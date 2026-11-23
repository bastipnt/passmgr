import {
  ACCENT_STORAGE_KEY,
  type AccentPreset,
  DEFAULT_ACCENT,
  parseAccent,
  parseThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@repo/ui-shared";
import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { safeLocalStorage } from "../lib/safe-local-storage";

type Theme = ThemePreference;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: AccentPreset;
  setAccent: (accent: AccentPreset) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  accent: DEFAULT_ACCENT,
  setAccent: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const readStoredAccent = () => parseAccent(safeLocalStorage.get(ACCENT_STORAGE_KEY));

/**
 * Sets the stored accent on <html> before React renders, so the auth screens
 * don't flash Berry first. From the bundled entry, not an inline script: the
 * CSP allows no inline script and the build-integrity hashes cover the bundle.
 */
export function applyStoredAccent() {
  document.documentElement.dataset.accent = readStoredAccent();
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    parseThemePreference(safeLocalStorage.get(storageKey), defaultTheme),
  );
  const [accent, setAccent] = useState(readStoredAccent);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  useLayoutEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      safeLocalStorage.set(storageKey, theme);
      setTheme(theme);
    },
    accent,
    setAccent: (accent: AccentPreset) => {
      safeLocalStorage.set(ACCENT_STORAGE_KEY, accent);
      setAccent(accent);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
