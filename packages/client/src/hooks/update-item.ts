import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import type { EncryptedItemSchema } from "@repo/schema";

type UseUpdateItemOpts = {
  onSuccess: (result: EncryptedItemSchema) => void;
};

export function useUpdateItem({ onSuccess }: UseUpdateItemOpts) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: async (result) => {
        // TODO: needs to be called onSuccess
        // await store?.localStore.upsertItems([result]);

        void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });

        // TODO: needs to be called onSuccess
        // navigate(`/${entrySlug}/${entryId}`);

        // TODO: return decrypted result and save in store before
        onSuccess(result);
      },
    }),
  );

  return { updateItem: mutate, updateItemError: mutationError };
}
