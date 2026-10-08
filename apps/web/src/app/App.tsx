import {
  ClientProvider,
  PreferencesProvider,
  RecordsProvider,
  SessionProvider,
  ShortcutProvider,
  StoreProvider,
} from "@repo/client";
import { Toaster } from "@repo/ui/components/Toaster";
import { ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import { ErrorBoundary } from "react-error-boundary";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { useProfileStore } from "@/hooks/use-profile-store";
import ErrorFallback from "./ErrorFallback";
import Routes from "./routes";

/** Phones: toasts sit above the vault's bottom dock (56px FABs, `MobileVault`). */
const PHONE_TOAST_BOTTOM = "calc(max(env(safe-area-inset-bottom), 1rem) + 56px + 0.75rem)";

function App() {
  const profileStore = useProfileStore();
  const preferencesStore = usePreferencesStore();

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider storageKey="pass-mgr-theme">
        <PreferencesProvider store={preferencesStore}>
          <SessionProvider>
            <ShortcutProvider>
              <ClientProvider serverUrl={import.meta.env.VITE_SERVER_URL}>
                <StoreProvider profiles={profileStore}>
                  <RecordsProvider>
                    <Toaster mobileOffset={{ bottom: PHONE_TOAST_BOTTOM }} />
                    <Routes />
                  </RecordsProvider>
                </StoreProvider>
              </ClientProvider>
            </ShortcutProvider>
          </SessionProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
