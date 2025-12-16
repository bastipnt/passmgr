import { Route, Switch } from "wouter";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import ClientProvider from "./providers/ClientProvider";
import SelectedElementProvider from "./providers/SelectedElementProvider";
import DisplayEntry from "./data-components/DisplayEntry";
import { editSlug, entrySlug } from "./data/routes";
import EditEntry from "./data-components/EditEntry";

function App() {
  return (
    <Switch>
      <ClientProvider>
        <SelectedElementProvider>
          <Route path="/" nest>
            <Layout>
              <Index />
              <Route path={`/${entrySlug}/:entryId`} component={DisplayEntry} />
              <Route path={`/${editSlug}/:entryId`} component={EditEntry} />
            </Layout>
          </Route>
        </SelectedElementProvider>
      </ClientProvider>
      <Route>404 Page not found!</Route>
    </Switch>
  );
}

export default App;
