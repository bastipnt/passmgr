import PublicLayout from "@/layout/PublicLayout";
import BiometricEnrollPage from "@pages/auth/BiometricEnrollPage";
import LoginPage from "@pages/auth/LoginPage";
import RegisterPage from "@pages/auth/RegisterPage";
import NotFound from "@pages/NotFound";
import { SessionContext, useStore } from "@repo/client";
import { useContext } from "react";
import { Redirect, Route, Switch, useRoute } from "wouter";

export const loginRoutes = {
  login: "/login",
  // loginBiometric: "/login-biometric",
  enrollBiometric: "/enroll-biometric",
  register: "/register",
};

export default function LoginRoutes() {
  const { sessionId } = useContext(SessionContext);
  const store = useStore();
  const [isEnrollBiometricRoute] = useRoute(loginRoutes.enrollBiometric);

  if (sessionId) {
    if (!store.biometricDismissed && store.biometricKeyMaterial === null) {
      // TODO: check if ok when on enroll route
      if (!isEnrollBiometricRoute) return <Redirect to={loginRoutes.enrollBiometric} />;
    } else return <Redirect to="/" />;
  }

  return (
    // TODO: rename to LoginLayout???
    <PublicLayout>
      <Switch>
        <Route path={loginRoutes.login} component={LoginPage} />
        {/* <Route path={loginRoutes.loginBiometric} component={BiometricLoginPage} /> */}
        <Route path={loginRoutes.enrollBiometric} component={BiometricEnrollPage} />
        <Route path={loginRoutes.register} component={RegisterPage} />

        <Route>
          <NotFound />
        </Route>
      </Switch>
    </PublicLayout>
  );
}
