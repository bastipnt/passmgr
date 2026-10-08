import {
  clearLoginBundle,
  isPersistentLoginAvailable,
  loadLoginBundle,
  secretsStore,
} from "@repo/store";
import { useCallback, useContext, useRef, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { initDecryptWorker } from "../util/decrypt-record";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";
import { isUnauthorized } from "../util/trpc-errors";

export type RestoreStatus = "restoring" | "restored" | "needs-login";

/**
 * Mobile fast-unlock: on app launch, restore the last used profile's unlocked
 * vault from OS secure storage (one biometric prompt) instead of an Argon2 unlock (ADR 0001 D2).
 * The vault keys and keypair come from the local DB, unwrapped with the
 * bundle's account key; no server is needed to enter the app.
 *
 * A linked profile's persisted server session is checked with a heartbeat in
 * the background: one the server rejects only drops the session (`online` →
 * `offline`), it never forces a new login.
 *
 * On web `isPersistentLoginAvailable()` is false, so this resolves straight to
 * `"needs-login"` without touching storage.
 */
export function useSessionRestore() {
  const { restoreLogin, detachServer, lock } = useContext(SessionContext);
  const { loaded, active } = useStore();
  const trpc = useTRPCClient();
  const [status, setStatus] = useState<RestoreStatus>(
    isPersistentLoginAvailable() ? "restoring" : "needs-login",
  );
  const attempted = useRef(false);

  const tryRestore = useCallback(async () => {
    // Wait for the profile list: the last used profile is the one restored.
    if (attempted.current || (isPersistentLoginAvailable() && !loaded)) return;
    attempted.current = true;

    if (!isPersistentLoginAvailable() || !active) {
      setStatus("needs-login");
      return;
    }

    const { profileId } = active.entry;
    const bundle = await loadLoginBundle(profileId);
    if (!bundle) {
      setStatus("needs-login");
      return;
    }

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
      setStatus("needs-login");
      return;
    }

    // Seed the decrypt worker with the restored vault keys — normally done by
    // the unlock; the restore path bypasses it, so do it here or record
    // decryption fails with "No key for vault".
    initDecryptWorker();
    setStatus("restored");

    // A network error leaves the session as it is: the next sync tries again.
    if (secretsStore.hasServerSession) {
      try {
        await trpc.user.heartbeat.query();
      } catch (e) {
        if (!isUnauthorized(e)) return;
        detachServer();
        await persistSession(profileId);
      }
    }
  }, [restoreLogin, detachServer, lock, loaded, active, trpc]);

  return { status, tryRestore };
}
