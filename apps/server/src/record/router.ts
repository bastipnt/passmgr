import { db, type RecordType, recordsTable } from "@repo/db";
import {
  pushInputSchema,
  pushOutputSchema,
  RECORD_VERSION_OVERHEAD_BYTES,
  syncInputSchema,
  syncOutputSchema,
} from "@repo/schema";
import { TRPCError, tracked } from "@trpc/server";
import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import { verifiedProcedure, verifiedSubscriptionProcedure } from "../auth/auth-middleware";
import {
  claimRecordStream,
  emitSessionEnded,
  emitSessionSignedOut,
  onRecordsChanged,
  onSessionEnded,
  onSessionSignedOut,
} from "../events/record-events";
import { router } from "../trpc";
import { getSession, isSignedOut } from "../util/redis-utils";
import {
  type DbExecutor,
  keyUpdates,
  memberVaults,
  notifyVaultMembers,
  rotationsDue,
} from "../vault/access";
import { pushChanges } from "./push";
import { serializeRecord } from "./serialize";

export const STREAM_SESSION_RECHECK_MS = 60_000;

/** A sync page stops taking versions past this many bytes (`pushChangeBytes`); the first always fits. */
export const SYNC_PAGE_MAX_BYTES = 4 * 1024 * 1024;

const sessionWatches = new Map<
  string,
  { streams: number; timer: ReturnType<typeof setInterval> }
>();

/**
 * One re-check per session, however many streams it has open: the sign-out and
 * end events only fire on the instance that saw them, and a TTL expiry fires none.
 */
function watchSession(sessionId: string, onError: (err: unknown) => void): () => void {
  const watch = sessionWatches.get(sessionId);
  if (watch) {
    watch.streams++;
  } else {
    const timer = setInterval(() => {
      void (async () => {
        if (await getSession(sessionId)) return;
        if (await isSignedOut(sessionId)) emitSessionSignedOut(sessionId);
        else emitSessionEnded(sessionId);
      })().catch(onError);
    }, STREAM_SESSION_RECHECK_MS);
    sessionWatches.set(sessionId, { streams: 1, timer });
  }
  return () => {
    const current = sessionWatches.get(sessionId);
    if (!current || --current.streams > 0) return;
    clearInterval(current.timer);
    sessionWatches.delete(sessionId);
  };
}

/**
 * The next page of a sync: a prefix of the vaults' writes past their cursors in
 * (vault, seq) order, so every cursor stays a point below which the device holds
 * all of a vault's rows. At most `limit` versions and, past the first,
 * `SYNC_PAGE_MAX_BYTES`. The sizes are read first (one bounded range scan of
 * `records_vault_seq_idx` per vault, one query), then only the page's rows.
 */
async function syncPage(
  tx: DbExecutor,
  cursors: Record<string, number>,
  limit: number,
): Promise<{ records: RecordType[]; hasMore: boolean }> {
  const vaultIds = Object.keys(cursors).sort();
  if (vaultIds.length === 0) return { records: [], hasMore: false };

  const { rows: candidates } = await tx.execute<{
    vaultId: string;
    seq: string;
    bytes: number;
  }>(sql`
    SELECT r."vaultId", r.seq, r.bytes
    FROM (VALUES ${sql.join(
      vaultIds.map((vaultId) => sql`(${vaultId}::varchar, ${cursors[vaultId] ?? 0}::bigint)`),
      sql`, `,
    )}) AS c("vaultId", cursor)
    CROSS JOIN LATERAL (
      SELECT ${recordsTable.vaultId}, ${recordsTable.seq}, length(${recordsTable.encryptedData}) AS bytes
      FROM ${recordsTable}
      WHERE ${recordsTable.vaultId} = c."vaultId" AND ${recordsTable.seq} > c.cursor
      ORDER BY ${recordsTable.seq}
      LIMIT ${limit + 1}
    ) r
    ORDER BY r."vaultId", r.seq`);

  const lastSeqs = new Map<string, number>();
  let taken = 0;
  let bytes = 0;
  for (const row of candidates) {
    const size = Number(row.bytes) + RECORD_VERSION_OVERHEAD_BYTES;
    if (taken === limit || (taken > 0 && bytes + size > SYNC_PAGE_MAX_BYTES)) break;
    taken++;
    bytes += size;
    lastSeqs.set(row.vaultId, Number(row.seq));
  }
  if (taken === 0) return { records: [], hasMore: false };

  const records = await tx
    .select()
    .from(recordsTable)
    .where(
      or(
        ...[...lastSeqs].map(([vaultId, lastSeq]) =>
          and(
            eq(recordsTable.vaultId, vaultId),
            gt(recordsTable.seq, cursors[vaultId] ?? 0),
            lte(recordsTable.seq, lastSeq),
          ),
        ),
      ),
    )
    .orderBy(recordsTable.vaultId, recordsTable.seq);
  return { records, hasMore: taken < candidates.length };
}

