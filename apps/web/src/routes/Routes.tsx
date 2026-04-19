import { Redirect, Route, Switch, useParams } from "wouter";
import Layout from "../layout/Layout";
import Index from "@pages/Index";
import SelectedElementProvider from "../providers/SelectedElementProvider";
import EditingProvider from "../providers/EditingProvider";
import CreateEntryProvider from "../providers/CreateEntryProvider";
import { editSlug, entrySlug, newSlug } from "../data/routes";
import NotFound from "@pages/NotFound";
import { useContext } from "react";
import { SessionContext, useAutoReconnect } from "@repo/client";
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

function EditRedirect() {
  const { entryId } = useParams();
  return <Redirect to={`/${entrySlug}/${entryId}`} />;
}

function OverlayLayoutRoutes() {
  return (
    <Switch>
      <Route path="/enroll-biometric" component={BiometricEnrollPage} />
    </Switch>
  );
}

function ProtectedRoutes() {
  const { sessionId } = useContext(SessionContext);
  useAutoReconnect();
  if (!sessionId) return <Redirect to="/login" />;

  return (
    <EditingProvider>
      <CreateEntryProvider>
        <SelectedElementProvider>
          <Switch>
            {/* Default Layout */}
            <Route path="/" component={DefaultLayoutRoutes} />
            <Route path={`/${entrySlug}/:entryId`} component={DefaultLayoutRoutes} />

            {/* Redirect old routes */}
            <Route path={`/${editSlug}/:entryId`} component={EditRedirect} />
            <Route path={`/${newSlug}`}>
              <Redirect to="/" />
            </Route>

            {/* Overlay Layout */}
            <Route path="/enroll-biometric" component={OverlayLayoutRoutes} />

            <Route>
              <NotFound />
            </Route>
          </Switch>
        </SelectedElementProvider>
      </CreateEntryProvider>
    </EditingProvider>
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
