import { SessionContext, useLogin, useStore, useUnlock } from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import type { VaultUnlockInfo } from "@repo/schema";
import { secretsStore } from "@repo/store";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { useContext, useState } from "react";
import { BiometricLoginCard } from "./BiometricLoginCard";
import ExistingUserButton from "./ExistingUserButton";
import type { LoginFormValues } from "./LoginForm";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const { loginUser, offlineLogin, loginError } = useLogin();
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
        // TODO: maybe userPasswordKeyMaterial
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

  return (
    <section className="flex w-xs max-w-full flex-col gap-4">
      {storedEmail && loginWithStoredEmail && store.biometricKeyMaterial && (
        <BiometricLoginCard loading={loading} setLoading={setLoading} />
      )}

      <LoginForm
        storedEmail={loginWithStoredEmail ? storedEmail : undefined}
        onSubmit={onSubmit}
        loginError={loginError}
        unlockError={unlockError}
        loading={loading}
      />

      {/* only show the option when loginWithStoredEmail is not already selected */}
      {storedEmail &&
        (loginWithStoredEmail ? (
          <>
            <Button variant="secondary" onClick={() => setLoginWithStoredEmail((prev) => !prev)}>
              Login with a different account
            </Button>

            <RemoveDialog
              title="Remove vault"
              description="This will remove the local vault data from this device. Your account and server data are not affected. You can log in again with your credentials."
              removeTitle="Remove vault"
              onRemove={() => store.removeVault()}
            >
              <Button variant="link" className="text-muted-foreground text-xs">
                Remove vault from this device
              </Button>
            </RemoveDialog>
          </>
        ) : (
          <ExistingUserButton
            storedEmail={storedEmail}
            toggleSwitchUser={() => setLoginWithStoredEmail((prev) => !prev)}
          />
        ))}
    </section>
  );
}
