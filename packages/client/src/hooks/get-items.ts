import { queryOptions } from "@tanstack/react-query";
import { useStore } from "../providers/StoreProvider";
import type { EncryptedItemSchema } from "@repo/schema";

/**
 * Query options that read entries from the local SQLite store.
 * Falls back to an empty array if the store is not yet initialized.
 * The SyncManager keeps the local store up to date and invalidates
 * these queries after each sync.
 */
export function useGetAllItemsOptions() {
  const store = useStore();

  return queryOptions({
    queryKey: ["entry", "all", "local"],
    staleTime: Infinity,
    networkMode: "always",
    queryFn: async (): Promise<{ items: EncryptedItemSchema[] }> => {
      if (!store) return { items: [] };
      const items = await store.vault.getAllLatest();
      return { items };
    },
  });
}

export function useGetItemByIdOptions(itemId: string) {
  const store = useStore();

  return queryOptions({
    queryKey: ["entry", "getById", "local", itemId],
    staleTime: Infinity,
    networkMode: "always",
    queryFn: async (): Promise<EncryptedItemSchema> => {
      if (!store) throw new Error("Store not initialized");
      const item = await store.vault.getByItemId(itemId);
      if (!item || item.deleted_at) throw new Error("Item not found");
      return item;
    },
  });
}
