import { deriveOpaquePassword, normalizeEmail, wipe } from "@repo/crypto";
import type { PendingRecovery } from "@repo/schema";
import type { ProfileEntry } from "@repo/store";
import { useCallback, useContext, useState } from "react";
import { LoginThrottledError } from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import {
  checkLocalRecoveryKey,
  finishPendingRecovery,
  parseRecoveryKey,
  RecoveryFailedError,
  RecoveryKeyInvalidError,
  recoverAccount,
  recoverLinkedVault,
  recoverLocalVault,
} from "../recover";
import { useTRPCClient } from "../util/trpc";

/**
 * - `invalid_key`: not a well-formed recovery key
 * - `failed`: wrong email or recovery key, or the server failed
 * - `wrong_key`: the recovery key doesn't open the recovery wrap on this device
 * - `throttled`: too many attempts, retry later
 * - `offline`: the account has no recovery wrap on this device, so its
 *   recovery needs the server (ADR 0001 D10 amended)
 */
export type RecoveryError = "invalid_key" | "failed" | "wrong_key" | "throttled" | "offline";

/** User-facing text for each recovery error (web + mobile). */
export const RECOVERY_ERROR_MESSAGES: Record<RecoveryError, string> = {
  invalid_key: "That doesn't look like a recovery key. Paste it exactly as it was shown.",
  failed: "Recovery failed. Check the email and recovery key and try again.",
  wrong_key: "That recovery key doesn't open this vault. Check it and try again.",
  throttled: "Too many attempts. Please wait and try again.",
  offline:
    "This device can't reset this account's password on its own. Try again once you're online.",
};

/** The linked profile of an account on this device, by email. */
export function accountProfileEntry(profiles: readonly ProfileEntry[], email: string) {
  return profiles.find((p) => p.mode === "linked" && p.email === normalizeEmail(email));
}

/** An account's reset while offline, when its profile is on this device (web + mobile). */
export const RECOVERY_OFFLINE_NOTE =
  "The new password works on this device right away. Your account switches to it once you're online.";

