import { useCallback, useContext, useRef, useState } from "react";
import {
  clearLoginBundle,
  isPersistentLoginAvailable,
  loadLoginBundle,
  secretsStore,
} from "@repo/store";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { SessionContext } from "../providers/SessionProvider";
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
    // (24h sliding TTL). On failure, drop everything and fall back to login.
    secretsStore.restoreSession(bundle);

    try {
      await trpc.user.heartbeat.query();
    } catch {
      secretsStore.lock();
      await clearLoginBundle();
      setStatus("needs-login");
      return;
    }

    restoreLogin(bundle);

    // Seed the decrypt worker with the restored vault key — normally done by
    // unlock(); the restore path bypasses it, so do it here or record
    // decryption fails with "Worker not initialized".
    decryptWorkerService.init(secretsStore.exportVaultKeyForWorker());

    setStatus("restored");
  }, [restoreLogin, trpc]);

  return { status, tryRestore };
}
