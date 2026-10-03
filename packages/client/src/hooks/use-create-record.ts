import type { RecordData } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "../providers/StoreProvider";
import { encryptRecord } from "../util/encrypt-record";
import { useTRPC } from "../util/trpc";
import { useRefreshRecord } from "./use-records";

type UseCreateRecordOpts = {
  onSuccess: (recordId: string) => void;
};

export function useCreateRecord({ onSuccess }: UseCreateRecordOpts) {
  const trpc = useTRPC();
  const store = useStore();
  const refreshRecord = useRefreshRecord();

  const {
    mutate,
    error: mutationError,
    isPending,
  } = useMutation(
    trpc.record.create.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertRecords([result]);
        await refreshRecord(result.recordId);
        onSuccess(result.recordId);
      },
    }),
  );

  /** Encrypt and create a new record, in the personal vault unless `vaultId` is given. */
  function createRecord(data: RecordData, vaultId = secretsStore.defaultVaultId) {
    if (!vaultId) throw new Error("Vault is locked");
    const recordId = crypto.randomUUID();
    mutate({
      recordId,
      vaultId,
      ...encryptRecord(data, { recordId, vaultId }),
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  return { createRecord, createRecordError: mutationError, createPending: isPending };
}
