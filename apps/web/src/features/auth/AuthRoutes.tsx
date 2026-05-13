import AuthLayout from "@features/auth/AuthLayout";
import { SessionContext, useAppConfig, useStore } from "@repo/client";
import { Suspense, lazy, useContext } from "react";
import { Redirect, Route, Switch, useRoute } from "wouter";

const BiometricEnrollPage = lazy(() => import("@features/auth/pages/BiometricEnrollPage"));
const LoginPage = lazy(() => import("@features/auth/pages/LoginPage"));
const RegisterPage = lazy(() => import("@features/auth/pages/RegisterPage"));

export const authRoutesMap = {
  login: "/login",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
};

export default function AuthRoutes() {
  const { loggedIn, vaultUnlocked } = useContext(SessionContext);
  const { needsBiometricEnroll } = useStore();
  const { registrationEnabled } = useAppConfig();
  const [isEnrollBiometricRoute] = useRoute(authRoutesMap.enrollBiometric);

  if (loggedIn && vaultUnlocked) {
    if (needsBiometricEnroll) {
      if (!isEnrollBiometricRoute) return <Redirect to={authRoutesMap.enrollBiometric} />;
    } else return <Redirect to="/" />;
  }

  return (
    <AuthLayout>
      <Suspense fallback={null}>
        <Switch>
          <Route path={authRoutesMap.login} component={LoginPage} />
          <Route path={authRoutesMap.enrollBiometric} component={BiometricEnrollPage} />
          {registrationEnabled && <Route path={authRoutesMap.register} component={RegisterPage} />}

          <Route>
            <Redirect to={authRoutesMap.login} />
          </Route>
        </Switch>
      </Suspense>
    </AuthLayout>
  );
}
