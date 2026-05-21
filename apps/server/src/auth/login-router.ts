import { KE1, KE3, RegistrationRecord, ExpectedAuthResult } from "@cloudflare/opaque-ts";
import { loggedProcedure } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import { db } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { hashEmail, hkdf, wipe } from "@repo/crypto";
import { delLoginAttempt, getLoginAttempt, setLoginAttempt, setSession } from "../util/redis-utils";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import {
  finishLoginInputSchema,
  finishLoginOutputSchema,
  startLoginInputSchema,
  startLoginOutputSchema,
} from "@repo/schema";

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

      const res = await db.query.usersTable.findFirst({
        columns: { registrationRecord: true, userId: true },
        where: { emailHash },
      });

      if (!res) denyLogin(log, "startLogin", "user_not_found", emailHash);
      const { registrationRecord, userId } = res;

      let ke1: KE1;
      let record: RegistrationRecord;
      try {
        ke1 = KE1.deserialize(opaqueConfig, b64ToBytes(startLoginRequest));
        record = RegistrationRecord.deserialize(opaqueConfig, b64ToBytes(registrationRecord));
      } catch {
        denyLogin(log, "startLogin", "decode_failed", emailHash);
      }

      // credential_identifier = email (mirrors prior serenity userIdentifier).
      // client_identity = email is mixed into MAC transcripts — must match what
      // the client passes to authFinish.
      const initResult = await opaqueServer.authInit(ke1, record, email, email);
      if (initResult instanceof Error) {
        denyLogin(log, "startLogin", "opaque_start_failed", emailHash);
      }

      const loginResponse = bytesToB64(initResult.ke2.serialize());
      const expected = bytesToB64(initResult.expected.serialize());

      await setLoginAttempt({ userId, expected });

      return { loginResponse };
    }),

  finishLogin: loggedProcedure
    .input(finishLoginInputSchema)
    .output(finishLoginOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { finishLoginRequest, email, authSalt } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const userQueryRes = await db.query.usersTable.findFirst({
        columns: { userId: true },
        where: { emailHash, deleted_at: { isNull: true } },
      });

      if (!userQueryRes) denyLogin(log, "finishLogin", "user_not_found", emailHash);
      const { userId } = userQueryRes;

      const loginAttempt = await getLoginAttempt(userId);
      if (!loginAttempt) denyLogin(log, "finishLogin", "no_login_attempt", emailHash);

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

      const sessionKey = bytesToB64(finResult.session_key);

      await delLoginAttempt(userId);

      const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
      const authKey = await hkdf(sessionSecret, "sessionAuth", fromBase64(authSalt));

      const sessionId = await setSession({
        userId,
        rawAuthKey: toBase64(authKey),
      });

      wipe(sessionSecret);
      wipe(authKey);

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

      log?.info({ emailHash }, "auth.login.success");
      return { sessionId, userPasswordKeys: keyQueryRes };
    }),
});
