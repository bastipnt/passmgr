import {
  clearLoginBundle,
  hasLoginBundle,
  isPersistentLoginAvailable,
  loadLoginBundle,
  secretsStore,
} from "@repo/store";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { isSignedOut, isUnauthorized } from "../util/trpc-errors";

export type RestoreStatus = "restoring" | "restored" | "needs-login";
type RestoreResult = Exclude<RestoreStatus, "restoring"> | "signed-out";

/**
 * Restore the active profile's unlocked vault from OS secure storage (one
 * biometric prompt) instead of an Argon2 unlock (ADR 0001 D2). The vault keys
 * and keypair come from the local DB, unwrapped with the bundle's account key;
 * no server is needed to enter the app.
 *
 * `onUnlocked` runs as soon as the vault is open. A linked profile's persisted
 * server session is then checked with a heartbeat: an expired one only drops
 * the session (`online` → `offline`); one signed out from another device locks
 * (`signedOut`, resolves `"signed-out"`).
 */
function useRestoreLogin() {
  const { restoreLogin, detachServer, lock } = useContext(SessionContext);
  const { active, signedOut } = useStore();
  const trpc = useTRPCClient();

  return useCallback(
    async (onUnlocked?: () => void): Promise<RestoreResult> => {
      if (!isPersistentLoginAvailable() || !active) return "needs-login";

      const { profileId } = active.entry;
      const bundle = await loadLoginBundle(profileId);
      if (!bundle) return "needs-login";

      // Any failure — no profile, keys that don't open with the bundle's account
      // key — drops the bundle and falls back to the password unlock, instead of
      // leaving the app on the splash screen.
      try {
        const { profile, accountKeyMaterial, vault } = active;
        if (!profile || !accountKeyMaterial) throw new Error("No vault stored in this profile");
        restoreLogin(profile.mode, bundle, await vault.getVaults(), accountKeyMaterial.userKeyPair);
      } catch {
        lock();
        await clearLoginBundle(profileId);
        return "needs-login";
      }

      // Seed the decrypt worker with the restored vault keys — normally done by
      // the unlock; the restore path bypasses it, so do it here or record
      // decryption fails with "No key for vault".
      initDecryptWorker();
      onUnlocked?.();

      // A network error leaves the session as it is: the next sync tries again.
      if (secretsStore.hasServerSession) {
        try {
          await trpc.user.heartbeat.query();
        } catch (e) {
          if (isSignedOut(e)) {
            await signedOut();
            return "signed-out";
          }
          if (isUnauthorized(e)) {
            detachServer();
            await persistSession(profileId);
          }
        }
      }
      return "restored";
    },
    [restoreLogin, detachServer, lock, active, trpc, signedOut],
  );
}

/**
 * Mobile fast-unlock on app launch: restores the last used profile once.
 *
 * On web `isPersistentLoginAvailable()` is false, so this resolves straight to
 * `"needs-login"` without touching storage.
 */
export function useSessionRestore() {
  const { loaded } = useStore();
  const restore = useRestoreLogin();
  const [status, setStatus] = useState<RestoreStatus>(
    isPersistentLoginAvailable() ? "restoring" : "needs-login",
  );
  const attempted = useRef(false);

  const tryRestore = useCallback(async () => {
    // Wait for the profile list: the last used profile is the one restored.
    if (attempted.current || (isPersistentLoginAvailable() && !loaded)) return;
    attempted.current = true;
    const result = await restore(() => setStatus("restored"));
    setStatus(result === "signed-out" ? "needs-login" : result);
  }, [restore, loaded]);

  return { status, tryRestore };
}

/**
 * Unlock the active profile from its persisted login after a lock (mobile). `available` is
 * false on web, without a stored vault, or when no login is persisted for the profile.
 */
export function useBiometricRestore() {
  const { active, accountKeyMaterial } = useStore();
  const restore = useRestoreLogin();
  const [available, setAvailable] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const profileId = accountKeyMaterial ? active?.entry.profileId : undefined;

  useEffect(() => {
    let current = true;
    setAvailable(false);
    if (profileId)
      void hasLoginBundle(profileId).then((has) => {
        if (current) setAvailable(has);
      });
    return () => {
      current = false;
    };
  }, [profileId]);

  /** `"cancelled"`: the prompt was dismissed; `"unavailable"`: the persisted login is gone. */
  const unlock = useCallback(async (): Promise<
    "restored" | "signed-out" | "cancelled" | "unavailable"
  > => {
    if (!profileId) return "unavailable";
    setUnlocking(true);
    try {
      const result = await restore(() => setUnlocking(false));
      if (result !== "needs-login") return result;
      const still = await hasLoginBundle(profileId);
      setAvailable(still);
      return still ? "cancelled" : "unavailable";
    } finally {
      setUnlocking(false);
    }
  }, [restore, profileId]);

  return { available, unlocking, unlock };
}
