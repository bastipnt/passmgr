import { Route, Switch } from "wouter";
import { Suspense, lazy } from "react";
import { DrawerProvider } from "@repo/ui/components/Drawer";
import { authRoutesMap } from "@features/auth/AuthRoutes";

const RecordRoutes = lazy(() => import("@features/record/RecordRoutes"));
const AuthRoutes = lazy(() => import("@features/auth/AuthRoutes"));

function Routes() {
  return (
    <Suspense fallback={null}>
      <DrawerProvider>
        <Switch>
          {Object.values(authRoutesMap).map((path) => (
            <Route key={path} path={path} component={AuthRoutes} />
          ))}

          <Route component={RecordRoutes} />
        </Switch>
      </DrawerProvider>
    </Suspense>
  );
}

export default Routes;
