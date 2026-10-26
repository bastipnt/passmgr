import { type AccentPreset, DEFAULT_ACCENT, parseAccent } from "@repo/ui-shared";
import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

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

const accentStorageKey = (storageKey: string) => `${storageKey}-accent`;

const readStoredAccent = (storageKey: string) =>
  parseAccent(localStorage.getItem(accentStorageKey(storageKey)));

/**
 * Sets the stored accent on <html> before React renders, so the auth screens
 * don't flash Berry first. From the bundled entry, not an inline script: the
 * CSP allows no inline script and the build-integrity hashes cover the bundle.
 */
export function applyStoredAccent(storageKey: string) {
  document.documentElement.dataset.accent = readStoredAccent(storageKey);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  );
  const [accent, setAccent] = useState(() => readStoredAccent(storageKey));

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
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    accent,
    setAccent: (accent: AccentPreset) => {
      localStorage.setItem(accentStorageKey(storageKey), accent);
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