export function useRecovery() {
  const trpc = useTRPCClient();
  const store = useStore();
  const { networkOffline } = useContext(SessionContext);
  const [recoveryError, setRecoveryError] = useState<RecoveryError | undefined>();

  /**
   * The recovery key on its own, before the new password: its format, and
   * whether it opens the recovery wrap on this device (the active `local`
   * profile's, or with `email` the account's cached one). An account's key the
   * device can't check (no wrap, or one the key doesn't open while online: it
   * may have changed on another device) is left to the server (`recover`).
   */
  async function checkRecoveryKey(recoveryKey: string, email?: string): Promise<boolean> {
    setRecoveryError(undefined);
    try {
      if (email === undefined) {
        const recovery = await store.current()?.vault.getRecoveryKeyMaterial();
        if (!recovery) throw new Error("The local vault has no recovery wrap");
        await checkLocalRecoveryKey(recovery, recoveryKey);
        return true;
      }
      wipe(parseRecoveryKey(recoveryKey));
      const wrap = await accountRecoveryWrap(email);
      if (!wrap) {
        if (!networkOffline) return true;
        setRecoveryError("offline");
        return false;
      }
      try {
        await checkLocalRecoveryKey(wrap, recoveryKey);
      } catch (err) {
        if (!(err instanceof RecoveryFailedError) || networkOffline) throw err;
      }
      return true;
    } catch (err) {
      if (err instanceof RecoveryKeyInvalidError) setRecoveryError("invalid_key");
      else if (err instanceof RecoveryFailedError) setRecoveryError("wrong_key");
      else {
        console.error("Checking the recovery key failed", err);
        setRecoveryError("failed");
      }
      return false;
    }
  }

  /** The linked profile of `email` on this device, opened (recovery is a locked-screen flow). */
  async function accountProfile(email: string) {
    const entry = accountProfileEntry(store.profiles, email);
    return entry ? await store.selectProfile(entry.profileId) : null;
  }

  async function accountRecoveryWrap(email: string) {
    return (await (await accountProfile(email))?.vault.getRecoveryWrap()) ?? null;
  }

  const clearRecoveryError = useCallback(() => setRecoveryError(undefined), []);

  /**
   * Reset an account's master password with the recovery key. On this device
   * first when it has the account's recovery wrap (ADR 0001 D10 amended): the
   * vault opens with the new password at once. Online the server takes the
   * reset right away (refused: nothing changes); offline, or unreachable, the
   * next connect finishes it. Otherwise (or when that wrap no longer matches
   * the key, online) through the server, which needs a connection.
   *
   * @returns the new recovery key (show once, then wipe), or undefined on failure
   */
  async function recover(
    email: string,
    recoveryKey: string,
    newPassword: string,
  ): Promise<Uint8Array | undefined> {
    setRecoveryError(undefined);
    const onDevice = await recoverOnDevice(email, recoveryKey, newPassword);
    if (onDevice !== "server") return onDevice;
    if (networkOffline) {
      setRecoveryError("offline");
      return;
    }
    let newRecoveryKey: Uint8Array;
    try {
      newRecoveryKey = await recoverAccount(trpc, email, recoveryKey, newPassword);
    } catch (err) {
      if (err instanceof RecoveryKeyInvalidError) setRecoveryError("invalid_key");
      else if (err instanceof LoginThrottledError) setRecoveryError("throttled");
      else if (err instanceof RecoveryFailedError) setRecoveryError("failed");
      else throw err;
      return;
    }

    // This device's profile of the account is now stale: the local wrap needs
    // the old password and biometric material holds it. Remove it so the next
    // login starts clean. Other profiles are left alone. Changes that never
    // reached the server exist only here, so then the profile stays: the next
    // login with the new password replaces the stale wrap (the local one
    // doesn't open, so the unlock goes through the server). Only the quick
    // unlocks go, so nothing opens it without a password. The vault is locked
    // here (recovery is a locked-screen flow), so removing never needs a lock.
    const stale = store.profiles.find(
      (p) => p.mode === "linked" && p.email === normalizeEmail(email),
    );
    if (stale) {
      if ((await store.countPendingChanges(stale.profileId)) > 0)
        await store.forgetQuickUnlock(stale.profileId);
      else await store.removeProfile(stale.profileId);
    }

    return newRecoveryKey;
  }

  /**
   * `recover`'s reset on the device: the new key, undefined on failure, or
   * "server" when the device can't do it.
   */
  async function recoverOnDevice(
    email: string,
    recoveryKey: string,
    newPassword: string,
  ): Promise<Uint8Array | undefined | "server"> {
    let active: Awaited<ReturnType<typeof accountProfile>>;
    let recovered: Awaited<ReturnType<typeof recoverLinkedVault>>;
    try {
      active = await accountProfile(email);
      const material = active?.accountKeyMaterial;
      const [wrap, vaults, earlier] = active
        ? await Promise.all([
            active.vault.getRecoveryWrap(),
            active.vault.getVaults(),
            active.vault.getPendingRecovery(),
          ])
        : [null, [], null];
      if (!active || !material || !wrap) return "server";
      recovered = await recoverLinkedVault(
        material,
        wrap,
        vaults,
        earlier,
        recoveryKey,
        newPassword,
      );
    } catch (err) {
      if (err instanceof RecoveryKeyInvalidError) setRecoveryError("invalid_key");
      else if (err instanceof RecoveryFailedError) {
        if (!networkOffline) return "server";
        setRecoveryError("wrong_key");
      } else {
        console.error("Resetting the password on this device failed", err);
        setRecoveryError("failed");
      }
      return;
    }

    // Online, the server learns of it before the device does: a cached wrap
    // the key still opens may be stale (recovered elsewhere since).
    const sent = networkOffline
      ? "unreachable"
      : await sendNow(email, newPassword, recovered.serverRecovery);
    if (sent === "refused" || sent === "throttled") {
      wipe(recovered.recoveryKey);
      setRecoveryError(sent === "refused" ? "failed" : "throttled");
      return;
    }

    try {
      await store.saveLinkedRecovery(
        active.entry.profileId,
        recovered.material,
        recovered.recoveryWrap,
        recovered.pending,
      );
      if (sent === "done") await store.clearPendingRecovery(active.entry.profileId);
    } catch (err) {
      console.error("Storing the recovered key material failed", err);
      wipe(recovered.recoveryKey);
      setRecoveryError("failed");
      return;
    }
    try {
      await store.forgetQuickUnlock(active.entry.profileId);
    } catch (err) {
      console.error("Removing the quick unlock failed", err);
    }
    return recovered.recoveryKey;
  }

  async function sendNow(email: string, newPassword: string, pending: PendingRecovery) {
    const opaquePassword = await deriveOpaquePassword(newPassword, email);
    try {
      await finishPendingRecovery(trpc, email, opaquePassword, pending);
      return "done";
    } catch (err) {
      if (err instanceof RecoveryFailedError) return "refused";
      if (err instanceof LoginThrottledError) return "throttled";
      return "unreachable";
    } finally {
      wipe(opaquePassword);
    }
  }

  /**
   * Reset the master password of the active `local` profile with its recovery
   * key, on the device only (ADR 0001 D10): same account key, new password
   * wrap, new recovery key. Biometric unlock goes (it holds the old password):
   * afterwards only the new password opens the vault.
   *
   * @returns the new recovery key (show once, then wipe), or undefined on failure
   */
  async function recoverLocal(
    recoveryKey: string,
    newPassword: string,
  ): Promise<Uint8Array | undefined> {
    setRecoveryError(undefined);
    const active = store.current();
    const material = active?.accountKeyMaterial;
    if (!active || active.profile?.mode !== "local" || !material) {
      setRecoveryError("failed");
      return;
    }

    let recovered: Awaited<ReturnType<typeof recoverLocalVault>>;
    try {
      const [recovery, vaults] = await Promise.all([
        active.vault.getRecoveryKeyMaterial(),
        active.vault.getVaults(),
      ]);
      if (!recovery) throw new Error("The local vault has no recovery wrap");
      recovered = await recoverLocalVault(material, recovery, vaults, recoveryKey, newPassword);
    } catch (err) {
      if (err instanceof RecoveryKeyInvalidError) setRecoveryError("invalid_key");
      else if (err instanceof RecoveryFailedError) setRecoveryError("wrong_key");
      else {
        console.error("Local recovery failed", err);
        setRecoveryError("failed");
      }
      return;
    }

    try {
      await store.saveLocalKeyMaterial(
        active.entry.profileId,
        recovered.material,
        recovered.recovery,
      );
    } catch (err) {
      // Nothing changed: the old recovery key still works.
      console.error("Storing the recovered key material failed", err);
      wipe(recovered.recoveryKey);
      setRecoveryError("failed");
      return;
    }
    try {
      await store.forgetQuickUnlock(active.entry.profileId);
    } catch (err) {
      console.error("Removing the biometric unlock failed", err);
    }
    return recovered.recoveryKey;
  }

  return { checkRecoveryKey, recover, recoverLocal, recoveryError, clearRecoveryError };
}
