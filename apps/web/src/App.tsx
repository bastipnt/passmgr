import { ErrorBoundary } from "react-error-boundary";
import Routes from "./Routes";
import { ClientProvider, SessionProvider } from "@repo/client";
import ErrorFallback from "@pages/ErrorFallback";
import { Toaster } from "@repo/ui/components/Toaster";
import { ThemeProvider } from "@repo/ui/providers/ThemeProvider";

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider storageKey="pass-mgr-theme">
        <SessionProvider>
          <ClientProvider>
            <Toaster />
            <Routes />
          </ClientProvider>
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
