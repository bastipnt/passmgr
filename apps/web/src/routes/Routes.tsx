import { Redirect, Route, Switch, useParams } from "wouter";
import RecordLayout from "../features/record/layout/RecordLayout";
import SelectedElementProvider from "../providers/SelectedElementProvider";
import EditingProvider from "../providers/EditingProvider";
import CreateEntryProvider from "../providers/CreateEntryProvider";
import { editSlug, entrySlug, newSlug } from "../data/routes";
import { Suspense, lazy, useContext } from "react";
import { SessionContext, useAutoReconnect } from "@repo/client";
import { loginRoutes } from "@/routes/LoginRoutes";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { RecordMobileDrawer } from "@features/record/pages/RecordMobileDrawer";
import { DrawerProvider } from "@repo/ui/components/Drawer";

const Index = lazy(() => import("@pages/Index"));
const RecordPage = lazy(() => import("@features/record/pages/RecordPage"));
const NotFound = lazy(() => import("@pages/NotFound"));
const BiometricEnrollPage = lazy(() => import("@pages/auth/BiometricEnrollPage"));
const LoginRoutes = lazy(() => import("@/routes/LoginRoutes"));

function DefaultLayoutRoutes() {
  const isMobile = useIsMobile();
  return (
    <RecordLayout>
      <Switch>
        <Route path="/" component={isMobile ? undefined : Index} />
        <Route path={`/${entrySlug}/:entryId`} component={isMobile ? undefined : RecordPage} />
      </Switch>
      {isMobile && <RecordMobileDrawer />}
    </RecordLayout>
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
    <DrawerProvider>
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
    </DrawerProvider>
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
