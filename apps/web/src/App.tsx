import { ErrorBoundary } from "react-error-boundary";
import Routes from "./Routes";
import ErrorFallback from "@components/ErrorFallback";
import { ClientProvider, SessionProvider } from "@repo/client";

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
