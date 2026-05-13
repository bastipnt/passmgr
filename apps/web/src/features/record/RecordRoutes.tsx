import { entrySlug } from "@/data/routes";
import { useIsMobile } from "@/hooks/use-is-mobile";
import RecordLayout from "@features/record/layout/RecordLayout";
import { RecordMobileDrawer } from "@features/record/pages/RecordMobileDrawer";
import CreateEntryProvider from "@features/record/providers/CreateEntryProvider";
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
      <CreateEntryProvider>
        <SelectedElementProvider>
          <RecordLayout>
            <Switch>
              <Route path="/" component={isMobile ? undefined : Index} />
              <Route
                path={`/${entrySlug}/:entryId`}
                component={isMobile ? undefined : RecordPage}
              />

              <Route>
                <NotFound />
              </Route>
            </Switch>
            {isMobile && <RecordMobileDrawer />}
          </RecordLayout>
        </SelectedElementProvider>
      </CreateEntryProvider>
    </EditingProvider>
  );
}
