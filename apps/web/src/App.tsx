import Index from "./pages/Index";
import ClientProvider from "./providers/ClientProvider";

function App() {
  return (
    <ClientProvider>
      <Index />
    </ClientProvider>
  );
}

export default App;
