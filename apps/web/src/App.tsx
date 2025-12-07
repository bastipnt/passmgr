import Index from "./pages/Index";
import ClientProvider from "./providers/ClientProvider";
import SelectedElementProvider from "./providers/SelectedElementProvider";

function App() {
  return (
    <ClientProvider>
      <SelectedElementProvider>
        <Index />
      </SelectedElementProvider>
    </ClientProvider>
  );
}

export default App;
