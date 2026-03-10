import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import { useStore } from "../providers/StoreProvider";

type UseUpdateItemOpts = {
  onSuccess: () => void;
};

export function useUpdateItem({ onSuccess }: UseUpdateItemOpts) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const store = useStore();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: async (result) => {
        await store?.localStore.upsertItems([result]);
        void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });

        onSuccess();
      },
    }),
  );

  return { updateItem: mutate, updateItemError: mutationError };
}
