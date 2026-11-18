import { Route, Switch } from "wouter";
import { passMonitorPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { RequireUnlocked } from "@/components/RequireUnlocked";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import BreachedPasswordsPage from "./BreachedPasswordsPage";
import DuplicatesPage from "./DuplicatesPage";
import InsecureWebsitesPage from "./InsecureWebsitesPage";
import MissingTwoFactorPage from "./MissingTwoFactorPage";
import OldPasswordsPage from "./OldPasswordsPage";
import PassMonitorLayout from "./PassMonitorLayout";
import PassMonitorPage from "./PassMonitorPage";
import ReusedPasswordsPage from "./ReusedPasswordsPage";
import WeakPasswordsPage from "./WeakPasswordsPage";

const NotFound = lazyPreload(() => import("@/app/NotFound"));

export default function PassMonitorRoutes() {
  return (
    <RequireUnlocked>
      <PassMonitorLayout>
        <PageMeta title="Pass Monitor" noindex />
        <RouteErrorBoundary area="records">
          <Switch>
            <Route path={passMonitorPaths.index} component={PassMonitorPage} />
            <Route path={passMonitorPaths.weak} component={WeakPasswordsPage} />
            <Route path={passMonitorPaths.reused} component={ReusedPasswordsPage} />
            <Route path={passMonitorPaths.duplicates} component={DuplicatesPage} />
            <Route path={passMonitorPaths.old} component={OldPasswordsPage} />
            <Route path={passMonitorPaths.breached} component={BreachedPasswordsPage} />
            <Route path={passMonitorPaths.insecure} component={InsecureWebsitesPage} />
            <Route path={passMonitorPaths.twoFactor} component={MissingTwoFactorPage} />
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </RouteErrorBoundary>
      </PassMonitorLayout>
    </RequireUnlocked>
  );
}
