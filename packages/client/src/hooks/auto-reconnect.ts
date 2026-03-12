import { useContext, useEffect, useRef } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useLogin } from "./login";
import { useStore } from "../providers/StoreProvider";
import { secretsStore } from "@repo/store";

/**
 * Automatically performs OPAQUE login when transitioning from offline to online
 * while the vault is unlocked with sessionId === "offline".
 */
export function useAutoReconnect() {
  const { sessionId, isOffline } = useContext(SessionContext);
  const { loginUser } = useLogin();
  const store = useStore();
  const reconnectingRef = useRef(false);
  const storeRef = useRef(store);

  useEffect(() => {
    // Only reconnect when: online, session is "offline", password available
    if (isOffline || sessionId !== "offline") return;

    const password = secretsStore.getPassword();
    const email = storeRef.current.vaultKeyMaterial?.email;
    if (!password || !email || reconnectingRef.current) return;

    reconnectingRef.current = true;

    loginUser(email, password)
      .then(async (unlockInfo) => {
        if (unlockInfo) {
          // Update stored key material (server may have newer values)
          await storeRef.current.localStore.setVaultKeyMaterial({
            encryptedVaultKey: unlockInfo.userPasswordKeys.encryptedVaultKey,
            vaultKeyEncryptionNonce: unlockInfo.userPasswordKeys.vaultKeyEncryptionNonce,
            passwordKekSalt: unlockInfo.userPasswordKeys.passwordKekSalt,
            passwordKekParams: JSON.stringify(unlockInfo.userPasswordKeys.passwordKekParams),
            email,
          });

          // Clear password from memory unless biometric enrollment is pending
          if (storeRef.current.biometricKeyMaterial || storeRef.current.biometricDismissed) {
            secretsStore.clearPassword();
          }
        }
        // If loginUser returns undefined (OPAQUE failed), stay in offline mode silently
      })
      .catch(() => {
        // Network error or server error — stay in offline mode
      })
      .finally(() => {
        reconnectingRef.current = false;
      });
  }, [isOffline, sessionId, loginUser]);
}
