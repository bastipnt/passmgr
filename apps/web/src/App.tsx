import { ErrorBoundary } from "react-error-boundary";
import Routes from "./Routes";
import ClientProvider from "./providers/ClientProvider";
import SessionProvider from "./providers/SessionProvider";
import ErrorFallback from "@components/ErrorFallback";

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
