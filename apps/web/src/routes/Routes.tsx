import { Redirect, Route, Switch } from "wouter";
import Layout from "../layout/Layout";
import Index from "@pages/Index";
import SelectedElementProvider from "../providers/SelectedElementProvider";
import { editSlug, entrySlug, newSlug } from "../data/routes";
import EditItem from "@pages/EditItem";
import NotFound from "@pages/NotFound";
import { useContext } from "react";
import { SessionContext } from "@repo/client";
import NewItem from "@pages/NewItem";
import DisplayItem from "@pages/DisplayItem";
import BiometricEnrollPage from "@pages/auth/BiometricEnrollPage";
import LoginRoutes, { loginRoutes } from "@/routes/LoginRoutes";

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
      <Route path={`/${editSlug}/:entryId`} component={EditItem} />
      <Route path={`/${newSlug}`} component={NewItem} />
      <Route path="/enroll-biometric" component={BiometricEnrollPage} />
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
        <Route path="/enroll-biometric" component={OverlayLayoutRoutes} />

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
      {/* Login routes */}
      {Object.values(loginRoutes).map((path) => (
        <Route key={path} path={path} component={LoginRoutes} />
      ))}

      {/* Protected */}
      <Route component={ProtectedRoutes} />
    </Switch>
  );
}

export default Routes;
