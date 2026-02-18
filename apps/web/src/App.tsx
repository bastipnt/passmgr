import { ErrorBoundary } from "react-error-boundary";
import Routes from "./Routes";
import { ClientProvider, SessionProvider } from "@repo/client";
import ErrorFallback from "@pages/ErrorFallback";

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <SessionProvider>
        <ClientProvider>
          <Routes />
        </ClientProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}

export default App;
