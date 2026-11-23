import { SortedRecordsProvider } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { Route, Switch } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { RequireUnlocked } from "@/components/RequireUnlocked";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import CreateRecordSheet from "./CreateRecordSheet";
import EditRecordSheet from "./EditRecordSheet";
import MobileRecordPage from "./MobileRecordPage";
import MobileVault from "./MobileVault";
import RecordLayout from "./RecordLayout";

const NotFound = lazyPreload(() => import("@/app/NotFound"));

const RecordsEmptyState = lazyPreload(() => import("./RecordsEmptyState"));
const RecordPage = lazyPreload(() => import("./RecordPage"));

export default function RecordRoutes() {
  return (
    <RequireUnlocked>
      <Records />
    </RequireUnlocked>
  );
}

function Records() {
  const isMobile = useIsMobile();

  // One provider above the phone / desktop branch: crossing 640px keeps the search and filters.
  return (
    <SortedRecordsProvider>
      <RecordLayout>
        <PageMeta title="Vault" noindex />
        {/* Phones get their own pages, imported eagerly: a page that suspends
          mid-transition would slide in blank. */}
        <RouteErrorBoundary area="records">
          <Switch>
            <Route
              path={recordPaths.index}
              component={isMobile ? MobileVault : RecordsEmptyState}
            />
            {/* Sub-routes are enumerated rather than matched with a wildcard:
            a wildcard would render a bare RecordPage for any unknown sub-path
            and swallow the NotFound catch-all below. */}
            <Route path={recordPaths.detail} component={isMobile ? MobileRecordPage : RecordPage} />
            <Route path={recordPaths.edit} component={isMobile ? MobileRecordPage : RecordPage} />
            <Route
              path={recordPaths.versions}
              component={isMobile ? MobileRecordPage : RecordPage}
            />

            <Route>
              <NotFound />
            </Route>
          </Switch>
        </RouteErrorBoundary>
      </RecordLayout>

      {/* Outside the routes and the layout: they outlive their own close navigation
          (so they can animate out before the route changes), the desktop's
          "no results" page, which replaces the routes, and the phone / desktop page swap. */}
      <CreateRecordSheet />
      <EditRecordSheet />
    </SortedRecordsProvider>
  );
}
