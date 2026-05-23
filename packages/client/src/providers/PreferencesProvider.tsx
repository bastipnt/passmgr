import { createContext, useContext, type ReactNode } from "react";
import type { PreferencesStore } from "../preferences/PreferencesStore";

const PreferencesContext = createContext<PreferencesStore | null>(null);

export function usePreferences(): PreferencesStore {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

type PreferencesProviderProps = {
  store: PreferencesStore;
  children: ReactNode;
};

export function PreferencesProvider({ store, children }: PreferencesProviderProps) {
  return <PreferencesContext value={store}>{children}</PreferencesContext>;
}
