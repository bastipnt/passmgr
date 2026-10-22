import {
  signInErrorMessage,
  signInToAccount,
  useLogin,
  useSecondFactorRequest,
  useServerHost,
  useStore,
  useUnlock,
} from "@repo/client";
import { Card, CardContent } from "@repo/ui/components/Card";
import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { useStoragePersistent } from "@/hooks/use-storage-persistent";
import AuthCardHeader from "./AuthCardHeader";
import { useAuthHome } from "./auth-home";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";
import PrivateWindowNote from "./PrivateWindowNote";
import SecondFactorStep from "./SecondFactorStep";
import StepBar from "./StepBar";
import StoredAccountRow from "./StoredAccountRow";

/**
 * Log in to an account (ADR 0001 D2): the email of a profile on this device
 * unlocks that profile; another account adds one.
 */
export default function AccountLoginPage() {
  const [, navigate] = useLocation();
  const home = useAuthHome();
  const { profiles } = useStore();
  const serverHost = useServerHost();
  const persistent = useStoragePersistent();
  const { loginUser, clearLoginError, loginError } = useLogin();
  const secondFactor = useSecondFactorRequest();
  const { unlock, unlockByEmail, unlockError, clearUnlockError } = useUnlock();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const onLogin = async ({ password, email }: LoginFormValues) => {
    setEmail(email);
    setLoading(true);
    try {
      await signInToAccount(
        { profiles, unlockByEmail, loginUser, unlock },
        email,
        password,
        secondFactor.prompt,
      );
    } finally {
      setLoading(false);
    }
  };

  const onEdit = useCallback(() => {
    clearLoginError();
    clearUnlockError();
  }, [clearLoginError, clearUnlockError]);

  return (
    <>
      <PageMeta
        title="Log in"
        description="Log in to your passmgr account. Zero-knowledge OPAQUE login — your password never leaves this device."
        canonicalPath={authPaths.accountLogin}
      />
      <div className="flex w-full flex-col gap-4 lg:col-span-full lg:mx-auto lg:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar onBack={() => navigate(home)} disabled={loading} />
          <AuthCardHeader
            title="Log in to your account"
            description={
              secondFactor.request
                ? undefined
                : "Use the email and password of your passmgr account to bring your vault to this device."
            }
          />
          <CardContent className="flex flex-col gap-6">
            {persistent === false && (
              <PrivateWindowNote>
                This browser can&apos;t keep vaults (private window?). Your vault here is gone once
                you lock, reload or close the tab: log in again to bring it back.
              </PrivateWindowNote>
            )}
            {secondFactor.request && (
              <>
                <StoredAccountRow email={email} detail={serverHost} />
                <SecondFactorStep {...secondFactor} request={secondFactor.request} />
              </>
            )}
            {/* Hidden, not unmounted: the typed credentials stay for the unlock that follows. */}
            <div hidden={secondFactor.request !== null}>
              <LoginForm
                onSubmit={onLogin}
                error={signInErrorMessage(loginError, unlockError, false)}
                retry={loginError === "unreachable"}
                loading={loading}
                onEdit={onEdit}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
