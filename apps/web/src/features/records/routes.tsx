import { SessionContext, useAutoReconnect } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, recordPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import CreateRecordSheet from "./CreateRecordSheet";
import MobileRecordPage from "./MobileRecordPage";
import MobileVault from "./MobileVault";
import RecordLayout from "./RecordLayout";

const NotFound = lazy(() => import("@/app/NotFound"));

const RecordsEmptyState = lazy(() => import("./RecordsEmptyState"));
const RecordPage = lazy(() => import("./RecordPage"));

export default function RecordRoutes() {
  const { vaultUnlocked } = useContext(SessionContext);
  useAutoReconnect();
  const isMobile = useIsMobile();

  if (!vaultUnlocked) return <Redirect to={authPaths.login} />;

  return (
    <RecordLayout>
      <PageMeta title="Vault" noindex />
      {/* Phones get their own pages, imported eagerly: a page that suspends
          mid-transition would slide in blank. */}
      <Switch>
        <Route path={recordPaths.index} component={isMobile ? MobileVault : RecordsEmptyState} />
        {/* Sub-routes are enumerated rather than matched with a wildcard:
            a wildcard would render a bare RecordPage for any unknown sub-path
            and swallow the NotFound catch-all below. */}
        <Route path={recordPaths.detail} component={isMobile ? MobileRecordPage : RecordPage} />
        <Route path={recordPaths.edit} component={isMobile ? MobileRecordPage : RecordPage} />
        <Route path={recordPaths.versions} component={isMobile ? MobileRecordPage : RecordPage} />

        <Route>
          <NotFound />
        </Route>
      </Switch>

      {/* Siblings of the Switch: these outlive their own close navigation, so
          they can animate out before the route changes. */}
      <CreateRecordSheet />
    </RecordLayout>
  );
}
