import type { DecryptedRecord, RecordData } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseUpdateRecordOpts = {
  onSuccess: () => void;
};

export function useUpdateRecord({ onSuccess }: UseUpdateRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation({
    // Local only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    mutationFn: ({ record, data }: { record: DecryptedRecord; data: RecordData }) =>
      requireActive(store).records.update(record, data),
    onSuccess: async (updated) => {
      await refreshRecord(updated.recordId);
      onSuccess();
    },
  });

  /** Encrypt `data` as the next version of `record`, in the vault it lives in. */
  function updateRecord(record: DecryptedRecord, data: RecordData) {
    mutate({ record, data });
  }

  return { updateRecord, updateRecordError: mutationError, updatePending: isPending };
}
