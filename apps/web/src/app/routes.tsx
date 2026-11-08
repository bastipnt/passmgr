import { DrawerProvider } from "@repo/ui/components/Drawer";
import { Suspense } from "react";
import { Route, Router, Switch } from "wouter";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import { PageTransitions, usePageLocation, usePageSearch } from "./page-transitions";
import { authPaths, pageDepths, settingsPaths } from "./route-paths";

const RecordRoutes = lazyPreload(() => import("@/features/records"));
const AuthRoutes = lazyPreload(() => import("@/features/auth"));
const SettingsRoutes = lazyPreload(() => import("@/features/settings"));

function Routes() {
  return (
    <Router hook={usePageLocation} searchHook={usePageSearch}>
      <PageTransitions pageDepths={pageDepths} />
      <Suspense fallback={null}>
        <DrawerProvider>
          <Switch>
            {Object.values(authPaths).map((path) => (
              <Route key={path} path={path}>
                <RouteErrorBoundary area="auth">
                  <AuthRoutes />
                </RouteErrorBoundary>
              </Route>
            ))}

            <Route path={settingsPaths.any}>
              <RouteErrorBoundary area="settings">
                <SettingsRoutes />
              </RouteErrorBoundary>
            </Route>

            <Route>
              <RouteErrorBoundary area="records">
                <RecordRoutes />
              </RouteErrorBoundary>
            </Route>
          </Switch>
        </DrawerProvider>
      </Suspense>
    </Router>
  );
}

export default Routes;
