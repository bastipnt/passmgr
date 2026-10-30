import { secretsStore } from "@repo/store";
import { useCallback, useContext, useRef, useState } from "react";
import { WrongPasswordError } from "../account/change-password";
import {
  AccountDeletionFailedError,
  AccountDeletionUnconfirmedError,
  deleteAccount,
  SoleVaultOwnerError,
} from "../account/delete-account";
import {
  LoginThrottledError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
} from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import { useLock } from "./use-lock";

/**
 * - `wrong_password`: the password is wrong
 * - `offline`: no server session; deleting needs the server
 * - `throttled`: too many login attempts, retry later
 * - `second_factor`: the login's two-factor step didn't finish (closed, or ran out)
 * - `sole_owner`: the account alone owns a shared vault others are in
 * - `failed`: the server couldn't be reached or refused; nothing was deleted
 * - `unconfirmed`: no answer came back; the account may be gone
 * - `maybe_deleted`: the password doesn't log in after an `unconfirmed`: most
 *   likely the deletion went through
 */
export type DeleteAccountError =
  | "wrong_password"
  | "offline"
  | "throttled"
  | "second_factor"
  | "sole_owner"
  | "failed"
  | "unconfirmed"
  | "maybe_deleted";

/** User-facing text for each account deletion error (web + mobile). */
export const DELETE_ACCOUNT_ERROR_MESSAGES: Record<DeleteAccountError, string> = {
  wrong_password: "That's not your password.",
  offline: "Deleting your account needs a connection to the server. Try again once you're online.",
  throttled: "Too many attempts. Please wait and try again.",
  second_factor: "The two-factor step of the sign-in didn't finish. Nothing was deleted.",
  sole_owner:
    "You're the only owner of shared vaults other people are in. Make someone else an owner or delete them first.",
  failed: "The account couldn't be deleted. Nothing was changed.",
  unconfirmed:
    "The server didn't confirm the deletion. Your account may already be gone; if you can still sign in, try again.",
  maybe_deleted:
    "Signing in with this password failed. Your account was most likely deleted already: remove the vault from this device.",
};

/**
 * Delete the account of the unlocked `linked` profile for good (online only):
 * the server deletes every record, its history, the keys and the sessions,
 * then the profile is removed from this device. Other devices are signed out
 * and keep their local copy until removed there.
 */
export function useDeleteAccount() {
  const [deleteError, setDeleteError] = useState<DeleteAccountError>();
  const [deleting, setDeleting] = useState(false);
  /** The shared vaults to hand over or delete first (`sole_owner`). */
  const [soleOwnedVaultIds, setSoleOwnedVaultIds] = useState<string[]>([]);
  // A deletion went unanswered: the account may be gone, and its login with it.
  const unconfirmed = useRef(false);
  const { mode, networkOffline, attachServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  const prompt = useSecondFactorPrompt();
  const lock = useLock();

  const blocked = mode !== "online" || networkOffline;

  /** Resolves whether the account was deleted (and this device's copy removed). */
  async function deleteAccountForGood(password: string): Promise<boolean> {
    setDeleteError(undefined);
    setSoleOwnedVaultIds([]);
    setDeleting(true);
    try {
      const error = await run(password);
      setDeleteError(error);
      return error === undefined;
    } finally {
      setDeleting(false);
    }
  }

  async function run(password: string): Promise<DeleteAccountError | undefined> {
    const active = store.current();
    const profile = active?.profile;
    if (!active || profile?.mode !== "linked" || !secretsStore.isVaultUnlocked) return "failed";
    if (blocked || !secretsStore.hasServerSession) return "offline";

    try {
      await deleteAccount(trpc, attachServer, profile, password, prompt);
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        // A deleted account answers like a wrong password (no enumeration).
        return unconfirmed.current ? "maybe_deleted" : "wrong_password";
      }
      if (e instanceof LoginThrottledError) return "throttled";
      if (e instanceof SecondFactorCancelledError || e instanceof SecondFactorExpiredError)
        return "second_factor";
      if (e instanceof SoleVaultOwnerError) {
        setSoleOwnedVaultIds(e.vaultIds);
        return "sole_owner";
      }
      if (e instanceof AccountDeletionUnconfirmedError) {
        unconfirmed.current = true;
        return "unconfirmed";
      }
      if (!(e instanceof AccountDeletionFailedError)) console.error("Account deletion failed", e);
      return "failed";
    }

    // Lock first: it stops the sync, so nothing writes into the database
    // while it's being deleted.
    const { profileId } = active.entry;
    lock();
    try {
      await store.removeProfile(profileId);
    } catch (e) {
      // The account is gone either way; the profile can be removed from the list.
      console.error("Removing the deleted account's profile failed", e);
    }
    return undefined;
  }

  const clearDeleteError = useCallback(() => setDeleteError(undefined), []);

  return {
    deleteAccount: deleteAccountForGood,
    deleteError,
    clearDeleteError,
    soleOwnedVaultIds,
    deleting,
    blocked,
  };
}
