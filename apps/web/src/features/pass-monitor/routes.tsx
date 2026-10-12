import { Route, Switch } from "wouter";
import { passMonitorPaths } from "@/app/route-paths";
import BreachedPasswordsPage from "./BreachedPasswordsPage";
import DuplicatesPage from "./DuplicatesPage";
import InsecureWebsitesPage from "./InsecureWebsitesPage";
import MissingTwoFactorPage from "./MissingTwoFactorPage";
import OldPasswordsPage from "./OldPasswordsPage";
import PassMonitorPage from "./PassMonitorPage";
import ReusedPasswordsPage from "./ReusedPasswordsPage";
import WeakPasswordsPage from "./WeakPasswordsPage";

export default function PassMonitorRoutes() {
  return (
    <Switch>
      <Route path={passMonitorPaths.index} component={PassMonitorPage} />
      <Route path={passMonitorPaths.weak} component={WeakPasswordsPage} />
      <Route path={passMonitorPaths.reused} component={ReusedPasswordsPage} />
      <Route path={passMonitorPaths.duplicates} component={DuplicatesPage} />
      <Route path={passMonitorPaths.old} component={OldPasswordsPage} />
      <Route path={passMonitorPaths.breached} component={BreachedPasswordsPage} />
      <Route path={passMonitorPaths.insecure} component={InsecureWebsitesPage} />
      <Route path={passMonitorPaths.twoFactor} component={MissingTwoFactorPage} />
    </Switch>
  );
}
