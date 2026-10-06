import type { DecryptedRecord } from "@repo/schema";
import { useQuery } from "@tanstack/react-query";
import { useRecordsContext } from "../providers/RecordsProvider";
import { useStore } from "../providers/StoreProvider";
import { decryptRecordWithWorker } from "../util/decrypt-record";

/**
 * Every stored revision of a record, newest first, decrypted client-side.
 * Read from the local vault (pending local edits included), so it works
 * without a server. Disabled until `recordId` is set, so callers can render
 * before a record is selected.
 */
export function useRecordHistory(recordId: string | undefined) {
  const { records } = useStore();
  // Re-read after every local write or sync: a sync can change a version
  // without touching the head (renumbered, or the server's timestamps).
  const { revision } = useRecordsContext();

  const {
    data: versions,
    isPending,
    error,
  } = useQuery({
    queryKey: ["record-history", recordId, revision],
    // Keep showing this record's history while a re-read runs, never another record's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === recordId ? previous : undefined,
    enabled: !!recordId,
    // Reads the local vault only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    queryFn: async (): Promise<DecryptedRecord[]> => {
      const encrypted = await records.history(recordId!);
      const results = await Promise.allSettled(
        encrypted.map(async (row) => ({
          ...(await decryptRecordWithWorker(row)),
          recordId: row.recordId,
          vaultId: row.vaultId,
          version: row.version,
          clientUpdatedAt: row.clientUpdatedAt,
          created_at: row.created_at ?? null,
          // Per-revision rows carry no first-created marker; each row's own
          // `created_at` is when that revision was written.
          firstCreatedAt: null,
        })),
      );
      // A revision that doesn't open (or is in a format this client can't
      // read) is left out, like in the record list, rather than failing the
      // whole history.
      const versions = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failed = results.length - versions.length;
      if (failed > 0) console.error(`${failed} revision(s) could not be decrypted and are hidden`);
      return versions;
    },
  });

  return {
    versions: versions ?? [],
    ready: !!recordId && !isPending && !!versions,
    error,
  };
}
