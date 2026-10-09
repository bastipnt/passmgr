import { SessionContext, useAppConfig, useStore } from "@repo/client";
import { lazy, Suspense, useContext } from "react";
import { Redirect, Route, Switch, useRoute, useSearchParams } from "wouter";
import { authPaths } from "@/app/route-paths";
import AuthLayout from "./AuthLayout";

const BiometricEnrollPage = lazy(() => import("./BiometricEnrollPage"));
const CreateLocalVaultPage = lazy(() => import("./CreateLocalVaultPage"));
const LoginPage = lazy(() => import("./LoginPage"));
const RecoverPage = lazy(() => import("./RecoverPage"));
const RegisterPage = lazy(() => import("./RegisterPage"));
const RestoreBackupPage = lazy(() => import("./RestoreBackupPage"));

export default function AuthRoutes() {
  const { vaultUnlocked } = useContext(SessionContext);
  const { needsBiometricEnroll } = useStore();
  const { registrationEnabled } = useAppConfig();
  const [isEnrollBiometricRoute] = useRoute(authPaths.enrollBiometric);
  const [searchParams] = useSearchParams();
  const canRegister = registrationEnabled || searchParams.has("invite");

  if (vaultUnlocked) {
    if (needsBiometricEnroll) {
      if (!isEnrollBiometricRoute) return <Redirect to={authPaths.enrollBiometric} />;
    } else return <Redirect to="/" />;
  }

  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <Switch>
          <Route path={authPaths.login} component={LoginPage} />
          <Route path={authPaths.enrollBiometric} component={BiometricEnrollPage} />
          <Route path={authPaths.recover} component={RecoverPage} />
          {canRegister && <Route path={authPaths.register} component={RegisterPage} />}
          {/* Needs no server: always there, whatever the app config says. */}
          <Route path={authPaths.createLocal} component={CreateLocalVaultPage} />
          <Route path={authPaths.restore} component={RestoreBackupPage} />

          <Route>
            <Redirect to={authPaths.login} />
          </Route>
        </Switch>
      </Suspense>
    </AuthLayout>
  );
}
