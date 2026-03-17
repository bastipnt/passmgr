import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";

type UseDeleteItemOpts = {
  onSuccess: () => void;
};

export function useDeleteItem({ onSuccess }: UseDeleteItemOpts) {
  const trpc = useTRPC();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.delete.mutationOptions({
      onSuccess,
    }),
  );

  return { deleteItem: mutate, deleteItemError: mutationError };
}
