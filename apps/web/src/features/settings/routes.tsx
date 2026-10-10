import { SessionContext, useAutoReconnect } from "@repo/client";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useContext } from "react";
import { Redirect, Route, Switch } from "wouter";
import { authPaths, settingsPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { lazyPreload } from "@/lib/lazy-preload";
import SettingsLayout from "./SettingsLayout";

const NotFound = lazyPreload(() => import("@/app/NotFound"));
const AccountSettingsPage = lazyPreload(() => import("./AccountSettingsPage"));
const VaultsSettingsPage = lazyPreload(() => import("./VaultsSettingsPage"));
const GeneralSettingsPage = lazyPreload(() => import("./GeneralSettingsPage"));
const GeneratorSettingsPage = lazyPreload(() => import("./GeneratorSettingsPage"));
const SecuritySettingsPage = lazyPreload(() => import("./SecuritySettingsPage"));
const PassMonitorPage = lazyPreload(() => import("./PassMonitorPage"));
const ReusedPasswordsPage = lazyPreload(() => import("./ReusedPasswordsPage"));
const DuplicatesPage = lazyPreload(() => import("./DuplicatesPage"));
const WeakPasswordsPage = lazyPreload(() => import("./WeakPasswordsPage"));

export default function SettingsRoutes() {
  const { vaultUnlocked } = useContext(SessionContext);
  const isMobile = useIsMobile();
  useAutoReconnect();

  // The welcome sends a device with vaults on to their unlock.
  if (!vaultUnlocked) return <Redirect to={authPaths.welcome} />;

  return (
    <SettingsLayout>
      <PageMeta title="Settings" noindex />
      <Switch>
        {/*
         * `/settings` is the overview itself — the layout renders it. On mobile
         * that is the whole screen; from `sm` up the detail pane would sit empty,
         * so send it to the first page instead. `replace` keeps the redirect out
         * of history (otherwise Back bounces straight forward again).
         */}
        <Route path={settingsPaths.index}>
          {isMobile ? null : <Redirect to={settingsPaths.account} replace />}
        </Route>

        <Route path={settingsPaths.account} component={AccountSettingsPage} />
        <Route path={settingsPaths.vaults} component={VaultsSettingsPage} />
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
