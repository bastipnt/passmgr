import PublicLayout from "@/layout/PublicLayout";
import { SessionContext, useAppConfig, useStore } from "@repo/client";
import { Suspense, lazy, useContext } from "react";
import { Redirect, Route, Switch, useRoute } from "wouter";

const BiometricEnrollPage = lazy(() => import("@pages/auth/BiometricEnrollPage"));
const LoginPage = lazy(() => import("@pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@pages/auth/RegisterPage"));

export const loginRoutes = {
  login: "/login",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
};

export default function LoginRoutes() {
  const { loggedIn, vaultUnlocked } = useContext(SessionContext);
  const { needsBiometricEnroll } = useStore();
  const { registrationEnabled } = useAppConfig();
  const [isEnrollBiometricRoute] = useRoute(loginRoutes.enrollBiometric);

  if (loggedIn && vaultUnlocked) {
    if (needsBiometricEnroll) {
      if (!isEnrollBiometricRoute) return <Redirect to={loginRoutes.enrollBiometric} />;
    } else return <Redirect to="/" />;
  }

  return (
    // TODO: rename to LoginLayout???
    <PublicLayout>
      <Suspense fallback={null}>
        <Switch>
          <Route path={loginRoutes.login} component={LoginPage} />
          <Route path={loginRoutes.enrollBiometric} component={BiometricEnrollPage} />
          {registrationEnabled && <Route path={loginRoutes.register} component={RegisterPage} />}

          <Route>
            <Redirect to={loginRoutes.login} />
          </Route>
        </Switch>
      </Suspense>
    </PublicLayout>
  );
}
