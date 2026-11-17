import { WebsiteIconsContext } from "@repo/ui-shared";
import { createContext, type ReactNode, useContext } from "react";
import { useWebsiteIconsPreference } from "../hooks/use-website-icons";
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
  return (
    <PreferencesContext value={store}>
      <WebsiteIcons>{children}</WebsiteIcons>
    </PreferencesContext>
  );
}

function WebsiteIcons({ children }: { children: ReactNode }) {
  const [enabled] = useWebsiteIconsPreference();
  return <WebsiteIconsContext value={enabled}>{children}</WebsiteIconsContext>;
}
