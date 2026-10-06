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
 * Mobile fast-unlock: on app launch, restore the unlocked vault from OS secure
 * storage (one biometric prompt) instead of an Argon2 unlock (ADR 0001 D2).
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
  const { vault } = useStore();
  const trpc = useTRPCClient();
  const [status, setStatus] = useState<RestoreStatus>(
    isPersistentLoginAvailable() ? "restoring" : "needs-login",
  );
  const attempted = useRef(false);

  const tryRestore = useCallback(async () => {
    if (attempted.current) return;
    attempted.current = true;

    if (!isPersistentLoginAvailable()) {
      setStatus("needs-login");
      return;
    }

    const bundle = await loadLoginBundle();
    if (!bundle) {
      setStatus("needs-login");
      return;
    }

    // Any failure — no profile, keys that don't open with the bundle's account
    // key — drops the bundle and falls back to the password unlock, instead of
    // leaving the app on the splash screen.
    try {
      const profile = await vault.getProfile();
      const keyMaterial = await vault.getAccountKeyMaterial();
      if (!profile || !keyMaterial) throw new Error("No vault stored on this device");
      restoreLogin(profile.mode, bundle, await vault.getVaults(), keyMaterial.userKeyPair);
    } catch {
      lock();
      await clearLoginBundle();
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
        await persistSession();
      }
    }
  }, [restoreLogin, detachServer, lock, vault, trpc]);

  return { status, tryRestore };
}
