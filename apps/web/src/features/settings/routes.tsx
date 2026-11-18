import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { Redirect, Route, Switch } from "wouter";
import { settingsPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { RequireUnlocked } from "@/components/RequireUnlocked";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { lazyPreload } from "@/lib/lazy-preload";
import AccountSettingsPage from "./AccountSettingsPage";
import AppearanceSettingsPage from "./AppearanceSettingsPage";
import BackupSettingsPage from "./BackupSettingsPage";
import DevicesSettingsPage from "./DevicesSettingsPage";
import GeneratorSettingsPage from "./GeneratorSettingsPage";
import SecuritySettingsPage from "./SecuritySettingsPage";
import SettingsHome from "./SettingsHome";
import SettingsLayout from "./SettingsLayout";
import ShortcutsSettingsPage from "./ShortcutsSettingsPage";
import SyncSettingsPage from "./SyncSettingsPage";
import TagsSettingsPage from "./TagsSettingsPage";
import TrashPage from "./TrashPage";
import VaultsSettingsPage from "./VaultsSettingsPage";

const NotFound = lazyPreload(() => import("@/app/NotFound"));

/** Pages are imported eagerly: on a phone they slide in, and one that suspends mid-transition slides in blank. */
export default function SettingsRoutes() {
  const isMobile = useIsMobile();

  return (
    <RequireUnlocked>
      <SettingsLayout>
        <PageMeta title="Settings" noindex />
        <RouteErrorBoundary area="settings">
          <Switch>
            {/*
             * On a phone `/settings` is the list of sections. On desktop the overlay
             * opens on the first one; `replace` keeps the redirect out of history
             * (otherwise Back bounces straight forward again).
             */}
            <Route path={settingsPaths.index}>
              {isMobile ? <SettingsHome /> : <Redirect to={settingsPaths.account} replace />}
            </Route>

            <Route path={settingsPaths.account} component={AccountSettingsPage} />
            <Route path={settingsPaths.devices} component={DevicesSettingsPage} />
            <Route path={settingsPaths.sync} component={SyncSettingsPage} />
            <Route path={settingsPaths.vaults} component={VaultsSettingsPage} />
            <Route path={settingsPaths.tags} component={TagsSettingsPage} />
            <Route path={settingsPaths.trash} component={TrashPage} />
            <Route path={settingsPaths.backup} component={BackupSettingsPage} />
            <Route path={settingsPaths.security} component={SecuritySettingsPage} />
            <Route path={settingsPaths.appearance} component={AppearanceSettingsPage} />
            <Route path={settingsPaths.generator} component={GeneratorSettingsPage} />
            <Route path={settingsPaths.shortcuts}>
              {isMobile ? <Redirect to={settingsPaths.index} replace /> : <ShortcutsSettingsPage />}
            </Route>

            <Route>
              <NotFound />
            </Route>
          </Switch>
        </RouteErrorBoundary>
      </SettingsLayout>
    </RequireUnlocked>
  );
}
