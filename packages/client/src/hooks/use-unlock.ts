import {
  authenticateBiometric,
  genPasswordKek,
  getPasswordKekParams,
  normalizeEmail,
  wipe,
} from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type {
  ArgonParams,
  MemberVaultKey,
  PasswordKeySchema,
  UserKeyPair,
  VaultUnlockInfo,
} from "@repo/schema";
import { isPersistentLoginAvailable, persistLoginBundle, secretsStore } from "@repo/store";
import { fromBase64, toBase64 } from "@repo/util";
import { useCallback, useContext, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { timed } from "../util/perf";
import { useTRPCClient } from "../util/trpc";
import { useLogin } from "./use-login";

function paramsEqual(a: ArgonParams, b: ArgonParams): boolean {
  return a.t === b.t && a.m === b.m && a.p === b.p;
}

function passwordKeysEqual(a: PasswordKeySchema, b: PasswordKeySchema): boolean {
  return (
    paramsEqual(a.passwordKekParams, b.passwordKekParams) &&
    a.passwordKekSalt === b.passwordKekSalt &&
    a.encryptedAccountKey === b.encryptedAccountKey &&
    a.accountKeyEncryptionNonce === b.accountKeyEncryptionNonce
  );
}

function keyPairsEqual(a: UserKeyPair, b: UserKeyPair): boolean {
  return (
    a.keyVersion === b.keyVersion &&
    a.publicKey === b.publicKey &&
    a.encryptedPrivateKey === b.encryptedPrivateKey &&
    a.privateKeyEncryptionNonce === b.privateKeyEncryptionNonce
  );
}

function personalVaultId(vaultKeys: readonly MemberVaultKey[]): string | undefined {
  return vaultKeys.find((wrap) => wrap.kind === "personal")?.vaultId;
}

function vaultKeysEqual(a: readonly MemberVaultKey[], b: readonly MemberVaultKey[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((wrap) => [wrap.vaultId, wrap]));
  return b.every((wrap) => {
    const other = byId.get(wrap.vaultId);
    return (
      other?.kind === wrap.kind &&
      other.keyVersion === wrap.keyVersion &&
      other.encryptedVaultKey === wrap.encryptedVaultKey &&
      other.vaultKeyEncryptionNonce === wrap.vaultKeyEncryptionNonce
    );
  });
}

/**
 * - `failed`: wrong password, or the key derivation failed
 * - `wrong_account`: offline, the email isn't the account stored on this device
 */
export type UnlockError = "failed" | "wrong_account";

export function useUnlock() {
  const [unlockError, setUnlockError] = useState<UnlockError>();
  const { unlockVault, unlockWithAccountKey, offlineLoginSession, endSession } =
    useContext(SessionContext);
  const store = useStore();
  const { loginUser } = useLogin();
  const trpc = useTRPCClient();

  /**
   * Derives the password KEK, unwraps the account key and with it the vault keys.
   * Resolves `false` on a wrong password (or a vault key that doesn't open).
   */
  async function unlock({
    email,
    password,
    userPasswordKeys,
    vaultKeys,
    userKeyPair,
  }: VaultUnlockInfo): Promise<boolean> {
    setUnlockError(undefined);
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
      await failUnlock();
      return false;
    }

    await storeKeyMaterial(email, userPasswordKeys, vaultKeys, userKeyPair);

    try {
      unlockVault(
        passwordKek,
        userPasswordKeys.encryptedAccountKey,
        userPasswordKeys.accountKeyEncryptionNonce,
        vaultKeys,
        userKeyPair,
      );
    } catch (e) {
      // Wrong password on the offline path: the account key fails to decrypt.
      // Or a vault key / keypair that doesn't open with it.
      console.error("Vault unlock failed", e);
      await failUnlock();
      return false;
    }

    // Store password temporarily for biometric enrollment (only if enrollment is upcoming).
    // Same tick as `unlockVault`, so the enroll redirect already sees it.
    if (store.needsBiometricEnroll) secretsStore.setPassword(password);

    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());

    await persistSession(email);

    // Transparently migrate to the current Argon2 params if the stored ones are
    // stale (e.g. after a params bump). Best-effort — needs the server and the
    // unlocked vault key in memory; failures don't block login.
    void rekeyIfParamsStale(
      email,
      password,
      userPasswordKeys.passwordKekParams,
      vaultKeys,
      userKeyPair,
    );
    return true;
  }

  /**
   * Unlock the locally stored vault without the server. Nothing is committed —
   * offline session, password kept for auto-reconnect — until the password has
   * decrypted the vault key; a wrong one would otherwise be replayed against the
   * server's login throttle once back online.
   */
  async function offlineUnlock(email: string, password: string): Promise<boolean> {
    const keyMaterial = store.accountKeyMaterial;
    // A different account can't be unlocked offline — and must not reach
    // `storeKeyMaterial`, which clears the local vault on an email change.
    if (!keyMaterial || normalizeEmail(email) !== keyMaterial.email) {
      setUnlockError("wrong_account");
      return false;
    }

    const vaultKeys = await store.vault.getVaultKeys();
    const unlocked = await unlock({
      email,
      password,
      userPasswordKeys: keyMaterial,
      vaultKeys,
      userKeyPair: keyMaterial.userKeyPair,
    });
    if (!unlocked) return false;

    // Session id gets set to "offline"
    offlineLoginSession();
    // Store password for auto-reconnect when back online
    secretsStore.setPassword(password);
    return true;
  }

  /**
   * After an online login the server session is already live, but a locked vault
   * can't use it: revoke it (best-effort) and drop its keys so the app doesn't sit
   * in a logged-in-but-locked state. Offline there is no session to discard.
   */
  async function failUnlock() {
    setUnlockError("failed");
    if (!secretsStore.sessionId) return;

    try {
      await trpc.login.logout.mutate();
    } catch {
      // Best-effort: the Redis session dies via its TTL.
    }
    secretsStore.lock();
    endSession();
  }

  /**
   * Re-derive the password KEK with the current params and re-wrap the account
   * key (vault keys are unaffected). Runs client-side only — the server never
   * sees the key or password.
   * TODO: move into separate file (refactor)
   */
  async function rekeyIfParamsStale(
    email: string,
    password: string,
    storedParams: ArgonParams,
    vaultKeys: readonly MemberVaultKey[],
    userKeyPair: UserKeyPair,
  ): Promise<void> {
    const targetParams = getPasswordKekParams();
    if (paramsEqual(storedParams, targetParams)) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    try {
      const { passwordKek, passwordKekParams, passwordKekSaltData } = await timed(
        `argon2 rekey (t:${targetParams.t} m:${targetParams.m} p:${targetParams.p})`,
        () => genPasswordKek(password, targetParams),
      );

      const [encryptedAccountKey, accountKeyEncryptionNonce] =
        secretsStore.rewrapAccountKey(passwordKek);
      wipe(passwordKek);

      const updated: PasswordKeySchema = {
        passwordKekParams,
        passwordKekSalt: toBase64(passwordKekSaltData),
        encryptedAccountKey,
        accountKeyEncryptionNonce,
      };

      await trpc.user.rekeyPasswordKeys.mutate(updated);
      await storeKeyMaterial(email, updated, vaultKeys, userKeyPair);
    } catch (e) {
      console.error("Argon2 param rekey failed (will retry next login)", e);
    }
  }

  async function biometricUnlock() {
    if (!store.biometricKeyMaterial) return;

    const { accountKey, password } = await authenticateBiometric(store.biometricKeyMaterial);
    const email = store.accountKeyMaterial?.email;
    let onlineAuthFailure = true;
    let vaultKeys: readonly MemberVaultKey[] | undefined;
    let userKeyPair = store.accountKeyMaterial?.userKeyPair;

    if (navigator.onLine && email) {
      const unlockInfo = await timed("total login time", () => loginUser(email, password));
      onlineAuthFailure = !unlockInfo;

      if (unlockInfo) {
        await storeKeyMaterial(
          email,
          unlockInfo.userPasswordKeys,
          unlockInfo.vaultKeys,
          unlockInfo.userKeyPair,
        );
        vaultKeys = unlockInfo.vaultKeys;
        userKeyPair = unlockInfo.userKeyPair;
      }
    }

    try {
      if (!userKeyPair) throw new Error("No keypair stored on this device");
      unlockWithAccountKey(
        accountKey,
        vaultKeys ?? (await store.vault.getVaultKeys()),
        userKeyPair,
        onlineAuthFailure,
      );
    } catch (e) {
      // A vault key or keypair that doesn't open (or no personal vault). The online path
      // already holds a live server session: revoke it, as on the password path.
      console.error("Biometric vault unlock failed", e);
      await failUnlock();
      throw e;
    }
    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());

    if (!onlineAuthFailure && email) await persistSession(email);
  }

  /**
   * Persist the live session + vault keys to OS secure storage (mobile only —
   * no-op on web) so the next app launch can restore a logged-in, unlocked
   * state behind a single biometric prompt, skipping OPAQUE + Argon2.
   * Best-effort: failures never block unlock.
   */
  async function persistSession(email: string) {
    if (!isPersistentLoginAvailable()) return;

    try {
      await persistLoginBundle({ ...secretsStore.exportPersistableBundle(), email });
    } catch (e) {
      console.error("Persisting session for fast unlock failed", e);
    }
  }

  /**
   * Persist the wrapped account key, vault keys and keypair for offline unlock.
   */
  async function storeKeyMaterial(
    rawEmail: string,
    userPasswordKeys: PasswordKeySchema,
    vaultKeys: readonly MemberVaultKey[],
    userKeyPair: UserKeyPair,
  ) {
    // Offline unlock passes the typed email; compare in canonical form.
    const email = normalizeEmail(rawEmail);
    const previous = store.accountKeyMaterial;
    const cachedVaultKeys = await store.vault.getVaultKeys();

    // The local data belongs to another account unless both the email and the
    // personal vault match: a personal vault never changes, so a new one means
    // the account was replaced (e.g. re-registered after a server reset). With
    // nothing cached there's no way to tell whose leftover data is in there.
    // Either way, drop it before any of it is decrypted with the wrong keys.
    const sameAccount =
      previous?.email === email && personalVaultId(cachedVaultKeys) === personalVaultId(vaultKeys);
    if (!sameAccount) await store.vault.clear();
    // Offline unlocks (and most logins) hand back what's already stored.
    else if (
      passwordKeysEqual(previous, userPasswordKeys) &&
      vaultKeysEqual(cachedVaultKeys, vaultKeys) &&
      keyPairsEqual(previous.userKeyPair, userKeyPair)
    ) {
      return;
    }

    await store.vault.setAccountKeyMaterial({ ...userPasswordKeys, email, userKeyPair }, vaultKeys);
  }

  const clearUnlockError = useCallback(() => setUnlockError(undefined), []);

  return { unlockError, clearUnlockError, unlock, offlineUnlock, biometricUnlock };
}
