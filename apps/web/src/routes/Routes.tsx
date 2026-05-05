import { Redirect, Route, Switch, useParams } from "wouter";
import Layout from "../layout/Layout";
import SelectedElementProvider from "../providers/SelectedElementProvider";
import EditingProvider from "../providers/EditingProvider";
import CreateEntryProvider from "../providers/CreateEntryProvider";
import { editSlug, entrySlug, newSlug } from "../data/routes";
import { Suspense, lazy, useContext } from "react";
import { SessionContext, useAutoReconnect } from "@repo/client";
import { loginRoutes } from "@/routes/LoginRoutes";

const Index = lazy(() => import("@pages/Index"));
const DisplayItem = lazy(() => import("@pages/DisplayItem"));
const NotFound = lazy(() => import("@pages/NotFound"));
const BiometricEnrollPage = lazy(() => import("@pages/auth/BiometricEnrollPage"));
const LoginRoutes = lazy(() => import("@/routes/LoginRoutes"));

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
    <Suspense fallback={null}>
      <Switch>
        {/* Login routes */}
        {Object.values(loginRoutes).map((path) => (
          <Route key={path} path={path} component={LoginRoutes} />
        ))}

        {/* Protected */}
        <Route component={ProtectedRoutes} />
      </Switch>
    </Suspense>
  );
}

export default Routes;
