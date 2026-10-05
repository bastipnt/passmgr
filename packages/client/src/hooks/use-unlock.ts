import { authenticateBiometric, normalizeEmail, wipe } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { AccountKeyMaterial, PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import { type LocalProfile, secretsStore } from "@repo/store";
import { fromBase64 } from "@repo/util";
import { useCallback, useContext, useState } from "react";
import { rekeyIfParamsStale } from "../account/rekey-password-keys";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { endServerSession } from "../util/end-server-session";
import { timed } from "../util/perf";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { type ConnectResult, canReleasePassword, useConnectServer } from "./use-connect-server";
import { useLogin } from "./use-login";

/**
 * - `failed`: wrong password, or the key derivation failed
 * - `wrong_account`: offline, the email isn't the account stored on this device
 * - `local_vault`: this device holds a vault without an account; signing in to
 *   an account would replace it (merging comes with account linking)
 * - `account_changed`: the stored vault's email now belongs to another account
 *   on the server; unlocking it there would replace this device's vault
 */
export type UnlockError = "failed" | "wrong_account" | "local_vault" | "account_changed";

async function derivePasswordKek(password: string, keys: PasswordKeySchema): Promise<Uint8Array> {
  const { passwordKekParams } = keys;
  return await timed(
    `argon2 derive (t:${passwordKekParams.t} m:${passwordKekParams.m} p:${passwordKekParams.p})`,
    () => argon2WorkerService.derive(password, fromBase64(keys.passwordKekSalt), passwordKekParams),
  );
}

export function useUnlock() {
  const [unlockError, setUnlockError] = useState<UnlockError>();
  const { unlockVault, unlockWithAccountKey, lock, networkOffline } = useContext(SessionContext);
  const store = useStore();
  const { loginUser } = useLogin();
  const { connect } = useConnectServer();
  const trpc = useTRPCClient();

  /**
   * After an online login (`loginUser`, server session attached): make this
   * device the account's, derive the password KEK, unwrap the account key and
   * with it the vault keys. Resolves `false` on a wrong password (or a vault
   * key that doesn't open), with the server session revoked again.
   */
  async function unlock(info: VaultUnlockInfo): Promise<boolean> {
    setUnlockError(undefined);
    const { password, userPasswordKeys, vaultKeys, userKeyPair } = info;

    let passwordKek: Uint8Array;
    try {
      passwordKek = await derivePasswordKek(password, userPasswordKeys);
    } catch (e) {
      console.error("Vault unlock failed", e);
      await failUnlock("failed");
      return false;
    }

    const material: AccountKeyMaterial = { ...userPasswordKeys, userKeyPair };
    if (!(await adoptAccount(info, material))) {
      wipe(passwordKek);
      await failUnlock("local_vault");
      return false;
    }

    try {
      unlockVault(
        "linked",
        passwordKek,
        userPasswordKeys.encryptedAccountKey,
        userPasswordKeys.accountKeyEncryptionNonce,
        vaultKeys,
        userKeyPair,
      );
    } catch (e) {
      // A vault key or keypair that doesn't open with the account key.
      console.error("Vault unlock failed", e);
      await failUnlock("failed");
      return false;
    }

    afterUnlock(password);
    await persistSession();

    // Transparently migrate to the current Argon2 params if the stored ones
    // are stale. Best-effort; failures don't block login.
    void rekeyIfParamsStale(trpc, password, material).then(async (rekeyed) => {
      if (rekeyed) await store.saveAccount(rekeyed, vaultKeys);
    });
    return true;
  }

  /**
   * Unlock this device's vault with the password, without the server (ADR 0001
   * D2): the profile says whose vault it is, no email needed. A linked vault
   * then attaches server auth in the background; until that works the session
   * is `offline`.
   *
   * When the password doesn't open the local copy of a linked vault, it may
   * have been changed on another device: online, the server login decides.
   */
  async function unlockLocal(password: string): Promise<boolean> {
    setUnlockError(undefined);
    const { profile, accountKeyMaterial: material } = store;
    if (!profile || !material) {
      setUnlockError("failed");
      return false;
    }

    if (await unlockWithPassword(profile, material, password)) {
      afterUnlock(password);
      await persistSession();
      if (profile.mode === "linked") {
        // Kept for the reconnect: `useAutoReconnect` retries with it once online.
        secretsStore.setPassword(password);
        if (!networkOffline) void connect(password).then(clearPasswordIfDone);
      }
      return true;
    }

    if (profile.mode === "linked" && !networkOffline) {
      const info = await loginUser(profile.email, password);
      if (info) {
        // Unlocking this device's vault never switches accounts: that would
        // clear the vault without the user ever asking for another account.
        // The server session attached by the login is revoked again (the vault
        // is still locked, so nothing synced with it).
        if (info.userId !== profile.userId) {
          await failUnlock("account_changed");
          return false;
        }
        return await unlock(info);
      }
    }
    setUnlockError("failed");
    return false;
  }

  /**
   * Unlock by email + password while the server can't be reached. Only the
   * account stored on this device can be unlocked like this.
   */
  async function offlineUnlock(email: string, password: string): Promise<boolean> {
    const { profile } = store;
    if (profile?.mode !== "linked" || normalizeEmail(email) !== profile.email) {
      setUnlockError("wrong_account");
      return false;
    }
    return await unlockLocal(password);
  }

  /** Derive the KEK and open the local copy of the keyring. Resolves `false` on a wrong password. */
  async function unlockWithPassword(
    profile: LocalProfile,
    material: AccountKeyMaterial,
    password: string,
  ): Promise<boolean> {
    try {
      const passwordKek = await derivePasswordKek(password, material);
      unlockVault(
        profile.mode,
        passwordKek,
        material.encryptedAccountKey,
        material.accountKeyEncryptionNonce,
        await store.vault.getVaults(),
        material.userKeyPair,
      );
      return true;
    } catch (e) {
      console.error("Vault unlock failed", e);
      return false;
    }
  }

  /**
   * Make the local database the logged-in account's: keep it when it already
   * is (same `userId`), otherwise clear the other account's leftovers before any
   * of it is decrypted with the wrong keys. A vault without an account is never
   * replaced silently: resolves `false`.
   */
  async function adoptAccount(info: VaultUnlockInfo, material: AccountKeyMaterial) {
    const { profile } = store;
    if (profile?.mode === "local") return false;

    const email = normalizeEmail(info.email);
    const sameAccount = profile?.mode === "linked" && profile.userId === info.userId;
    if (!sameAccount) await store.vault.clear();

    const nextProfile: LocalProfile | undefined =
      sameAccount && profile.email === email
        ? undefined
        : {
            profileId: sameAccount ? profile.profileId : crypto.randomUUID(),
            mode: "linked",
            email,
            userId: info.userId,
          };
    await store.saveAccount(material, info.vaultKeys, nextProfile);
    return true;
  }

  function afterUnlock(password: string) {
    // Store password temporarily for biometric enrollment (only if enrollment is upcoming).
    // Same tick as the unlock, so the enroll redirect already sees it.
    if (store.needsBiometricEnroll) secretsStore.setPassword(password);
    initDecryptWorker();
  }

  function clearPasswordIfDone(result: ConnectResult) {
    if (canReleasePassword(result, store.needsBiometricEnroll)) secretsStore.clearPassword();
  }

  /**
   * After an online login the server session is already live, but a locked vault
   * can't use it: revoke it (best-effort) and drop its keys so the app doesn't sit
   * with a server session and a locked vault.
   */
  async function failUnlock(error: UnlockError) {
    setUnlockError(error);
    if (!secretsStore.hasServerSession) return;

    await endServerSession(trpc);
    lock();
  }

  /** Unlock with the account key behind the platform authenticator (web, WebAuthn PRF). */
  async function biometricUnlock() {
    const { profile, accountKeyMaterial: material, biometricKeyMaterial } = store;
    if (!biometricKeyMaterial || !profile || !material) return;

    const { accountKey, password } = await authenticateBiometric(biometricKeyMaterial);
    try {
      unlockWithAccountKey(
        profile.mode,
        accountKey,
        await store.vault.getVaults(),
        material.userKeyPair,
      );
    } catch (e) {
      // A vault key or keypair that doesn't open (or no personal vault).
      console.error("Biometric vault unlock failed", e);
      setUnlockError("failed");
      throw e;
    }
    initDecryptWorker();

    if (profile.mode === "linked") {
      secretsStore.setPassword(password);
      if (!networkOffline) void connect(password).then(clearPasswordIfDone);
    }
  }

  const clearUnlockError = useCallback(() => setUnlockError(undefined), []);

  return { unlockError, clearUnlockError, unlock, unlockLocal, offlineUnlock, biometricUnlock };
}
