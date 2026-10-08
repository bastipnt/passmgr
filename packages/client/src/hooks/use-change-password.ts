import type { AccountKeyMaterial } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useCallback, useContext, useState } from "react";
import {
  changeAccountPassword,
  changeLocalPassword,
  PasswordChangeFailedError,
  PasswordChangeUnconfirmedError,
  WrongPasswordError,
} from "../account/change-password";
import { LoginThrottledError } from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { type ActiveProfile, useStore } from "../providers/StoreProvider";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { canReleasePassword, useConnectServer } from "./use-connect-server";

/**
 * - `wrong_password`: the current password is wrong
 * - `offline`: a linked vault without a server session; the change waits
 *   until it's online (ADR 0001 D10: the key sets would diverge otherwise)
 * - `throttled`: too many login attempts, retry later
 * - `failed`: the server couldn't be reached or refused, or storing failed
 * - `unconfirmed`: the change got no answer and the server can't be reached to
 *   check; the next login with either password tells
 */
export type ChangePasswordError =
  | "wrong_password"
  | "offline"
  | "throttled"
  | "failed"
  | "unconfirmed";

/** User-facing text for each password change error (web + mobile). */
export const CHANGE_PASSWORD_ERROR_MESSAGES: Record<ChangePasswordError, string> = {
  wrong_password: "That's not your current password.",
  offline:
    "Changing the password of an online account needs a connection to the server. Try again once you're online.",
  throttled: "Too many attempts. Please wait and try again.",
  failed: "The password couldn't be changed. Your current password still works.",
  unconfirmed:
    "The server didn't confirm the change. Sign in with your new password next time; if that doesn't work, your current password still does.",
};

/**
 * Change the master password of the unlocked profile (ADR 0001 D10), the same
 * call for both modes:
 *
 * - `local`: rewrap the account key on the device, no server.
 * - `linked`: needs the server (`online`); offline it is refused (`blocked`).
 *   A new OPAQUE registration and password wrap replace the server's, which
 *   signs out every device, then this one logs in again with the new password.
 *
 * Either way only the account key wrap changes: vault keys, records and the
 * recovery key stay. Biometric unlock is dropped (it holds the old password)
 * and offered again at the next unlock.
 */
export function useChangePassword() {
  const [changeError, setChangeError] = useState<ChangePasswordError>();
  const [changing, setChanging] = useState(false);
  const { mode, networkOffline, attachServer, detachServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  const { connect } = useConnectServer();

  /** A linked vault that can't reach the server right now. */
  const blocked = mode === "offline" || (mode === "online" && networkOffline);

  /** Resolves whether the password was changed. */
  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    setChangeError(undefined);
    setChanging(true);
    try {
      const error = await change(currentPassword, newPassword);
      setChangeError(error);
      return error === undefined;
    } finally {
      setChanging(false);
    }
  }

  async function change(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordError | undefined> {
    const active = store.current();
    const profile = active?.profile;
    const material = active?.accountKeyMaterial;
    if (!active || !profile || !material || !secretsStore.isVaultUnlocked) return "failed";
    if (profile.mode === "linked" && (blocked || !secretsStore.hasServerSession)) return "offline";

    let changed: AccountKeyMaterial;
    try {
      changed =
        profile.mode === "local"
          ? await changeLocalPassword(material, currentPassword, newPassword)
          : await changeAccountPassword(
              trpc,
              attachServer,
              profile,
              material,
              currentPassword,
              newPassword,
            );
    } catch (e) {
      if (e instanceof PasswordChangeUnconfirmedError)
        return await confirmChange(active, currentPassword, newPassword);
      if (e instanceof WrongPasswordError) return "wrong_password";
      if (e instanceof LoginThrottledError) return "throttled";
      if (!(e instanceof PasswordChangeFailedError)) console.error("Password change failed", e);
      return "failed";
    }

    try {
      await store.saveAccount(active.entry.profileId, changed, await active.vault.getVaults());
    } catch (e) {
      // Linked: the server has the new password, and the next unlock with it
      // falls back to the server login. Local: the old password still works.
      console.error("Storing the new password wrap failed", e);
      return "failed";
    }

    await dropQuickUnlock(active);
    if (profile.mode === "linked") await reconnect(active, newPassword);
    else await persistSession(active.entry.profileId);
    return undefined;
  }

  /**
   * The change got no answer: a login with the new password tells whether the
   * server took it (it then stores the server's new wrap, `useConnectServer`).
   * When it didn't, go back online with the current password.
   */
  async function confirmChange(
    active: ActiveProfile,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordError | undefined> {
    detachServer();
    const result = await connect(newPassword);
    if (result === "online") {
      await dropQuickUnlock(active);
      // Dropping it removed the mobile login the connect had just persisted.
      await persistSession(active.entry.profileId);
      return undefined;
    }
    if (result === "rejected") {
      const restored = await connect(currentPassword);
      if (restored !== "online") secretsStore.setPassword(currentPassword);
      return "failed";
    }
    // Unknown: `useAutoReconnect` tries the new password once it can.
    secretsStore.setPassword(newPassword);
    await persistSession(active.entry.profileId);
    return "unconfirmed";
  }

  async function dropQuickUnlock(active: ActiveProfile) {
    try {
      await store.forgetQuickUnlock(active.entry.profileId);
    } catch (e) {
      console.error("Removing the biometric unlock failed", e);
    }
  }

  /**
   * The change revoked every session: log in again with the new password.
   * When that doesn't work now, `useAutoReconnect` retries with the password
   * kept in memory. Biometric enrollment comes with the next unlock, so it
   * doesn't keep the password around.
   */
  async function reconnect(active: ActiveProfile, newPassword: string) {
    detachServer();
    secretsStore.setPassword(newPassword);
    const result = await connect(newPassword);
    if (canReleasePassword(result, false)) secretsStore.clearPassword();
    if (result !== "online") await persistSession(active.entry.profileId);
  }

  const clearChangeError = useCallback(() => setChangeError(undefined), []);

  return { changePassword, changeError, clearChangeError, changing, blocked };
}
