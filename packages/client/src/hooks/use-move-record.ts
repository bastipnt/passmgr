import type { DecryptedRecord } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { requireActive, useStore } from "../providers/StoreProvider";
import { useRefreshRecord } from "./use-records";

type UseMoveRecordOpts = {
  /** The moved record's new id (a move is a new record) and the vault it went to. */
  onSuccess: (recordId: string, targetVaultId: string) => void;
  onError?: (error: Error) => void;
};

/**
 * Move a record to another vault (ADR 0001 D6). It is re-encrypted under the
 * target vault's key as a new record (new id); the source is tombstoned and
 * keeps its history, so the history never reaches the target vault's members.
 */
export function useMoveRecord({ onSuccess, onError }: UseMoveRecordOpts) {
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
