import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import { useStore } from "../providers/StoreProvider";
import { useRefreshItem } from "./get-items";

type UseUpdateItemOpts = {
  onSuccess: () => void;
};

export function useUpdateItem({ onSuccess }: UseUpdateItemOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshItem = useRefreshItem();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertItems([result]);
        await refreshItem(result.itemId);

        onSuccess();
      },
    }),
  );

  return { updateItem: mutate, updateItemError: mutationError };
}
