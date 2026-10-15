import { authenticateBiometric, deriveOpaquePassword, normalizeEmail, wipe } from "@repo/crypto";
import type { AccountKeyMaterial, VaultUnlockInfo } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { rekeyIfBelowFloor, rekeyLocalIfBelowFloor } from "../account/rekey-password-keys";
import type { SecondFactorPrompt } from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
import { SessionContext } from "../providers/SessionProvider";
import { type ActiveProfile, useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { derivePasswordKek } from "../util/derive-password-kek";
import { endServerSession } from "../util/end-server-session";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import {
  type ConnectResult,
  canReleaseOpaquePassword,
  useConnectServer,
} from "./use-connect-server";
import { hasDeviceLogin, useDeviceLogin } from "./use-device-login";
import { useLogin } from "./use-login";

/**
 * - `failed`: wrong password, or the key derivation failed
 * - `wrong_account`: offline, and no profile on this device has this email
 *   (adding an account needs the server)
 */
export type UnlockError = "failed" | "wrong_account";

export function useUnlock() {
  const [unlockError, setUnlockError] = useState<UnlockError>();
  const { unlockVault, unlockWithAccountKey, lock, networkOffline } = useContext(SessionContext);
  const store = useStore();
  const { loginUser } = useLogin();
  const contextPrompt = useSecondFactorPrompt();
  const { connect, connectWithDevice } = useConnectServer();
  const deviceLogin = useDeviceLogin();
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

    afterUnlock();
    await persistSession(opened.entry.profileId);

    // Raise a wrap below the Argon2 floor. Best-effort; failures don't block login.
    void rekeyIfBelowFloor(trpc, password, material).then(async (rekeyed) => {
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
  async function unlockLocal(
    password: string,
    onSecondFactor?: SecondFactorPrompt,
  ): Promise<boolean> {
    setUnlockError(undefined);
    const active = store.current();
    const profile = active?.profile;
    const material = active?.accountKeyMaterial;
    if (!active || !profile || !material) {
      setUnlockError("failed");
      return false;
    }

    // Kept for the reconnect: `useAutoReconnect` retries with it once online.
    const opaquePassword =
      profile.mode === "linked" ? await deriveOpaquePassword(password, profile.email) : undefined;
    if (await unlockWithPassword(active, password)) {
      afterUnlock(opaquePassword);
      await persistSession(active.entry.profileId);
      if (profile.mode === "local") void rekeyLocal(active, password, material);
      if (profile.mode === "linked" && !networkOffline)
        void connect(password).then(releaseIfDone(active));
      return true;
    }
    if (opaquePassword) wipe(opaquePassword);

    if (profile.mode === "linked" && !networkOffline) {
      // A closed code prompt isn't a wrong password: no error for it.
      let cancelled = false;
      const ask = onSecondFactor ?? contextPrompt;
      const tracked: SecondFactorPrompt = Object.assign(
        async (state: { invalid: boolean }) => {
          const code = await ask(state);
          if (code === null) cancelled = true;
          return code;
        },
        { done: ask.done },
      );
      const info = await loginUser(profile.email, password, tracked);
      if (info) return await unlock(info);
      if (cancelled) return false;
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
  async function unlockByEmail(
    email: string,
    password: string,
    onSecondFactor?: SecondFactorPrompt,
  ): Promise<boolean | undefined> {
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
      return await unlockLocal(password, onSecondFactor);
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

  /** Local profile: raise a password wrap below the Argon2 floor, on the device only. */
  async function rekeyLocal(active: ActiveProfile, password: string, material: AccountKeyMaterial) {
    try {
      const rekeyed = await rekeyLocalIfBelowFloor(password, material);
      if (rekeyed)
        await store.saveAccount(active.entry.profileId, rekeyed, await active.vault.getVaults());
    } catch (e) {
      console.error("Storing the rekeyed password wrap failed", e);
    }
  }

  /**
   * Same tick as the unlock, so the biometric enroll redirect already sees the
   * OPAQUE password (an unlock without the server). An online unlock keeps
   * none: enrolling uses the attached session.
   */
  function afterUnlock(opaquePassword?: Uint8Array) {
    if (opaquePassword) secretsStore.keepOpaquePassword(opaquePassword);
    initDecryptWorker();
  }

  function releaseIfDone(active: ActiveProfile) {
    return (result: ConnectResult) => {
      if (canReleaseOpaquePassword(result, store.needsBiometricEnrollFor(active)))
        secretsStore.clearOpaquePassword();
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

  /**
   * Unlock the active profile with the account key behind the platform
   * authenticator (web, WebAuthn PRF). A linked profile's prompt also signs a
   * device login (`hasDeviceLogin`), which attaches server auth afterwards;
   * without the server the vault opens `offline`.
   */
  async function biometricUnlock() {
    const active = store.current();
    if (!active) return;
    const { profile, accountKeyMaterial: material, biometricKeyMaterial } = active;
    if (!biometricKeyMaterial || !profile || !material) return;

    const login =
      profile.mode === "linked" && hasDeviceLogin(biometricKeyMaterial) && !networkOffline
        ? await deviceLogin.take(biometricKeyMaterial.credentialId)
        : undefined;
    let unlocked: Awaited<ReturnType<typeof authenticateBiometric>>;
    try {
      unlocked = await authenticateBiometric(biometricKeyMaterial, login?.challenge);
    } catch (e) {
      login?.discard();
      throw e;
    }
    const { accountKey, assertion } = unlocked;
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
      login?.discard();
      setUnlockError("failed");
      throw e;
    }
    initDecryptWorker();

    if (!login || !assertion) {
      login?.discard();
      return;
    }
    void connectWithDevice((session, email, ask) =>
      login.finish(assertion, session, email, ask),
    ).then((result) => deviceLogin.settle(login, result));
  }

  /** Start the biometric unlock's device login ahead of the click (see `useDeviceLogin`). */
  function prepareBiometricUnlock() {
    const active = store.current();
    const material = active?.biometricKeyMaterial;
    if (active?.profile?.mode === "linked" && hasDeviceLogin(material) && !networkOffline)
      deviceLogin.prepare(material.credentialId);
  }

  const clearUnlockError = useCallback(() => setUnlockError(undefined), []);

  return {
    unlockError,
    clearUnlockError,
    unlock,
    unlockLocal,
    unlockByEmail,
    biometricUnlock,
    prepareBiometricUnlock,
    dropPreparedUnlock: deviceLogin.drop,
  };
}

/**
 * The biometric unlock button's side: its device login is prepared while the
 * button is shown (and again after a failed try), dropped when it goes.
 */
export function useBiometricUnlock() {
  const { biometricUnlock, prepareBiometricUnlock, dropPreparedUnlock } = useUnlock();
  const prepareRef = useRef(prepareBiometricUnlock);
  prepareRef.current = prepareBiometricUnlock;
  const dropRef = useRef(dropPreparedUnlock);
  dropRef.current = dropPreparedUnlock;

  useEffect(() => {
    prepareRef.current();
    return () => dropRef.current();
  }, []);

  async function unlock() {
    try {
      await biometricUnlock();
    } catch (e) {
      prepareBiometricUnlock();
      throw e;
    }
  }

  return { unlock };
}
