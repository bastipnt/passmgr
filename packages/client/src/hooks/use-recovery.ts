import { normalizeEmail, wipe } from "@repo/crypto";
import { useContext, useState } from "react";
import { LoginThrottledError } from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import {
  RecoveryFailedError,
  RecoveryKeyInvalidError,
  recoverAccount,
  recoverLocalVault,
} from "../recover";
import { useTRPCClient } from "../util/trpc";

/**
 * - `invalid_key`: not a well-formed recovery key
 * - `failed`: wrong email or recovery key, or the server failed
 * - `wrong_key`: the recovery key doesn't open this device's vault (local)
 * - `throttled`: too many attempts, retry later
 * - `offline`: an account's recovery needs the server (ADR 0001 D10)
 */
export type RecoveryError = "invalid_key" | "failed" | "wrong_key" | "throttled" | "offline";

/** User-facing text for each recovery error (web + mobile). */
export const RECOVERY_ERROR_MESSAGES: Record<RecoveryError, string> = {
  invalid_key: "That doesn't look like a recovery key. Paste it exactly as it was shown.",
  failed: "Recovery failed. Check the email and recovery key and try again.",
  wrong_key: "That recovery key doesn't open this vault. Check it and try again.",
  throttled: "Too many attempts. Please wait and try again.",
  offline:
    "Resetting the password of an online account needs a connection to the server. Try again once you're online.",
};

export function useRecovery() {
  const trpc = useTRPCClient();
  const store = useStore();
  const { networkOffline } = useContext(SessionContext);
  const [recoveryError, setRecoveryError] = useState<RecoveryError | undefined>();

  /**
   * Reset the master password with the recovery key.
   *
   * @returns the new recovery key (show once, then wipe), or undefined on failure
   */
  async function recover(
    email: string,
    recoveryKey: string,
    newPassword: string,
  ): Promise<Uint8Array | undefined> {
    setRecoveryError(undefined);
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

  return { recover, recoverLocal, recoveryError };
}
