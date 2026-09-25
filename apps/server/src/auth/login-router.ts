import { ExpectedAuthResult, KE1, KE3, RegistrationRecord } from "@cloudflare/opaque-ts";
import { hashEmail, hkdf, wipe } from "@repo/crypto";
import { db } from "@repo/db";
import {
  finishLoginInputSchema,
  finishLoginOutputSchema,
  startLoginInputSchema,
  startLoginOutputSchema,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { loggedProcedure, shortHash } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import {
  deleteSession,
  getLoginLockMs,
  recordLoginStart,
  resetLoginThrottle,
  setLoginAttempt,
  setSession,
  takeLoginAttempt,
} from "../util/redis-utils";
import { protectedProcedure } from "./auth-middleware";
import { fakeRegistrationRecord } from "./fake-record";

type LoginLog = {
  warn: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
};

function denyLogin(
  log: LoginLog | undefined,
  stage: string,
  reason: string,
  emailHash: string,
): never {
  log?.warn({ stage, reason, emailHash }, "auth.login.failure");
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "invalid user credentials",
  });
}

export const loginRouter = router({
  startLogin: loggedProcedure
    .input(startLoginInputSchema)
    .output(startLoginOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { startLoginRequest, email } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const lockMs = await getLoginLockMs(emailHash);
      if (lockMs > 0) {
        log?.warn({ emailHash, lockMs }, "auth.login.throttled");
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `too many login attempts, retry in ${Math.ceil(lockMs / 1000)}s`,
        });
      }
      await recordLoginStart(emailHash);

      const res = await db.query.usersTable.findFirst({
        columns: { registrationRecord: true, userId: true },
        where: { emailHash, deleted_at: { isNull: true } },
      });

      let ke1: KE1;
      let record: RegistrationRecord;
      try {
        ke1 = KE1.deserialize(opaqueConfig, b64ToBytes(startLoginRequest));
        record = res
          ? RegistrationRecord.deserialize(opaqueConfig, b64ToBytes(res.registrationRecord))
          : await fakeRegistrationRecord(email);
      } catch {
        denyLogin(log, "startLogin", "decode_failed", emailHash);
      }

      // Unknown emails get a KE2 built from a fake record rather than an error,
      // so startLogin doesn't reveal which accounts exist. The client's
      // authFinish fails the same way it does for a wrong password.
      if (!res) log?.warn({ stage: "startLogin", emailHash }, "auth.login.unknown_user");

      // credential_identifier = email (mirrors prior serenity userIdentifier).
      // client_identity = email is mixed into MAC transcripts — must match what
      // the client passes to authFinish.
      const initResult = await opaqueServer.authInit(ke1, record, email, email);
      if (initResult instanceof Error) {
        denyLogin(log, "startLogin", "opaque_start_failed", emailHash);
      }

      const loginResponse = bytesToB64(initResult.ke2.serialize());
      const expected = bytesToB64(initResult.expected.serialize());

      const attemptId = await setLoginAttempt({ userId: res?.userId ?? null, emailHash, expected });

      return { loginResponse, attemptId };
    }),

  finishLogin: loggedProcedure
    .input(finishLoginInputSchema)
    .output(finishLoginOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { finishLoginRequest, email, authSalt, attemptId } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const loginAttempt = await takeLoginAttempt(attemptId);
      if (!loginAttempt || loginAttempt.emailHash !== emailHash) {
        denyLogin(log, "finishLogin", "no_login_attempt", emailHash);
      }
      const { userId } = loginAttempt;
      if (!userId) denyLogin(log, "finishLogin", "user_not_found", emailHash);

      let ke3: KE3;
      let expected: ExpectedAuthResult;
      try {
        ke3 = KE3.deserialize(opaqueConfig, b64ToBytes(finishLoginRequest));
        expected = ExpectedAuthResult.deserialize(opaqueConfig, b64ToBytes(loginAttempt.expected));
      } catch {
        denyLogin(log, "finishLogin", "decode_failed", emailHash);
      }

      const finResult = opaqueServer.authFinish(ke3, expected);
      if (finResult instanceof Error) {
        denyLogin(log, "finishLogin", "opaque_finish_failed", emailHash);
      }

      // The account may have been deleted between startLogin and finishLogin.
      const userQueryRes = await db.query.usersTable.findFirst({
        columns: { userId: true },
        where: { userId, deleted_at: { isNull: true } },
      });
      if (!userQueryRes) denyLogin(log, "finishLogin", "user_not_found", emailHash);

      const keyQueryRes = await db.query.keysTable.findFirst({
        columns: {
          passwordKekParams: true,
          passwordKekSalt: true,
          encryptedVaultKey: true,
          vaultKeyEncryptionNonce: true,
        },
        where: {
          userId,
          valid_to: { isNull: true },
          deleted_at: { isNull: true },
        },
      });
      if (!keyQueryRes) denyLogin(log, "finishLogin", "no_keys", emailHash);

      await resetLoginThrottle(emailHash);

      const sessionKey = bytesToB64(finResult.session_key);
      const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
      const authKey = await hkdf(sessionSecret, "sessionAuth", fromBase64(authSalt));

      const sessionId = await setSession({
        userId,
        rawAuthKey: toBase64(authKey),
        authenticatedAt: Date.now(),
      });

      wipe(sessionSecret);
      wipe(authKey);

      log?.info({ emailHash }, "auth.login.success");
      return { sessionId, userPasswordKeys: keyQueryRes };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteSession(ctx.sessionId);
    ctx.req?.log?.info({ sidHash: await shortHash(ctx.sessionId) }, "auth.logout");
    return { ok: true } as const;
  }),
});
