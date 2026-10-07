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
import { and, desc, eq, gt, or } from "drizzle-orm";
import z from "zod";
import { protectedProcedure, protectedSubscriptionProcedure } from "../auth/auth-middleware";
import { onRecordsChanged } from "../events/record-events";
import { router } from "../trpc";
import { memberVaults, notifyVaultMembers, requireVaultRole } from "../vault/access";
import { pushChanges } from "./push";
import { serializeRecord } from "./serialize";

const ANY_ROLE = vaultRoleSchema.options;

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
  sync: protectedProcedure
    .input(syncInputSchema)
    .output(syncOutputSchema)
    .query(async ({ ctx, input }) => {
      const serverTimestamp = new Date().toISOString();
      const vaults = await memberVaults(ctx.userId);
      if (vaults.length === 0) return { records: [], vaults, cursors: {}, serverTimestamp };

      // Each vault from its own cursor; one this device hasn't synced yet in full.
      const cursors = Object.fromEntries(
        vaults.map(({ vaultId }) => [vaultId, input.cursors[vaultId] ?? 0]),
      );
      const perVault = vaults.map(({ vaultId }) =>
        and(eq(recordsTable.vaultId, vaultId), gt(recordsTable.seq, cursors[vaultId] ?? 0)),
      );

      const records = await db
        .select()
        .from(recordsTable)
        .where(or(...perVault))
        .orderBy(recordsTable.recordId, desc(recordsTable.version));

      // A vault's next cursor is the highest seq pulled from it (ADR 0001 D8).
      for (const { vaultId, seq } of records) {
        cursors[vaultId] = Math.max(cursors[vaultId] ?? 0, seq);
      }

      return { records: records.map(serializeRecord), vaults, cursors, serverTimestamp };
    }),

  history: protectedProcedure
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
  push: protectedProcedure
    .input(pushInputSchema)
    .output(pushOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const { results, writtenVaultIds } = await pushChanges(ctx.userId, input.changes);
      await notifyVaultMembers(...writtenVaultIds);
      return { results };
    }),

  onRecordChange: protectedSubscriptionProcedure.subscription(async function* ({ ctx, signal }) {
    yield tracked("connected", { type: "connected" as const });

    let resolve: (() => void) | null = null;
    const unsubscribe = onRecordsChanged(ctx.userId, () => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r();
      }
    });

    try {
      while (!signal?.aborted) {
        await new Promise<void>((r) => {
          resolve = r;
          signal?.addEventListener("abort", () => r(), { once: true });
        });
        if (!signal?.aborted) {
          yield tracked(Date.now().toString(), { type: "changed" as const });
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
