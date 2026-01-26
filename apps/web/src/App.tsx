import { Route, Switch } from "wouter";
import Layout from "./layout/Layout";
import Index from "./pages/Index";
import ClientProvider from "./providers/ClientProvider";
import SelectedElementProvider from "./providers/SelectedElementProvider";
import DisplayEntry from "./pages/DisplayEntry";
import { editSlug, entrySlug } from "./data/routes";
import EditEntry from "./pages/EditEntry";

function App() {
  return (
    <Switch>
      <ClientProvider>
        <SelectedElementProvider>
          <Switch>
            <Route path={`/${editSlug}/:entryId`} component={EditEntry} />

            <Route path="/" nest>
              <Layout>
                <Index />
                <Route path={`/${entrySlug}/:entryId`} component={DisplayEntry} />
              </Layout>
            </Route>
          </Switch>
        </SelectedElementProvider>
      </ClientProvider>
      <Route>404 Page not found!</Route>
    </Switch>
  );
}

export default App;
