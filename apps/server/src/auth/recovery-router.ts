import { timingSafeEqual } from "node:crypto";
import { RegistrationRequest } from "@cloudflare/opaque-ts";
import { hashEmail, hashRecoveryAuthKey } from "@repo/crypto";
import { db, keysTable, usersTable } from "@repo/db";
import {
  finishRecoveryInputSchema,
  startRecoveryInputSchema,
  startRecoveryOutputSchema,
} from "@repo/schema";
import { fromBase64, toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { loggedProcedure } from "../logger";
import { recordRecoveryAttempt } from "../metrics";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import { recordAccountEvent } from "../user/account-events";
import {
  resetLoginThrottle,
  revokeUserSessions,
  setRecoveryAttempt,
  takeRecoveryAttempt,
} from "../util/redis-utils";
import { deleteDeviceCredentials } from "./device-credentials";

type RecoveryLog = { warn: (obj: object, msg: string) => void };

// One error for every failure (unknown email, wrong key, stale
// attempt) so recovery doesn't reveal which accounts exist.
function denyRecovery(
  log: RecoveryLog | undefined,
  stage: string,
  reason: string,
  emailHash: string,
): never {
  log?.warn({ stage, reason, emailHash }, "auth.recovery.failure");
  recordRecoveryAttempt(stage, reason);
  throw new TRPCError({ code: "UNAUTHORIZED", message: "recovery failed" });
}

/**
 * The server only checks a verifier of an HKDF-derived proof: the recovery key never leaves the
 * client. See docs/architecture/auth.md (Recovery).
 */
export const recoveryRouter = router({
  startRecovery: loggedProcedure
    .input(startRecoveryInputSchema)
    .output(startRecoveryOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { email, recoveryAuthKey, registrationRequest } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));
      const presented = await hashRecoveryAuthKey(fromBase64(recoveryAuthKey));

      // One query for known and unknown emails alike, so the answer takes as long.
      const [found] = await db
        .select({
          userId: usersTable.userId,
          keySetId: keysTable.keySetId,
          recoveryVerifier: keysTable.recoveryVerifier,
          recoveryKekSalt: keysTable.recoveryKekSalt,
          encryptedAccountKeyRecovery: keysTable.encryptedAccountKeyRecovery,
          accountKeyEncryptionNonceRecovery: keysTable.accountKeyEncryptionNonceRecovery,
        })
        .from(usersTable)
        .innerJoin(
          keysTable,
          and(
            eq(keysTable.userId, usersTable.userId),
            isNull(keysTable.valid_to),
            isNull(keysTable.deleted_at),
          ),
        )
        .where(and(eq(usersTable.emailHash, emailHash), isNull(usersTable.deleted_at)))
        .limit(1);
      if (!found) denyRecovery(log, "startRecovery", "unknown_user", emailHash);
      const { userId, ...keys } = found;
      const stored = fromBase64(keys.recoveryVerifier);
      if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) {
        denyRecovery(log, "startRecovery", "wrong_key", emailHash);
      }

      let req: RegistrationRequest;
      try {
        req = RegistrationRequest.deserialize(opaqueConfig, b64ToBytes(registrationRequest));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "invalid registration request" });
      }

      // credential_identifier = email, same as at registration.
      const resp = await opaqueServer.registerInit(req, email);
      if (resp instanceof Error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "recovery failed" });
      }

      const attemptId = await setRecoveryAttempt({
        userId,
        emailHash,
        keySetId: keys.keySetId,
      });
      log?.info({ emailHash }, "auth.recovery.start");
      recordRecoveryAttempt("startRecovery", "ok");

      return {
        attemptId,
        registrationResponse: bytesToB64(resp.serialize()),
        recoveryKeys: {
          recoveryKekSalt: keys.recoveryKekSalt,
          encryptedAccountKeyRecovery: keys.encryptedAccountKeyRecovery,
          accountKeyEncryptionNonceRecovery: keys.accountKeyEncryptionNonceRecovery,
        },
      };
    }),

  finishRecovery: loggedProcedure
    .input(finishRecoveryInputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { email, attemptId, registrationRecord, userKeys } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const attempt = await takeRecoveryAttempt(attemptId);
      if (!attempt || attempt.emailHash !== emailHash) {
        denyRecovery(log, "finishRecovery", "no_recovery_attempt", emailHash);
      }
      const { userId } = attempt;

      const swapped = await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ keySetId: keysTable.keySetId })
          .from(keysTable)
          .where(
            and(
              eq(keysTable.userId, userId),
              isNull(keysTable.valid_to),
              isNull(keysTable.deleted_at),
            ),
          )
          .for("update");

        // The key set changed since startRecovery (concurrent rekey/recovery):
        // the client wrapped an account key the server no longer vouches for.
        if (active?.keySetId !== attempt.keySetId) return false;

        const now = new Date();
        await tx
          .update(keysTable)
          .set({ valid_to: now, updated_at: now })
          .where(eq(keysTable.keySetId, active.keySetId));
        await tx.insert(keysTable).values({ userId, ...userKeys, valid_from: now });
        await tx
          .update(usersTable)
          .set({ registrationRecord, updated_at: now })
          .where(and(eq(usersTable.userId, userId), isNull(usersTable.deleted_at)));
        await deleteDeviceCredentials(userId, undefined, tx);
        return true;
      });
      if (!swapped) denyRecovery(log, "finishRecovery", "key_set_changed", emailHash);

      await revokeUserSessions(userId);
      await resetLoginThrottle(emailHash);

      log?.info({ emailHash }, "auth.recovery.success");
      await recordAccountEvent(userId, "account_recovered", { deviceName: ctx.deviceName, log });
      recordRecoveryAttempt("finishRecovery", "ok");
      return { ok: true } as const;
    }),
});
