import type { DecryptedRecord } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "../providers/StoreProvider";
import { encryptRecord } from "../util/encrypt-record";
import { useTRPC } from "../util/trpc";

type UseMoveRecordOpts = {
  onSuccess: (recordId: string) => void;
};

/**
 * Move a record to another vault (ADR 0001 D6). It is re-encrypted under the
 * target vault's key as a new record (new id); the source is tombstoned and
 * keeps its history, so the history never reaches the target vault's members.
 */
export function useMoveRecord({ onSuccess }: UseMoveRecordOpts) {
  const trpc = useTRPC();
  const { syncManager } = useStore();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation(
    trpc.record.move.mutationOptions({
      onSuccess: async (result) => {
        // Pulls both the new record and the source's tombstone.
        await syncManager.sync();
        onSuccess(result.recordId);
      },
    }),
  );

  function moveRecord(record: DecryptedRecord, targetVaultId: string) {
    const {
      recordId,
      vaultId: _vaultId,
      version,
      clientUpdatedAt: _clientUpdatedAt,
      created_at: _createdAt,
      firstCreatedAt: _firstCreatedAt,
      ...payload
    } = record;
    const newRecordId = crypto.randomUUID();
    mutate({
      recordId,
      version,
      target: {
        recordId: newRecordId,
        vaultId: targetVaultId,
        ...encryptRecord(payload, { recordId: newRecordId, vaultId: targetVaultId }),
        clientUpdatedAt: new Date().toISOString(),
      },
    });
  }

  return { moveRecord, moveRecordError: mutationError, movePending: isPending };
}
