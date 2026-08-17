import { SessionContext, useAppConfig, useStore } from "@repo/client";
import { lazy, Suspense, useContext } from "react";
import { Redirect, Route, Switch, useRoute } from "wouter";
import { authPaths } from "@/app/route-paths";
import AuthLayout from "./AuthLayout";

const BiometricEnrollPage = lazy(() => import("./BiometricEnrollPage"));
const LoginPage = lazy(() => import("./LoginPage"));
const RegisterPage = lazy(() => import("./RegisterPage"));

export default function AuthRoutes() {
  const { loggedIn, vaultUnlocked } = useContext(SessionContext);
  const { needsBiometricEnroll } = useStore();
  const { registrationEnabled } = useAppConfig();
  const [isEnrollBiometricRoute] = useRoute(authPaths.enrollBiometric);

  if (loggedIn && vaultUnlocked) {
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
          {registrationEnabled && <Route path={authPaths.register} component={RegisterPage} />}

          <Route>
            <Redirect to={authPaths.login} />
          </Route>
        </Switch>
      </Suspense>
    </AuthLayout>
  );
}
