import { DrawerProvider } from "@repo/ui/components/Drawer";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { authPaths, settingsPaths } from "./route-paths";

const RecordRoutes = lazy(() => import("@/features/records"));
const AuthRoutes = lazy(() => import("@/features/auth"));
const SettingsRoutes = lazy(() => import("@/features/settings"));

function Routes() {
  return (
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
  );
}

export default Routes;
