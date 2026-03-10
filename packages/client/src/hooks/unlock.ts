import type { PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import { useContext, useState } from "react";
import { fromBase64 } from "@repo/util";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { SessionContext } from "../providers/SessionProvider";
import { secretsStore } from "@repo/store";
import { useStore } from "../providers/StoreProvider";

export function useUnlock() {
  const [unlockError, setUnlockError] = useState(false);
  const { unlockVault } = useContext(SessionContext);
  const store = useStore();

  async function unlock({ password, userPasswordKeys }: VaultUnlockInfo) {
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

    unlockVault(
      passwordKek,
      userPasswordKeys.encryptedVaultKey,
      userPasswordKeys.vaultKeyEncryptionNonce,
    );

    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());
  }

  /**
   * Persist encrypted vault key material for offline unlock
   */
  async function storeKeyMaterial(email: string, userPasswordKeys: PasswordKeySchema) {
    // Clear previous user's data if a different account logs in
    const previousEmail = store.vaultKeyMaterial?.email;
    if (previousEmail && previousEmail !== email) await store.localStore.clear();

    await store.localStore.setVaultKeyMaterial({
      encryptedVaultKey: userPasswordKeys.encryptedVaultKey,
      vaultKeyEncryptionNonce: userPasswordKeys.vaultKeyEncryptionNonce,
      passwordKekSalt: userPasswordKeys.passwordKekSalt,
      passwordKekParams: JSON.stringify(userPasswordKeys.passwordKekParams),
      email,
    });
  }

  return { unlockError, unlock, storeKeyMaterial };
}
