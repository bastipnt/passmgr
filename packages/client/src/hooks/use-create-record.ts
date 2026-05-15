import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "../util/trpc";
import { useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseCreateRecordOpts = {
  onSuccess: (recordId: string) => void;
};

export function useCreateRecord({ onSuccess }: UseCreateRecordOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const { mutate, error: mutationError } = useMutation(
    trpc.record.create.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertRecords([result]);
        await refreshRecord(result.recordId);
        onSuccess(result.recordId);
      },
    }),
  );

  return { createRecord: mutate, createRecordError: mutationError };
}
