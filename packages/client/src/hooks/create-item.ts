import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import { useStore } from "../providers/StoreProvider";
import { useRefreshItem } from "./get-items";

type UseCreateItemOpts = {
  onSuccess: (itemId: string) => void;
};

export function useCreateItem({ onSuccess }: UseCreateItemOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshItem = useRefreshItem();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.create.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertItems([result]);
        await refreshItem(result.itemId);
        onSuccess(result.itemId);
      },
    }),
  );

  return { createItem: mutate, createItemError: mutationError };
}
