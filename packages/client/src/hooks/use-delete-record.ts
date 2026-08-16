import { useMutation } from "@tanstack/react-query";
import { useStore } from "../providers/StoreProvider";
import { useTRPC } from "../util/trpc";

type UseDeleteRecordOpts = {
  onSuccess: () => void;
};

export function useDeleteRecord({ onSuccess }: UseDeleteRecordOpts) {
  const trpc = useTRPC();
  const { syncManager } = useStore();

  const { mutate, error: mutationError } = useMutation(
    trpc.record.delete.mutationOptions({
      onSuccess: () => {
        // `delete` returns void and writes no tombstone locally — pull it now
        // instead of waiting for the SSE ping or the periodic sync.
        void syncManager.sync();
        onSuccess();
      },
    }),
  );

  return { deleteRecord: mutate, deleteRecordError: mutationError };
}
