import { authRoutesMap } from "@features/auth/AuthRoutes";
import { DrawerProvider } from "@repo/ui/components/Drawer";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";

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
