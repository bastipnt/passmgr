import type { DecryptedRecord } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { recordDataOf } from "../util/decrypt-record";
import { localQueryOptions } from "../util/local-query-options";
import { useRefreshRecord } from "./use-records";

type UseMoveRecordOpts = {
  /** The moved record's new id (a move is a new record) and the vault it went to. */
  onSuccess: (recordId: string, targetVaultId: string) => void;
  onError?: (error: Error) => void;
};

/** Moves a record to another vault: see `RecordRepository.move` (ADR 0001 D6). */
export function useMoveRecord({ onSuccess, onError }: UseMoveRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation({
    ...localQueryOptions,
    mutationFn: ({ record, targetVaultId }: { record: DecryptedRecord; targetVaultId: string }) =>
      requireActive(store).records.move(record, recordDataOf(record), targetVaultId),
    onSuccess: async (moved, { record, targetVaultId }) => {
      await refreshRecord(record.recordId);
      await refreshRecord(moved.recordId);
      onSuccess(moved.recordId, targetVaultId);
    },
    onError,
  });

  function moveRecord(record: DecryptedRecord, targetVaultId: string) {
    mutate({ record, targetVaultId });
  }

  return { moveRecord, moveRecordError: mutationError, movePending: isPending };
}
