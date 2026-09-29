import { DrawerProvider } from "@repo/ui/components/Drawer";
import { lazy, Suspense } from "react";
import { Route, Router, Switch } from "wouter";
import { PageTransitions, usePageLocation, usePageSearch } from "./page-transitions";
import { authPaths, pageDepths, settingsPaths } from "./route-paths";

const RecordRoutes = lazy(() => import("@/features/records"));
const AuthRoutes = lazy(() => import("@/features/auth"));
const SettingsRoutes = lazy(() => import("@/features/settings"));

function Routes() {
  return (
    <Router hook={usePageLocation} searchHook={usePageSearch}>
      <PageTransitions pageDepths={pageDepths} />
      <Suspense fallback={null}>
        <DrawerProvider>
          <Switch>
            {Object.values(authPaths).map((path) => (
              <Route key={path} path={path} component={AuthRoutes} />
            ))}

            <Route path={settingsPaths.any} component={SettingsRoutes} />

            <Route component={RecordRoutes} />
          </Switch>
        </DrawerProvider>
      </Suspense>
    </Router>
  );
}

export default Routes;
