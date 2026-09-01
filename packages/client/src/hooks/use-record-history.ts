import type { DecryptedRecord } from "@repo/schema";
import { useQuery } from "@tanstack/react-query";
import { decryptRecordWithWorker } from "../util/decrypt-record";
import { useTRPC } from "../util/trpc";

/**
 * Every stored revision of a record, newest first, decrypted client-side.
 *
 * Unlike `useGetRecord` this does not read the local vault — the vault only
 * holds the latest version of each record, so history has to come from the
 * server. Disabled until `recordId` is set, so callers can render before a
 * record is selected.
 */
export function useRecordHistory(recordId: string | undefined) {
  const trpc = useTRPC();

  const {
    data: encrypted,
    isPending,
    error,
  } = useQuery({
    ...trpc.record.history.queryOptions(recordId!),
    enabled: !!recordId,
  });

  // Decryption runs off the main thread, so it is its own query rather than a
  // render-time transform. Keyed by the ciphertext of the newest revision plus
  // the row count, which together change whenever the history does.
  const { data: versions, isPending: decrypting } = useQuery({
    queryKey: [
      "record-history-decrypted",
      recordId,
      encrypted?.length,
      encrypted?.[0]?.encryptedData,
    ],
    enabled: !!encrypted,
    queryFn: async (): Promise<DecryptedRecord[]> =>
      Promise.all(
        encrypted!.map(async (row) => ({
          ...(await decryptRecordWithWorker(row.encryptedData, row.encryptionNonce)),
          recordId: row.recordId,
          version: row.version,
          clientUpdatedAt: row.clientUpdatedAt,
          created_at: row.created_at ?? null,
          // Per-revision rows carry no first-created marker; each row's own
          // `created_at` is when that revision was written.
          firstCreatedAt: null,
        })),
      ),
  });

  return {
    versions: versions ?? [],
    ready: !!recordId && !isPending && !decrypting && !!versions,
    error,
  };
}
