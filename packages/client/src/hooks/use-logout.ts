import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { secretsStore } from "@repo/store";
import { useQueryClient } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";

/**
 * Full logout: best-effort server session invalidation, then a complete local
 * wipe (SQLite vault, secure-storage login bundle, in-memory keys, biometric
 * preference), then session state reset — which flips `loggedIn` and lets the
 * route guard redirect to the auth screens.
 *
 * The server call runs first because it must be HMAC-signed with the session
 * authKey, which removeVault() destroys.
 */
export function useLogout() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  const { isOffline, endSession } = useContext(SessionContext);
  const { removeVault } = useStore();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Offline logins never hold a server session (secretsStore.sessionId
      // stays unset), so there is nothing to invalidate.
      if (!isOffline && secretsStore.sessionId) {
        try {
          await trpc.login.logout.mutate();
        } catch {
          // Best-effort: a network error or already-expired session must not
          // block local logout — the Redis session dies via its 24h TTL.
        }
      }
    } finally {
      await removeVault();
      // The decrypt worker retains the vault key after secretsStore.lock().
      decryptWorkerService.wipe();
      // Drop cached (decrypted) query data.
      queryClient.clear();
      endSession();
      setLoggingOut(false);
    }
  }

  return { logout, loggingOut };
}
