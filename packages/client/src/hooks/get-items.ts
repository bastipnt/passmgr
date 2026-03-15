import { useItemsContext } from "../providers/ItemsProvider";
import type { DecryptedItem } from "@repo/schema";

export function useGetItems(): { items: DecryptedItem[]; ready: boolean } {
  const { items, ready } = useItemsContext();
  return { items, ready };
}

export function useGetItem(itemId: string): {
  item: DecryptedItem | undefined;
  ready: boolean;
} {
  const { getItem, ready } = useItemsContext();
  return { item: getItem(itemId), ready };
}

export function useRefreshItem(): (id: string) => Promise<void> {
  return useItemsContext().refreshItem;
}
