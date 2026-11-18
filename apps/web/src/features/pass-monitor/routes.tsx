import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { ComponentType } from "react";
import { Route, Switch } from "wouter";
import { passMonitorPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { RequireUnlocked } from "@/components/RequireUnlocked";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import BreachedPasswordsPage from "./BreachedPasswordsPage";
import DuplicatesPage from "./DuplicatesPage";
import { defaultFindingPath, useFindings } from "./findings";
import InsecureWebsitesPage from "./InsecureWebsitesPage";
import MissingTwoFactorPage from "./MissingTwoFactorPage";
import OldPasswordsPage from "./OldPasswordsPage";
import { PassMonitorProvider } from "./PassMonitorContext";
import PassMonitorLayout from "./PassMonitorLayout";
import PassMonitorPage from "./PassMonitorPage";
import ReusedPasswordsPage from "./ReusedPasswordsPage";
import WeakPasswordsPage from "./WeakPasswordsPage";

const NotFound = lazyPreload(() => import("@/app/NotFound"));

const FINDING_PAGES: Record<string, ComponentType> = {
  [passMonitorPaths.weak]: WeakPasswordsPage,
  [passMonitorPaths.reused]: ReusedPasswordsPage,
  [passMonitorPaths.duplicates]: DuplicatesPage,
  [passMonitorPaths.old]: OldPasswordsPage,
  [passMonitorPaths.breached]: BreachedPasswordsPage,
  [passMonitorPaths.insecure]: InsecureWebsitesPage,
  [passMonitorPaths.twoFactor]: MissingTwoFactorPage,
};

/** Desktop `/pass-monitor`: the first finding with something to fix, beside the list. */
function DefaultFinding() {
  const Page = FINDING_PAGES[defaultFindingPath(useFindings())];
  return <Page />;
}

export default function PassMonitorRoutes() {
  const isMobile = useIsMobile();

  return (
    <RequireUnlocked>
      <PassMonitorProvider>
        <PassMonitorLayout>
          <PageMeta title="Pass Monitor" noindex />
          <RouteErrorBoundary area="records">
            <Switch>
              <Route path={passMonitorPaths.index}>
                {isMobile ? <PassMonitorPage /> : <DefaultFinding />}
              </Route>
              {Object.entries(FINDING_PAGES).map(([path, Page]) => (
                <Route key={path} path={path} component={Page} />
              ))}
              <Route>
                <NotFound />
              </Route>
            </Switch>
          </RouteErrorBoundary>
        </PassMonitorLayout>
      </PassMonitorProvider>
    </RequireUnlocked>
  );
}
