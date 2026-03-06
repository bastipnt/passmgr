import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LocalStore, SyncManager } from "@repo/store";
import { SessionContext, useTRPCClient } from "@repo/client";
import { SqliteAdapter } from "./sqlite-adapter";

type StoreContextValue = {
  localStore: LocalStore;
  syncManager: SyncManager;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useLocalStore(): StoreContextValue | null {
  return useContext(StoreContext);
}

type StoreProviderProps = {
  children: ReactNode;
};

export default function StoreProvider({ children }: StoreProviderProps) {
  const { sessionId, vaultReady } = useContext(SessionContext);
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  const storeRef = useRef<StoreContextValue | null>(null);

  if (!storeRef.current) {
    const adapter = new SqliteAdapter();
    const localStore = new LocalStore(adapter);
    const syncManager = new SyncManager(localStore, async (lastSyncedAt) => {
      if (!navigator.onLine) throw new Error("offline");
      return await trpc.entry.sync.query({ lastSyncedAt });
    });
    storeRef.current = { localStore, syncManager };
  }

  const { syncManager } = storeRef.current;

  // Sync on login + start periodic sync + resync when back online
  useEffect(() => {
    if (!sessionId) return;

    const unsub = syncManager.onSync(() => {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    });

    const onOnline = () => void syncManager.sync();
    window.addEventListener("online", onOnline);

    void syncManager.sync();
    syncManager.startPeriodicSync(60_000);

    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      syncManager.stopPeriodicSync();
    };
  }, [sessionId, syncManager, queryClient]);

  // Re-sync when vault becomes ready (items may have been fetched but not decryptable yet)
  useEffect(() => {
    if (vaultReady) {
      void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
    }
  }, [vaultReady, queryClient]);

  return <StoreContext value={storeRef.current}>{children}</StoreContext>;
}
