import { canWriteVault, type DecryptedRecord } from "@repo/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { requireActive, useStore } from "../providers/StoreProvider";
import { decryptRecordRow, recordDataOf } from "../util/decrypt-record";
import { useRefreshRecord } from "./use-records";
import { useVaults } from "./use-vaults";

/** A record in the trash: its content when it was deleted. */
export type TrashedRecord = DecryptedRecord & {
  deletedAt: string;
  /** Whether the user may restore or purge it (write access to its vault). */
  writable: boolean;
};

const TRASH_KEY = "trash";

/**
 * The trash (deleted records, newest deletion first) with restore and
 * permanent delete. Local only, like every record write (ADR 0001 D1): a
 * restore is the record's next version, a purge drops its history here and,
 * once pushed, on the server and every other device (`Vault.purgeRecords`).
 * A record whose vault key doesn't open it is left out, as in the list.
 */
export function useTrash() {
  const store = useStore();
  const queryClient = useQueryClient();
  const refreshRecord = useRefreshRecord();
  // Re-read after every local write or sync: another device may delete or restore.
  const { revision } = useRecordsContext();
  const { getVault } = useVaults();

  const { data, isPending, error } = useQuery({
    queryKey: [TRASH_KEY, revision],
    placeholderData: (previous) => previous,
    // Reads the local vault only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    queryFn: async () => {
      const rows = await requireActive(store).records.getDeleted();
      const results = await Promise.allSettled(
        rows.map(async (row) => ({
          ...(await decryptRecordRow(row)),
          deletedAt: row.deleted_at ?? row.clientUpdatedAt,
        })),
      );
      const records = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failed = results.length - records.length;
      if (failed > 0) console.error(`${failed} deleted record(s) could not be decrypted`);
      return records.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },
  });

  const records = useMemo<TrashedRecord[]>(
    () =>
      (data ?? []).flatMap((record) => {
        // A vault the user lost: its records left the device with it.
        const vault = getVault(record.vaultId);
        return vault ? [{ ...record, writable: canWriteVault(vault.role) }] : [];
      }),
    [data, getVault],
  );

  const restore = useMutation({
    networkMode: "always",
    mutationFn: (record: TrashedRecord) =>
      requireActive(store).records.restore(record, recordDataOf(record)),
    // Bumps the revision, which re-reads the trash.
    onSuccess: (_, record) => refreshRecord(record.recordId),
  });

  const purge = useMutation({
    networkMode: "always",
    mutationFn: (recordIds: readonly string[]) => requireActive(store).records.purge(recordIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TRASH_KEY] }),
  });

  return {
    records,
    ready: !isPending && !!data,
    error,
    /** Put a record back, with the content it had when it was deleted. */
    restore: restore.mutateAsync,
    /** Delete records for good, with their history. Can't be undone. */
    purge: purge.mutateAsync,
    /** Every record of the trash the user may purge, for good. */
    emptyTrash: () => purge.mutateAsync(records.filter((r) => r.writable).map((r) => r.recordId)),
    pending: restore.isPending || purge.isPending,
  };
}
