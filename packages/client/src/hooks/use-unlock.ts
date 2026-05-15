import type { PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import { useContext, useState } from "react";
import { fromBase64 } from "@repo/util";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { SessionContext } from "../providers/SessionProvider";
import { secretsStore } from "@repo/store";
import { useStore } from "../providers/StoreProvider";
import { authenticateBiometric } from "@repo/crypto";
import { useLogin } from "./use-login";

export function useUnlock() {
  const [unlockError, setUnlockError] = useState(false);
  const { unlockVault, unlockWithVaultKey } = useContext(SessionContext);
  const store = useStore();
  const { loginUser } = useLogin();

  async function unlock({ email, password, userPasswordKeys }: VaultUnlockInfo) {
    let passwordKek: Uint8Array;

    try {
      passwordKek = await argon2WorkerService.derive(
        password,
        fromBase64(userPasswordKeys.passwordKekSalt),
        userPasswordKeys.passwordKekParams,
      );
    } catch (e) {
      console.error("Vault unlock failed", e);
      setUnlockError(true);
      return;
    }

    // Store password temporarily for biometric enrollment (only if enrollment is upcoming)
    if (store.needsBiometricEnroll) secretsStore.setPassword(password);
    await storeKeyMaterial(email, userPasswordKeys);

    unlockVault(
      passwordKek,
      userPasswordKeys.encryptedVaultKey,
      userPasswordKeys.vaultKeyEncryptionNonce,
    );

    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
  }

  async function biometricUnlock() {
    if (!store.biometricKeyMaterial) return;

    const { vaultKey, password } = await authenticateBiometric(store.biometricKeyMaterial);
    const email = store.vaultKeyMaterial?.email;
    let onlineAuthFailure = true;

    if (navigator.onLine && email) {
      const unlockInfo = await loginUser(email, password);
      onlineAuthFailure = !unlockInfo;

      if (unlockInfo) await storeKeyMaterial(email, unlockInfo.userPasswordKeys);
    }

    unlockWithVaultKey(vaultKey, onlineAuthFailure);
    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
  }

  /**
   * Persist encrypted vault key material for offline unlock
   */
  async function storeKeyMaterial(email: string, userPasswordKeys: PasswordKeySchema) {
    // Clear previous user's data if a different account logs in
    const previousEmail = store.vaultKeyMaterial?.email;
    if (previousEmail && previousEmail !== email) await store.vault.clear();

    await store.vault.setVaultKeyMaterial({
      ...userPasswordKeys,
      email,
    });
  }

  return { unlockError, unlock, biometricUnlock };
}
