import { recordSlug } from "@/data/routes";
import { useIsMobile } from "@/hooks/use-is-mobile";
import RecordLayout from "@features/record/layout/RecordLayout";
import { RecordMobileDrawer } from "@features/record/pages/RecordMobileDrawer";
import CreateRecordProvider from "@features/record/providers/CreateRecordProvider";
import EditingProvider from "@features/record/providers/EditingProvider";
import SelectedElementProvider from "@features/record/providers/SelectedElementProvider";
import { SessionContext, useAutoReconnect } from "@repo/client";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";

const Index = lazy(() => import("@pages/Index"));
const RecordPage = lazy(() => import("@features/record/pages/RecordPage"));

const NotFound = lazy(() => import("@pages/NotFound"));

export default function RecordRoutes() {
  const { sessionId } = useContext(SessionContext);
  useAutoReconnect();
  const isMobile = useIsMobile();

  if (!sessionId) return <Redirect to="/login" />;

  return (
    <EditingProvider>
      <CreateRecordProvider>
        <SelectedElementProvider>
          <RecordLayout>
            <Switch>
              <Route path="/" component={isMobile ? undefined : Index} />
              <Route
                path={`/${recordSlug}/:recordId`}
                component={isMobile ? undefined : RecordPage}
              />

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
