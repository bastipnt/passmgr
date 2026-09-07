import { SessionContext, useAutoReconnect } from "@repo/client";
import { lazy, useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, settingsPaths } from "@/app/route-paths";
import SettingsLayout from "./SettingsLayout";

const NotFound = lazy(() => import("@/app/NotFound"));

const GeneralSettingsPage = lazy(() => import("./GeneralSettingsPage"));
const GeneratorSettingsPage = lazy(() => import("./GeneratorSettingsPage"));
const SecuritySettingsPage = lazy(() => import("./SecuritySettingsPage"));
const DuplicatesPage = lazy(() => import("./DuplicatesPage"));
const WeakPasswordsPage = lazy(() => import("./WeakPasswordsPage"));

export default function SettingsRoutes() {
  const { sessionId } = useContext(SessionContext);
  useAutoReconnect();

  if (!sessionId) return <Redirect to={authPaths.login} />;

  return (
    <SettingsLayout>
      <Switch>
        <Route path={settingsPaths.index} component={GeneralSettingsPage} />
        <Route path={settingsPaths.generator} component={GeneratorSettingsPage} />
        <Route path={settingsPaths.security} component={SecuritySettingsPage} />
        <Route path={settingsPaths.duplicates} component={DuplicatesPage} />
        <Route path={settingsPaths.weakPasswords} component={WeakPasswordsPage} />

        <Route>
          <NotFound />
        </Route>
      </Switch>
    </SettingsLayout>
  );
}
