import { SessionContext, useLogin, useStore, useUnlock } from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import type { VaultUnlockInfo } from "@repo/schema";
import { secretsStore } from "@repo/store";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { ShieldCheckIcon, TrashIcon } from "lucide-react";
import { useContext, useState } from "react";
import { AuthHero, HeroAccent, HeroChips } from "./AuthHero";
import { BiometricUnlockButton } from "./BiometricUnlockButton";
import ExistingUserButton from "./ExistingUserButton";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";
import StoredAccountRow from "./StoredAccountRow";

export default function LoginPage() {
  const { loginUser, offlineLogin, loginError, loginThrottled } = useLogin();
  const { unlock, unlockError } = useUnlock();

  const [loginWithStoredEmail, setLoginWithStoredEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const { isOffline } = useContext(SessionContext);
  const store = useStore();
  const storedEmail = store.vaultKeyMaterial?.email;

  const onSubmit = async ({ password, email }: LoginFormValues) => {
    setLoading(true);

    let unlockVaultInfo: VaultUnlockInfo | undefined;

    if (isOffline && store.vaultKeyMaterial !== null) {
      unlockVaultInfo = {
        email,
        password,
        userPasswordKeys: store.vaultKeyMaterial,
      };

      // Session id gets set to "offline"
      offlineLogin();
      // Store password for auto-reconnect when back online
      secretsStore.setPassword(password);
    } else {
      // only authentication with the server
      unlockVaultInfo = await timed("total login time", () => loginUser(email, password));
    }

    // something went wrong
    // TODO: error handling
    if (!unlockVaultInfo) {
      setLoading(false);
      return;
    }

    // unlock vault (store)
    await timed("total unlock time", () => unlock(unlockVaultInfo));
  };

  const unlocking = !!storedEmail && loginWithStoredEmail;
  const toggleStoredLogin = () => setLoginWithStoredEmail((prev) => !prev);

  return (
    <>
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
          storedEmail={unlocking ? storedEmail : undefined}
          account={
            unlocking && <StoredAccountRow email={storedEmail} onSwitch={toggleStoredLogin} />
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
                description="This will remove the local vault data from this device. Your account and server data are not affected. You can log in again with your credentials."
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
        />

        {storedEmail && !unlocking && (
          <ExistingUserButton storedEmail={storedEmail} toggleSwitchUser={toggleStoredLogin} />
        )}
      </div>
    </>
  );
}
