import type { DecryptedRecord } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseMoveRecordOpts = {
  onSuccess: (recordId: string) => void;
};

/**
 * Move a record to another vault (ADR 0001 D6). It is re-encrypted under the
 * target vault's key as a new record (new id); the source is tombstoned and
 * keeps its history, so the history never reaches the target vault's members.
 */
export function useMoveRecord({ onSuccess }: UseMoveRecordOpts) {
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation({
    // Local only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    mutationFn: ({ record, targetVaultId }: { record: DecryptedRecord; targetVaultId: string }) => {
      const {
        recordId: _recordId,
        vaultId: _vaultId,
        version: _version,
        clientUpdatedAt: _clientUpdatedAt,
        created_at: _createdAt,
        firstCreatedAt: _firstCreatedAt,
        schemaVersion: _schemaVersion,
        ...data
      } = record;
      return requireActive(store).records.move(record, data, targetVaultId);
    },
    onSuccess: async (moved, { record }) => {
      await refreshRecord(record.recordId);
      await refreshRecord(moved.recordId);
      onSuccess(moved.recordId);
    },
  });

  function moveRecord(record: DecryptedRecord, targetVaultId: string) {
    mutate({ record, targetVaultId });
  }

  return { moveRecord, moveRecordError: mutationError, movePending: isPending };
}
