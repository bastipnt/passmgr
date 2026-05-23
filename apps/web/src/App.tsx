import { ErrorBoundary } from "react-error-boundary";
import Routes from "./routes/Routes";
import {
  ClientProvider,
  SessionProvider,
  RecordsProvider,
  ShortcutProvider,
  PreferencesProvider,
} from "@repo/client";
import ErrorFallback from "@pages/ErrorFallback";
import { Toaster } from "@repo/ui/components/Toaster";
import { ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import { StoreProvider } from "@repo/client";
import { usePreferencesStore } from "@/hooks/use-preferences-store";
import { useVaultStore } from "@/hooks/use-vault-store";

function App() {
  const vaultStore = useVaultStore();
  const preferencesStore = usePreferencesStore();

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider storageKey="pass-mgr-theme">
        <PreferencesProvider store={preferencesStore}>
          <SessionProvider>
            <ShortcutProvider>
              <ClientProvider serverUrl={import.meta.env.VITE_SERVER_URL}>
                <StoreProvider vault={vaultStore}>
                  <RecordsProvider>
                    <Toaster />
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
