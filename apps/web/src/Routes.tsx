import { Redirect, Route, Switch } from "wouter";
import Layout from "./layout/Layout";
import Index from "@pages/Index";
import SelectedElementProvider from "./providers/SelectedElementProvider";
import { editSlug, entrySlug, newSlug } from "./data/routes";
import EditEntry from "@pages/EditEntry";
import Login from "@pages/auth/Login";
import PublicLayout from "./layout/PublicLayout";
import NotFound from "@pages/NotFound";
import Register from "@pages/auth/Register";
import { useContext } from "react";
import { SessionContext } from "@repo/client";
import NewItem from "@pages/NewItem";
import DisplayItem from "@pages/DisplayItem";

function PublicRoutes() {
  const { sessionId } = useContext(SessionContext);
  if (sessionId) return <Redirect to="/" />;

  return (
    <PublicLayout>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route>
          <NotFound />
        </Route>
      </Switch>
    </PublicLayout>
  );
}

function DefaultLayoutRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Index} />
        <Route path={`/${entrySlug}/:entryId`} component={DisplayItem} />
      </Switch>
    </Layout>
  );
}

function OverlayLayoutRoutes() {
  return (
    <Switch>
      <Route path={`/${editSlug}/:entryId`} component={EditEntry} />
      <Route path={`/${newSlug}`} component={NewItem} />
    </Switch>
  );
}

function ProtectedRoutes() {
  const { sessionId } = useContext(SessionContext);
  if (!sessionId) return <Redirect to="/login" />;

  return (
    <SelectedElementProvider>
      <Switch>
        {/* Default Layout */}
        <Route path="/" component={DefaultLayoutRoutes} />
        <Route path={`/${entrySlug}/:entryId`} component={DefaultLayoutRoutes} />

        {/* Overlay Layout */}
        <Route path={`/${editSlug}/:entryId`} component={OverlayLayoutRoutes} />
        <Route path={`/${newSlug}`} component={OverlayLayoutRoutes} />

        <Route>
          <NotFound />
        </Route>
      </Switch>
    </SelectedElementProvider>
  );
}

// TODO: error boundary???
function Routes() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/login" component={PublicRoutes} />
      <Route path="/register" component={PublicRoutes} />

      {/* Protected */}
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

export default Routes;
