import { endServerSession, useTRPCClient } from "@repo/client";
import { secretsStore } from "@repo/store";
import { useCallback, useRef } from "react";

/**
 * Lock the vault (web). `secretsStore` is memory-only on web, so a reload drops
 * every key; it also discards unsaved sheet state, which is the right trade for
 * a lock. Unlike mobile, the server session is ended first: nothing on this
 * device can sign with it after the reload, so it would only linger in Redis
 * until its TTL. Best-effort and bounded (`endServerSession`), so a slow or dead
 * network never keeps the vault open.
 */
export function useLockVault() {
  const trpc = useTRPCClient();
  const locking = useRef(false);

  return useCallback(async () => {
    if (locking.current) return;
    locking.current = true;
    // The keys live until the reload: hide the page and make it inert right away,
    // so nothing can be read or clicked while the logout is in flight.
    document.body.style.visibility = "hidden";
    document.body.inert = true;
    try {
      if (secretsStore.hasServerSession) await endServerSession(trpc);
    } finally {
      window.location.reload();
    }
  }, [trpc]);
}
