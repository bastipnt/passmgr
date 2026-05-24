import type { ArgonParams, PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import { useContext, useState } from "react";
import { fromBase64, toBase64 } from "@repo/util";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { SessionContext } from "../providers/SessionProvider";
import { secretsStore } from "@repo/store";
import { useStore } from "../providers/StoreProvider";
import { authenticateBiometric, genPasswordKek, getPasswordKekParams, wipe } from "@repo/crypto";
import { useLogin } from "./use-login";
import { useTRPCClient } from "../util/trpc";
import { timed } from "../util/perf";

function paramsEqual(a: ArgonParams, b: ArgonParams): boolean {
  return a.t === b.t && a.m === b.m && a.p === b.p;
}

export function useUnlock() {
  const [unlockError, setUnlockError] = useState(false);
  const { unlockVault, unlockWithVaultKey } = useContext(SessionContext);
  const store = useStore();
  const { loginUser } = useLogin();
  const trpc = useTRPCClient();

  async function unlock({ email, password, userPasswordKeys }: VaultUnlockInfo) {
    let passwordKek: Uint8Array;

    try {
      const { passwordKekParams } = userPasswordKeys;
      passwordKek = await timed(
        `argon2 derive (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
        () =>
          argon2WorkerService.derive(
            password,
            fromBase64(userPasswordKeys.passwordKekSalt),
            passwordKekParams,
          ),
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

    // Transparently migrate to the current Argon2 params if the stored ones are
    // stale (e.g. after a params bump). Best-effort — needs the server and the
    // unlocked vault key in memory; failures don't block login.
    void rekeyIfParamsStale(email, password, userPasswordKeys.passwordKekParams);
  }

  /**
   * Re-derive the password KEK with the current params and re-wrap the vault
   * key. Runs client-side only — the server never sees the key or password.
   * TODO: move into separate file (refactor)
   */
  async function rekeyIfParamsStale(
    email: string,
    password: string,
    storedParams: ArgonParams,
  ): Promise<void> {
    const targetParams = getPasswordKekParams();
    if (paramsEqual(storedParams, targetParams)) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      const { passwordKek, passwordKekParams, passwordKekSaltData } = await timed(
        `argon2 rekey (t:${targetParams.t} m:${targetParams.m} p:${targetParams.p})`,
        () => genPasswordKek(password, targetParams),
      );

      const [encryptedVaultKey, vaultKeyEncryptionNonce] = secretsStore.rewrapVaultKey(passwordKek);
      wipe(passwordKek);

      const updated: PasswordKeySchema = {
        passwordKekParams,
        passwordKekSalt: toBase64(passwordKekSaltData),
        encryptedVaultKey,
        vaultKeyEncryptionNonce,
      };

      await trpc.user.rekeyPasswordKeys.mutate(updated);
      await storeKeyMaterial(email, updated);
    } catch (e) {
      console.error("Argon2 param rekey failed (will retry next login)", e);
    }
  }

  async function biometricUnlock() {
    if (!store.biometricKeyMaterial) return;

    const { vaultKey, password } = await authenticateBiometric(store.biometricKeyMaterial);
    const email = store.vaultKeyMaterial?.email;
    let onlineAuthFailure = true;

    if (navigator.onLine && email) {
      const unlockInfo = await timed("total login time", () => loginUser(email, password));
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
