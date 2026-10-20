import { canEnrollBiometric, SessionContext, useStore } from "@repo/client";
import { Suspense, useContext, useState } from "react";
import { Redirect, Route, Switch, useRoute } from "wouter";
import { authPaths } from "@/app/route-paths";
import { lazyPreload } from "@/lib/lazy-preload";
import AuthLayout from "./AuthLayout";
import { HoldUnlockRedirectContext } from "./unlock-redirect";

const BiometricEnrollPage = lazyPreload(() => import("./BiometricEnrollPage"));
const CreateVaultPage = lazyPreload(() => import("./CreateVaultPage"));
const LoginPage = lazyPreload(() => import("./LoginPage"));
const RecoverPage = lazyPreload(() => import("./RecoverPage"));
const RestoreBackupPage = lazyPreload(() => import("./RestoreBackupPage"));
const WelcomePage = lazyPreload(() => import("./WelcomePage"));

export default function AuthRoutes() {
  const { vaultUnlocked } = useContext(SessionContext);
  const { needsBiometricEnroll, profile } = useStore();
  const [isEnrollBiometricRoute] = useRoute(authPaths.enrollBiometric);
  const [isCreateRoute] = useRoute(authPaths.create);
  const [redirectHeld, setRedirectHeld] = useState(false);

  if (vaultUnlocked && !redirectHeld) {
    if (needsBiometricEnroll && canEnrollBiometric(profile)) {
      if (!isEnrollBiometricRoute) return <Redirect to={authPaths.enrollBiometric} />;
    } else return <Redirect to="/" />;
  }

  return (
    <AuthLayout phoneHeader={!isCreateRoute}>
      <HoldUnlockRedirectContext value={setRedirectHeld}>
        <Suspense fallback={null}>
          <Switch>
            <Route path={authPaths.welcome} component={WelcomePage} />
            <Route path={authPaths.login} component={LoginPage} />
            <Route path={authPaths.enrollBiometric} component={BiometricEnrollPage} />
            <Route path={authPaths.recover} component={RecoverPage} />
            <Route path={authPaths.create} component={CreateVaultPage} />
            <Route path={authPaths.restore} component={RestoreBackupPage} />

            <Route>
              <Redirect to={authPaths.login} />
            </Route>
          </Switch>
        </Suspense>
      </HoldUnlockRedirectContext>
    </AuthLayout>
  );
}
