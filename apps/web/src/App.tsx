import { ErrorBoundary } from "react-error-boundary";
import Routes from "./Routes";
import SessionProvider from "./providers/SessionProvider";
import ErrorFallback from "@components/ErrorFallback";
import ClientProvider from "@repo/client";

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
