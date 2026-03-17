import { ErrorBoundary } from "react-error-boundary";
import Routes from "./routes/Routes";
import { ClientProvider, SessionProvider, ItemsProvider, ShortcutProvider } from "@repo/client";
import ErrorFallback from "@pages/ErrorFallback";
import { Toaster } from "@repo/ui/components/Toaster";
import { ThemeProvider } from "@repo/ui/providers/ThemeProvider";
import { StoreProvider } from "@repo/client";

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider storageKey="pass-mgr-theme">
        <SessionProvider>
          <ShortcutProvider>
            <ClientProvider>
              <StoreProvider>
                <ItemsProvider>
                  <Toaster />
                  <Routes />
                </ItemsProvider>
              </StoreProvider>
            </ClientProvider>
          </ShortcutProvider>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
