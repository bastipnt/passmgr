import { SessionContext, useLogin, useStore, useUnlock } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { useContext, useState } from "react";
import LoginForm, { type LoginFormValues } from "@pages/auth/components/LoginForm";
import RemoveVaultDialog from "@pages/auth/components/RemoveVaultDialog";
import type { VaultUnlockInfo } from "@repo/schema";
import { secretsStore } from "@repo/store";
import ExistingUserButton from "@pages/auth/components/ExistingUserButton";
import { BiometricLoginCard } from "@pages/auth/components/BiometricLoginCard";

export default function LoginPage() {
  const { loginUser, offlineLogin, loginError } = useLogin();
  const { unlock, storeKeyMaterial, unlockError } = useUnlock();

  const [loginWithStoredEmail, setLoginWithStoredEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const { isOffline } = useContext(SessionContext);
  const store = useStore();
  const storedEmail = store.vaultKeyMaterial?.email;

  const onSubmit = async ({ password, email }: LoginFormValues) => {
    setLoading(true);

    let unlockVaultInfo: VaultUnlockInfo | undefined;

    if (isOffline && store.vaultKeyMaterial !== null) {
      // TODO: bring to a form, that I can use here better
      unlockVaultInfo = {
        password,
        userPasswordKeys: {
          ...store.vaultKeyMaterial,
          passwordKekParams: JSON.parse(store.vaultKeyMaterial.passwordKekParams),
        },
      };

      // Session id gets set to "offline"
      offlineLogin();
      // Store password for auto-reconnect when back online
      secretsStore.setPassword(password);
    } else {
      // only authentication with the server
      unlockVaultInfo = await loginUser(email, password);
    }

    // something went wrong
    // TODO: error handling
    if (!unlockVaultInfo) {
      setLoading(false);
      return;
    }

    // unlock vault (store)
    await unlock(unlockVaultInfo);

    // Store password temporarily for biometric enrollment (only if enrollment is upcoming)
    if (!store.biometricKeyMaterial && !store.biometricDismissed) {
      secretsStore.setPassword(unlockVaultInfo.password);
    }

    await storeKeyMaterial(email, unlockVaultInfo.userPasswordKeys);
  };

  return (
    <section className="w-xs max-w-full flex flex-col gap-4">
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
            <Button variant="outline" onClick={() => setLoginWithStoredEmail((prev) => !prev)}>
              Login with a different account
            </Button>

            <RemoveVaultDialog>
              <Button variant="link" className="text-muted-foreground text-xs">
                Remove vault from this device
              </Button>
            </RemoveVaultDialog>
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
