import { SessionContext, useAutoReconnect } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, recordPaths } from "@/app/route-paths";
import CreateRecordProvider from "./CreateRecordProvider";
import EditingProvider from "./EditingProvider";
import RecordLayout from "./RecordLayout";
import { RecordMobileDrawer } from "./RecordMobileDrawer";
import SelectedElementProvider from "./SelectedElementProvider";

const NotFound = lazy(() => import("@/app/NotFound"));

const RecordsEmptyState = lazy(() => import("./RecordsEmptyState"));
const RecordPage = lazy(() => import("./RecordPage"));

export default function RecordRoutes() {
  const { sessionId } = useContext(SessionContext);
  useAutoReconnect();
  const isMobile = useIsMobile();

  if (!sessionId) return <Redirect to={authPaths.login} />;

  return (
    <EditingProvider>
      <CreateRecordProvider>
        <SelectedElementProvider>
          <RecordLayout>
            <Switch>
              <Route
                path={recordPaths.index}
                component={isMobile ? undefined : RecordsEmptyState}
              />
              <Route path={recordPaths.detail} component={isMobile ? undefined : RecordPage} />

              <Route>
                <NotFound />
              </Route>
            </Switch>
            {isMobile && <RecordMobileDrawer />}
          </RecordLayout>
        </SelectedElementProvider>
      </CreateRecordProvider>
    </EditingProvider>
  );
}
