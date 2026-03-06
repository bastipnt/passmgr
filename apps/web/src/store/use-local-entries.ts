import { queryOptions } from "@tanstack/react-query";
import type { LocalItem } from "@repo/store";
import { useLocalStore } from "./store-provider";

/**
 * Query options that read entries from the local SQLite store.
 * Falls back to an empty array if the store is not yet initialized.
 * The SyncManager keeps the local store up to date and invalidates
 * these queries after each sync.
 */
export function useLocalEntryAllOptions() {
  const store = useLocalStore();

  return queryOptions({
    queryKey: ["entry", "all", "local"],
    staleTime: Infinity,
    networkMode: "always",
    queryFn: async (): Promise<{ items: LocalItem[] }> => {
      if (!store) return { items: [] };
      const items = await store.localStore.getAllLatest();
      return { items };
    },
  });
}

export function useLocalEntryByIdOptions(itemId: string) {
  const store = useLocalStore();

  return queryOptions({
    queryKey: ["entry", "getById", "local", itemId],
    staleTime: Infinity,
    networkMode: "always",
    queryFn: async (): Promise<LocalItem> => {
      if (!store) throw new Error("Store not initialized");
      const item = await store.localStore.getByItemId(itemId);
      if (!item || item.deleted_at) throw new Error("Item not found");
      return item;
    },
  });
}
