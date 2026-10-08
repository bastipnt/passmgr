import { authenticateBiometric, normalizeEmail, wipe } from "@repo/crypto";
import { argon2WorkerService } from "@repo/crypto/services/argon2-worker-service";
import type { AccountKeyMaterial, PasswordKeySchema, VaultUnlockInfo } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { fromBase64 } from "@repo/util";
import { useCallback, useContext, useState } from "react";
import { rekeyIfParamsStale, rekeyLocalIfParamsStale } from "../account/rekey-password-keys";
import { SessionContext } from "../providers/SessionProvider";
import { type ActiveProfile, useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { endServerSession } from "../util/end-server-session";
import { timed } from "../util/perf";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { type ConnectResult, canReleasePassword, useConnectServer } from "./use-connect-server";
import { useLogin } from "./use-login";

/**
 * - `failed`: wrong password, or the key derivation failed
 * - `wrong_account`: offline, and no profile on this device has this email
 *   (adding an account needs the server)
 */
export type UnlockError = "failed" | "wrong_account";

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
   * After an online login (`loginUser`, server session attached): open the
   * account's profile (adding one for an account new to this device, ADR 0001
   * D2), derive the password KEK, unwrap the account key and with it the vault
   * keys. Other profiles are never touched. Resolves `false` on a wrong
   * password (or a vault key that doesn't open), with the server session
   * revoked again.
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
    let opened: ActiveProfile;
    try {
      opened = await store.openAccountProfile(
        { userId: info.userId, email: normalizeEmail(info.email) },
        material,
        vaultKeys,
      );
    } catch (e) {
      console.error("Opening the account's profile failed", e);
      wipe(passwordKek);
      await failUnlock("failed");
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

    afterUnlock(opened, password);
    await persistSession(opened.entry.profileId);

    // Transparently migrate to the current Argon2 params if the stored ones
    // are stale. Best-effort; failures don't block login.
    void rekeyIfParamsStale(trpc, password, material).then(async (rekeyed) => {
      if (rekeyed) await store.saveAccount(opened.entry.profileId, rekeyed, vaultKeys);
    });
    return true;
  }

  /**
   * Unlock the active profile with the password, without the server (ADR 0001
   * D2): the profile says whose vault it is, no email needed. A linked vault
   * then attaches server auth in the background; until that works the session
   * is `offline`.
   *
   * When the password doesn't open the local copy of a linked vault, it may
   * have been changed on another device: online, the server login decides.
   * Should the email now belong to another account, that account gets a
   * profile of its own; this one stays as it is.
   */
  async function unlockLocal(password: string): Promise<boolean> {
    setUnlockError(undefined);
    const active = store.current();
    const profile = active?.profile;
    const material = active?.accountKeyMaterial;
    if (!active || !profile || !material) {
      setUnlockError("failed");
      return false;
    }

    if (await unlockWithPassword(active, password)) {
      afterUnlock(active, password);
      await persistSession(active.entry.profileId);
      if (profile.mode === "local") void rekeyLocal(active, password, material);
      if (profile.mode === "linked") {
        // Kept for the reconnect: `useAutoReconnect` retries with it once online.
        secretsStore.setPassword(password);
        if (!networkOffline) void connect(password).then(clearPasswordIfDone(active));
      }
      return true;
    }

    if (profile.mode === "linked" && !networkOffline) {
      const info = await loginUser(profile.email, password);
      if (info) return await unlock(info);
    }
    setUnlockError("failed");
    return false;
  }

  /**
   * Sign in by email + password, the way picking a profile would: when this
   * device has a profile for the email, it's opened and unlocked like a picked
   * one (`unlockLocal`: same data, no download). Resolves `undefined` when
   * there is none: the caller logs in to the server (`loginUser` + `unlock`),
   * which adds a profile. Offline that can't work: `wrong_account`.
   */
  async function unlockByEmail(email: string, password: string): Promise<boolean | undefined> {
    setUnlockError(undefined);
    const existing = store.profiles.find(
      (p) => p.mode === "linked" && p.email === normalizeEmail(email),
    );
    if (existing) {
      try {
        await store.selectProfile(existing.profileId);
      } catch (e) {
        console.error("Opening the profile failed", e);
        setUnlockError("failed");
        return false;
      }
      return await unlockLocal(password);
    }
    if (networkOffline) {
      setUnlockError("wrong_account");
      return false;
    }
    return undefined;
  }

  /** Derive the KEK and open the local copy of the keyring. Resolves `false` on a wrong password. */
  async function unlockWithPassword(active: ActiveProfile, password: string): Promise<boolean> {
    const { profile, accountKeyMaterial: material } = active;
    if (!profile || !material) return false;
    try {
      const passwordKek = await derivePasswordKek(password, material);
      unlockVault(
        profile.mode,
        passwordKek,
        material.encryptedAccountKey,
        material.accountKeyEncryptionNonce,
        await active.vault.getVaults(),
        material.userKeyPair,
      );
      return true;
    } catch (e) {
      console.error("Vault unlock failed", e);
      return false;
    }
  }

  /** Local profile: move the password wrap to the current Argon2 params, on the device only. */
  async function rekeyLocal(active: ActiveProfile, password: string, material: AccountKeyMaterial) {
    try {
      const rekeyed = await rekeyLocalIfParamsStale(password, material);
      if (rekeyed)
        await store.saveAccount(active.entry.profileId, rekeyed, await active.vault.getVaults());
    } catch (e) {
      console.error("Storing the rekeyed password wrap failed", e);
    }
  }

  function afterUnlock(active: ActiveProfile, password: string) {
    // Store password temporarily for biometric enrollment (only if enrollment is upcoming).
    // Same tick as the unlock, so the enroll redirect already sees it.
    if (store.needsBiometricEnrollFor(active)) secretsStore.setPassword(password);
    initDecryptWorker();
  }

  function clearPasswordIfDone(active: ActiveProfile) {
    return (result: ConnectResult) => {
      if (canReleasePassword(result, store.needsBiometricEnrollFor(active)))
        secretsStore.clearPassword();
    };
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

  /** Unlock the active profile with the account key behind the platform authenticator (web, WebAuthn PRF). */
  async function biometricUnlock() {
    const active = store.current();
    if (!active) return;
    const { profile, accountKeyMaterial: material, biometricKeyMaterial } = active;
    if (!biometricKeyMaterial || !profile || !material) return;

    const { accountKey, password } = await authenticateBiometric(biometricKeyMaterial);
    try {
      unlockWithAccountKey(
        profile.mode,
        accountKey,
        await active.vault.getVaults(),
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
      if (!networkOffline) void connect(password).then(clearPasswordIfDone(active));
    }
  }

  const clearUnlockError = useCallback(() => setUnlockError(undefined), []);

  return { unlockError, clearUnlockError, unlock, unlockLocal, unlockByEmail, biometricUnlock };
}
