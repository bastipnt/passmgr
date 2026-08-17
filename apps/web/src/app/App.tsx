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
import { useVaultStore } from "@/hooks/use-vault-store";
import ErrorFallback from "./ErrorFallback";
import Routes from "./routes";

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