export const recordRouter = router({
  sync: verifiedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) =>
      // One snapshot for the page (docs/sync-cursor.md): a seq it sees implies every lower one.
      db.transaction(
        async (tx) => {
          const serverTimestamp = new Date().toISOString();
          const vaults = await memberVaults(ctx.userId, tx);
          const sharing = {
            keyUpdates: await keyUpdates(ctx.userId, tx),
            rotationsDue: await rotationsDue(ctx.userId, tx),
          };
          // Each vault from its own cursor; one this device hasn't synced yet in full.
          const cursors = Object.fromEntries(
            vaults.map(({ vaultId }) => [vaultId, input.cursors[vaultId] ?? 0]),
          );
          const { records, hasMore } = await syncPage(tx, cursors, input.limit);

          // A vault's next cursor is the highest seq pulled from it (ADR 0001 D8).
          for (const { vaultId, seq } of records) {
            cursors[vaultId] = Math.max(cursors[vaultId] ?? 0, seq);
          }
          return {
            records: records.map(serializeRecord),
            vaults,
            cursors,
            hasMore,
            serverTimestamp,
            ...sharing,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),
    ),

  /**
   * Upload local changes (ADR 0001 D8), the only record write. Each change gets
   * its own answer (applied / stale / rejected); see `pushChanges`.
   */
  push: verifiedProcedure
    .input(pushInputSchema)
    .output(pushOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { results, writtenVaultIds } = await pushChanges(ctx.userId, input.changes);
      await notifyVaultMembers(...writtenVaultIds);
      return { results };
    }),

  onRecordChange: verifiedSubscriptionProcedure.subscription(async function* ({ ctx, signal }) {
    const release = claimRecordStream(ctx.userId);
    if (!release) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

    // Listening starts before "connected" is sent: a sign-out right after the
    // connect must not slip through while the generator is paused.
    let resolve: (() => void) | null = null;
    const wake = () => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r();
      }
    };
    // Signed out from elsewhere: tell the device. Logged out or expired: just end.
    let ended: "signedOut" | "ended" | null = null;
    const end = (reason: "signedOut" | "ended") => {
      ended ??= reason;
      wake();
    };
    const unsubscribe = onRecordsChanged(ctx.userId, wake);
    const unsubscribeSignedOut = onSessionSignedOut(ctx.sessionId, () => end("signedOut"));
    const unsubscribeEnded = onSessionEnded(ctx.sessionId, () => end("ended"));
    signal?.addEventListener("abort", wake, { once: true });
    const unwatch = watchSession(ctx.sessionId, (err) =>
      ctx.req?.log?.warn({ err }, "record.stream_recheck_failed"),
    );

    try {
      yield tracked("connected", { type: "connected" as const });
      while (!signal?.aborted) {
        await new Promise<void>((r) => {
          // Ended while an event was being sent: don't wait.
          if (ended || signal?.aborted) return r();
          resolve = r;
        });
        if (signal?.aborted || ended === "ended") break;
        if (ended === "signedOut") {
          yield tracked(Date.now().toString(), { type: "signedOut" as const });
          return;
        }
        yield tracked(Date.now().toString(), { type: "changed" as const });
      }
    } finally {
      unwatch();
      signal?.removeEventListener("abort", wake);
      unsubscribe();
      unsubscribeSignedOut();
      unsubscribeEnded();
      release();
    }
  }),
});
