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
  const { profile, removeVault } = useStore();
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

    // This device's cached copy of the account is now stale: the local wrap
    // needs the old password and biometric material holds it. Drop it so the
    // next login starts clean. Another account's vault is left alone.
    // TODO(offline-first): keep the local data and rewrap instead (ADR 0001 D10).
    if (profile?.mode === "linked" && profile.email === normalizeEmail(email)) await removeVault();

    return newRecoveryKey;
  }

  return { recover, recoveryError };
}
