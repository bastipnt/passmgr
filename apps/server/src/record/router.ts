import { db, type RecordType, recordsTable } from "@repo/db";
import {
  encryptedRecordSchema,
  pushInputSchema,
  pushOutputSchema,
  syncInputSchema,
  syncOutputSchema,
  vaultRoleSchema,
} from "@repo/schema";
import { TRPCError, tracked } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import z from "zod";
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
  keyUpdates,
  memberVaults,
  notifyVaultMembers,
  requireVaultRole,
  rotationsDue,
} from "../vault/access";
import { pushChanges } from "./push";
import { serializeRecord } from "./serialize";

const ANY_ROLE = vaultRoleSchema.options;

export const STREAM_SESSION_RECHECK_MS = 60_000;

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
 * The latest version of a record (deleted or not) the user may access. NOT_FOUND
 * for a record that doesn't exist or lives in a vault the user isn't a member
 * of, so ids from other vaults can't be probed.
 */
async function latestAccessibleVersion(userId: string, recordId: string): Promise<RecordType> {
  const [latest] = await db
    .select()
    .from(recordsTable)
    .where(eq(recordsTable.recordId, recordId))
    .orderBy(desc(recordsTable.version))
    .limit(1);
  if (!latest) throw new TRPCError({ code: "NOT_FOUND" });

  await requireVaultRole(userId, latest.vaultId, ANY_ROLE);
  return latest;
}

export const recordRouter = router({
  sync: verifiedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) => {
      const serverTimestamp = new Date().toISOString();
      const vaults = await memberVaults(ctx.userId);
      const sharing = {
        keyUpdates: await keyUpdates(ctx.userId),
        rotationsDue: await rotationsDue(ctx.userId),
      };
      if (vaults.length === 0) {
        return { records: [], vaults, cursors: {}, hasMore: false, serverTimestamp, ...sharing };
      }

      // Each vault from its own cursor; one this device hasn't synced yet in full.
      const cursors = Object.fromEntries(
        vaults.map(({ vaultId }) => [vaultId, input.cursors[vaultId] ?? 0]),
      );

      // A page is a prefix of the vaults' writes in (vault, seq) order, so every
      // cursor stays a point below which the device holds all of a vault's rows.
      // One range scan of `records_vault_seq_idx` per vault, each stopping early;
      // one row past the page tells whether more wait.
      const records: RecordType[] = [];
      let hasMore = false;
      for (const vaultId of vaults.map((v) => v.vaultId).sort()) {
        const room = input.limit - records.length;
        const rows = await db
          .select()
          .from(recordsTable)
          .where(
            and(eq(recordsTable.vaultId, vaultId), gt(recordsTable.seq, cursors[vaultId] ?? 0)),
          )
          .orderBy(recordsTable.seq)
          .limit(room + 1);
        hasMore = rows.length > room;
        records.push(...rows.slice(0, room));
        if (hasMore) break;
      }

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
    }),

  history: verifiedProcedure
    .input(z.uuid())
    .output(z.array(encryptedRecordSchema))
    .query(async ({ ctx, input }) => {
      await latestAccessibleVersion(ctx.userId, input);
      const records = await db
        .select()
        .from(recordsTable)
        .where(eq(recordsTable.recordId, input))
        .orderBy(desc(recordsTable.version));
      return records.map(serializeRecord);
    }),

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
