import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import { useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseUpdateRecordOpts = {
  onSuccess: () => void;
};

export function useUpdateRecord({ onSuccess }: UseUpdateRecordOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const { mutate, error: mutationError } = useMutation(
    trpc.record.update.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertRecords([result]);
        await refreshRecord(result.recordId);

        onSuccess();
      },
    }),
  );

  return { updateRecord: mutate, updateRecordError: mutationError };
}
