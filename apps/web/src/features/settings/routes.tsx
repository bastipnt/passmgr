import { SessionContext, useAutoReconnect } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, settingsPaths } from "@/app/route-paths";
import SettingsLayout from "./SettingsLayout";

const NotFound = lazy(() => import("@/app/NotFound"));
const GeneralSettingsPage = lazy(() => import("./GeneralSettingsPage"));
const GeneratorSettingsPage = lazy(() => import("./GeneratorSettingsPage"));
const SecuritySettingsPage = lazy(() => import("./SecuritySettingsPage"));
const PassMonitorPage = lazy(() => import("./PassMonitorPage"));
const ReusedPasswordsPage = lazy(() => import("./ReusedPasswordsPage"));
const DuplicatesPage = lazy(() => import("./DuplicatesPage"));
const WeakPasswordsPage = lazy(() => import("./WeakPasswordsPage"));

export default function SettingsRoutes() {
  const { sessionId } = useContext(SessionContext);
  const isMobile = useIsMobile();
  useAutoReconnect();

  if (!sessionId) return <Redirect to={authPaths.login} />;

  return (
    <SettingsLayout>
      <Switch>
        {/*
         * `/settings` is the overview itself — the layout renders it. On mobile
         * that is the whole screen; from `sm` up the detail pane would sit empty,
         * so send it to the first page instead. `replace` keeps the redirect out
         * of history (otherwise Back bounces straight forward again).
         */}
        <Route path={settingsPaths.index}>
          {isMobile ? null : <Redirect to={settingsPaths.general} replace />}
        </Route>

        <Route path={settingsPaths.general} component={GeneralSettingsPage} />
        <Route path={settingsPaths.generator} component={GeneratorSettingsPage} />
        <Route path={settingsPaths.security} component={SecuritySettingsPage} />
        <Route path={settingsPaths.passMonitor} component={PassMonitorPage} />
        <Route path={settingsPaths.reusedPasswords} component={ReusedPasswordsPage} />
        <Route path={settingsPaths.duplicates} component={DuplicatesPage} />
        <Route path={settingsPaths.weakPasswords} component={WeakPasswordsPage} />

        <Route>
          <NotFound />
        </Route>
      </Switch>
    </SettingsLayout>
  );
}
