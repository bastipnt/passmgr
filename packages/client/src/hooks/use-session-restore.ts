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
import { useTRPCClient } from "../util/trpc";

export type RestoreStatus = "restoring" | "restored" | "needs-login";

/**
 * Mobile fast-unlock: on app launch, attempt to restore a persisted session
 * from OS secure storage (one biometric prompt) instead of a full OPAQUE +
 * Argon2 login. The restored session is validated against the server before the
 * app is entered; an expired/invalid session is wiped and the user is sent to
 * the normal login screen.
 *
 * On web `isPersistentLoginAvailable()` is false, so this resolves straight to
 * `"needs-login"` without touching storage.
 */
export function useSessionRestore() {
  const { restoreLogin } = useContext(SessionContext);
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

    // Load the keys into memory so the heartbeat request can be signed, but
    // don't enter the app until the server confirms the session is still alive
    // (24h sliding TTL). The vault keys and keypair come from the local DB,
    // unwrapped with the bundle's account key. Any failure — a bundle from an older
    // app version, a dead session, keys that don't open — drops everything and falls
    // back to the normal login, instead of leaving the app on the splash screen.
    try {
      secretsStore.restoreSession(bundle);
      await trpc.user.heartbeat.query();
      const keyMaterial = await vault.getAccountKeyMaterial();
      if (!keyMaterial) throw new Error("No key material stored on this device");
      restoreLogin(bundle, await vault.getVaults(), keyMaterial.userKeyPair);
    } catch {
      secretsStore.lock();
      await clearLoginBundle();
      setStatus("needs-login");
      return;
    }

    // Seed the decrypt worker with the restored vault keys — normally done by
    // unlock(); the restore path bypasses it, so do it here or record
    // decryption fails with "No key for vault".
    initDecryptWorker();

    setStatus("restored");
  }, [restoreLogin, trpc, vault]);

  return { status, tryRestore };
}
