import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";

type UseDeleteRecordOpts = {
  onSuccess: () => void;
};

export function useDeleteRecord({ onSuccess }: UseDeleteRecordOpts) {
  const trpc = useTRPC();

  const { mutate, error: mutationError } = useMutation(
    trpc.record.delete.mutationOptions({
      onSuccess,
    }),
  );

  return { deleteRecord: mutate, deleteRecordError: mutationError };
}
