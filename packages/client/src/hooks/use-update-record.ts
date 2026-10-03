import type { DecryptedRecord, RecordSchema } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "../providers/StoreProvider";
import { encryptRecord } from "../util/encrypt-record";
import { useTRPC } from "../util/trpc";
import { useRefreshRecord } from "./use-records";

type UseUpdateRecordOpts = {
  onSuccess: () => void;
};

export function useUpdateRecord({ onSuccess }: UseUpdateRecordOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation(
    trpc.record.update.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertRecords([result]);
        await refreshRecord(result.recordId);

        onSuccess();
      },
    }),
  );

  /** Encrypt `payload` as the next version of `record`, in the vault it lives in. */
  function updateRecord(record: DecryptedRecord, payload: RecordSchema) {
    const { recordId, vaultId, version } = record;
    mutate({
      recordId,
      ...encryptRecord(payload, { recordId, vaultId }),
      version,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  return { updateRecord, updateRecordError: mutationError, updatePending: isPending };
}
