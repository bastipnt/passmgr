import type { RecordData } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseCreateRecordOpts = {
  onSuccess: (recordId: string) => void;
  onError?: (error: Error) => void;
};

export function useCreateRecord({ onSuccess, onError }: UseCreateRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation({
    // Local only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    mutationFn: ({ data, vaultId }: { data: RecordData; vaultId?: string }) =>
      requireActive(store).records.create(data, vaultId),
    onSuccess: async (created) => {
      await refreshRecord(created.recordId);
      onSuccess(created.recordId);
    },
    onError,
  });

  /** Encrypt and store a new record, in the personal vault unless `vaultId` is given. */
  function createRecord(data: RecordData, vaultId?: string) {
    mutate({ data, vaultId });
  }

  return { createRecord, createRecordError: mutationError, createPending: isPending };
}
