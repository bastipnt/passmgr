import { normalizeEmail } from "@repo/crypto";
import { useState } from "react";
import { LoginThrottledError } from "../login";
import { useStore } from "../providers/StoreProvider";
import { RecoveryFailedError, RecoveryKeyInvalidError, recoverAccount } from "../recover";
import { useTRPCClient } from "../util/trpc";

export type RecoveryError = "invalid_key" | "failed" | "throttled";

/** User-facing text for each recovery error (web + mobile). */
export const RECOVERY_ERROR_MESSAGES: Record<RecoveryError, string> = {
  invalid_key: "That doesn't look like a recovery key. Paste it exactly as it was shown.",
  failed: "Recovery failed. Check the email and recovery key and try again.",
  throttled: "Too many attempts. Please wait and try again.",
};

export function useRecovery() {
  const trpc = useTRPCClient();
  const store = useStore();
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
    // TODO(offline-first): keep the local data and rewrap instead (ADR 0001 D10).
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

  return { recover, recoveryError };
}
