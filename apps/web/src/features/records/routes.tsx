import { SessionContext, useAutoReconnect } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, recordPaths } from "@/app/route-paths";
import CreateRecordSheet from "./CreateRecordSheet";
import RecordLayout from "./RecordLayout";
import { RecordMobileDrawer } from "./RecordMobileDrawer";
import VersionsSheet from "./versions/VersionsSheet";

const NotFound = lazy(() => import("@/app/NotFound"));

const RecordsEmptyState = lazy(() => import("./RecordsEmptyState"));
const RecordPage = lazy(() => import("./RecordPage"));

export default function RecordRoutes() {
  const { sessionId } = useContext(SessionContext);
  useAutoReconnect();
  const isMobile = useIsMobile();

  if (!sessionId) return <Redirect to={authPaths.login} />;

  return (
    <RecordLayout>
      <Switch>
        <Route path={recordPaths.index} component={isMobile ? undefined : RecordsEmptyState} />
        {/* Sub-routes are enumerated rather than matched with a wildcard:
            a wildcard would render a bare RecordPage for any unknown sub-path
            and swallow the NotFound catch-all below. */}
        <Route path={recordPaths.detail} component={isMobile ? undefined : RecordPage} />
        <Route path={recordPaths.edit} component={isMobile ? undefined : RecordPage} />
        <Route path={recordPaths.versions} component={isMobile ? undefined : RecordPage} />

        <Route>
          <NotFound />
        </Route>
      </Switch>

      {isMobile && <RecordMobileDrawer />}
      {/* Siblings of the Switch: these outlive their own close navigation, so
          they can animate out before the route changes. */}
      <VersionsSheet />
      <CreateRecordSheet />
    </RecordLayout>
  );
}
