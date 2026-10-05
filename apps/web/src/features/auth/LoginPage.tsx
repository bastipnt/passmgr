import { SessionContext, useLogin, useStore, useUnlock } from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ShieldCheckIcon, TrashIcon } from "lucide-react";
import { useCallback, useContext, useState } from "react";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { AuthHero, HeroAccent, HeroChips } from "./AuthHero";
import { BiometricUnlockButton } from "./BiometricUnlockButton";
import ExistingUserButton from "./ExistingUserButton";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";
import StoredAccountRow from "./StoredAccountRow";

export default function LoginPage() {
  const { loginUser, clearLoginError, clearLoginErrors, loginError, loginThrottled } = useLogin();
  const { unlock, unlockLocal, offlineUnlock, unlockError, clearUnlockError } = useUnlock();

  const [loginWithStoredEmail, setLoginWithStoredEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const { networkOffline } = useContext(SessionContext);
  const store = useStore();
  // A vault without an account: it unlocks here, signing in elsewhere would replace it.
  const localVault = store.profile?.mode === "local" && store.accountKeyMaterial !== null;
  const storedEmail =
    store.profile?.mode === "linked" && store.accountKeyMaterial ? store.profile.email : undefined;
  const unlocking = localVault || (!!storedEmail && loginWithStoredEmail);

  const onSubmit = async ({ password, email }: LoginFormValues) => {
    setLoading(true);
    try {
      // This device's vault: unlock it locally, the server session follows.
      if (unlocking) {
        await timed("total unlock time", () => unlockLocal(password));
        return;
      }

      if (networkOffline && storedEmail) {
        await timed("total unlock time", () => offlineUnlock(email, password));
        return;
      }

      // only authentication with the server
      const unlockVaultInfo = await timed("total login time", () => loginUser(email, password));

      // something went wrong
      // TODO: error handling
      if (!unlockVaultInfo) return;

      // unlock vault (store)
      await timed("total unlock time", () => unlock(unlockVaultInfo));
    } finally {
      setLoading(false);
    }
  };

  // Stable: `LoginForm` subscribes to edits with it.
  const onEdit = useCallback(() => {
    clearLoginError();
    clearUnlockError();
  }, [clearLoginError, clearUnlockError]);
  const toggleStoredLogin = () => {
    // Another account: the throttle warning no longer applies either.
    clearLoginErrors();
    clearUnlockError();
    setLoginWithStoredEmail((prev) => !prev);
  };

  return (
    <>
      <PageMeta
        title="Sign in"
        description="Sign in to your passmgr vault. Zero-knowledge OPAQUE login — your password never leaves this device."
        canonicalPath={authPaths.login}
      />
      {unlocking ? (
        <AuthHero
          title={
            <>
              Your vault is locked. <HeroAccent>Only you hold the key.</HeroAccent>
            </>
          }
          lead="Your encrypted vault is stored on this device. Unlock it with your password or biometrics — nothing is decrypted on the server."
        />
      ) : (
        <AuthHero
          title={
            <>
              Your secrets, <HeroAccent>seen by no one</HeroAccent> but you.
            </>
          }
          lead="passmgr encrypts your vault on this device before anything leaves it. The server never learns your password — not even once."
        >
          <HeroChips items={["Zero-knowledge", "OPAQUE login", "End-to-end encrypted"]} />
        </AuthHero>
      )}

      <div className="flex w-full flex-col gap-4">
        <LoginForm
          localVault={localVault}
          storedEmail={unlocking ? storedEmail : undefined}
          account={
            unlocking &&
            (localVault ? (
              <StoredAccountRow />
            ) : (
              <StoredAccountRow email={storedEmail} onSwitch={toggleStoredLogin} />
            ))
          }
          alternative={
            unlocking &&
            store.biometricKeyMaterial && (
              <BiometricUnlockButton loading={loading} setLoading={setLoading} />
            )
          }
          footer={
            unlocking ? (
              <RemoveDialog
                title="Remove vault"
                description={
                  localVault
                    ? "This deletes the vault from this device. It has no account, so this is its only copy: everything in it is lost for good."
                    : "This will remove the local vault data from this device. Your account and server data are not affected. You can log in again with your credentials."
                }
                removeTitle="Remove vault"
                onRemove={() => store.removeVault()}
              >
                <button
                  type="button"
                  className="mx-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                  Remove vault from this device
                </button>
              </RemoveDialog>
            ) : (
              <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
                <ShieldCheckIcon className="size-3.5" aria-hidden />
                Your password never leaves this device
              </p>
            )
          }
          onSubmit={onSubmit}
          loginError={loginError}
          loginThrottled={loginThrottled}
          unlockError={unlockError}
          loading={loading}
          onEdit={onEdit}
        />

        {storedEmail && !unlocking && (
          <ExistingUserButton storedEmail={storedEmail} toggleSwitchUser={toggleStoredLogin} />
        )}
      </div>
    </>
  );
}
