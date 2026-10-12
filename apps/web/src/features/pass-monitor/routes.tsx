import { Route, Switch } from "wouter";
import { passMonitorPaths } from "@/app/route-paths";
import DuplicatesPage from "./DuplicatesPage";
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
    </Switch>
  );
}
