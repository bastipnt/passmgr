import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { flushClipboardClear } from "./use-clipboard-clear";

/**
 * Lock (ADR 0001 D2): wipe every key from memory — the secrets store, the
 * decrypt worker's copies and the decrypted query cache. The local vault and
 * a persisted mobile login stay; the server session is not ended. A copied
 * secret waiting for its auto-clear is cleared now.
 */
export function useLock() {
  const { lock } = useContext(SessionContext);
  const queryClient = useQueryClient();

  return useCallback(() => {
    lock();
    // The decrypt worker retains the vault keys after secretsStore.lock().
    decryptWorkerService.wipe();
    // Drop cached (decrypted) query data.
    queryClient.clear();
    void flushClipboardClear();
  }, [lock, queryClient]);
}
