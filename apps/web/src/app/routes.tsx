import { DrawerProvider } from "@repo/ui/components/Drawer";
import { Suspense } from "react";
import { Route, Router, Switch } from "wouter";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import { PageTransitions, usePageLocation, usePageSearch } from "./page-transitions";
import { authPaths, pageDepths, passMonitorPaths, settingsPaths } from "./route-paths";
import { SettingsReturnTracker } from "./settings-return";
import { VaultLock } from "./VaultLock";

const RecordRoutes = lazyPreload(() => import("@/features/records"));
const AuthRoutes = lazyPreload(() => import("@/features/auth"));
const SettingsRoutes = lazyPreload(() => import("@/features/settings"));
const PassMonitorRoutes = lazyPreload(() => import("@/features/pass-monitor"));

function Routes() {
  return (
    <Router hook={usePageLocation} searchHook={usePageSearch}>
      <PageTransitions pageDepths={pageDepths} />
      <SettingsReturnTracker />
      <VaultLock />
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

            <Route path={passMonitorPaths.any}>
              <RouteErrorBoundary area="records">
                <PassMonitorRoutes />
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
