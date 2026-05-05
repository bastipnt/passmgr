import { loggedProcedure } from "../logger";
import { opaque, serverKey, serverSetup } from "../opaque";
import { router } from "../trpc";
import { db } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { fromString, hashEmail, hkdf, wipe } from "@repo/crypto";
import { delLoginAttempt, getLoginAttempt, setLoginAttempt, setSession } from "../util/redisUtils";
import { fromBase64, toBase64 } from "@repo/util";
import {
  finishLoginInputSchema,
  finishLoginOutputSchema,
  startLoginInputSchema,
  startLoginOutputSchema,
} from "@repo/schema";

function unauthorized(): never {
  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "invalid user credentials",
  });
}

export const loginRouter = router({
  startLogin: loggedProcedure
    .input(startLoginInputSchema)
    .output(startLoginOutputSchema)
    .mutation(async ({ input }) => {
      const { startLoginRequest, email } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const res = await db.query.usersTable.findFirst({
        columns: { registrationRecord: true, userId: true },
        where: { emailHash },
      });

      if (!res) unauthorized();
      const { registrationRecord, userId } = res;

      let serverLoginState, loginResponse;

      try {
        ({ serverLoginState, loginResponse } = opaque.server.startLogin({
          serverSetup,
          userIdentifier: email,
          registrationRecord,
          startLoginRequest,
        }));
      } catch {
        unauthorized();
      }

      await setLoginAttempt({ userId, serverLoginState });

      return { loginResponse };
    }),

  finishLogin: loggedProcedure
    .input(finishLoginInputSchema)
    .output(finishLoginOutputSchema)
    .mutation(async ({ input }) => {
      const { finishLoginRequest, email, authSalt } = input;
      const emailHash = toBase64(await hashEmail(serverKey, email));

      const userQueryRes = await db.query.usersTable.findFirst({
        columns: { userId: true },
        where: { emailHash, deleted_at: { isNull: true } },
      });

      if (!userQueryRes) unauthorized();
      const { userId } = userQueryRes;

      const loginAttempt = await getLoginAttempt(userId);
      if (!loginAttempt) unauthorized();

      const { serverLoginState } = loginAttempt;

      let sessionKey: string;

      try {
        ({ sessionKey } = opaque.server.finishLogin({
          finishLoginRequest,
          serverLoginState,
        }));
      } catch {
        unauthorized();
      }

      await delLoginAttempt(userId);

      const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
      const authKey = await hkdf(sessionSecret, "sessionAuth", fromBase64(authSalt));

      const sessionId = await setSession({
        userId,
        rawAuthKey: toBase64(authKey),
      });

      // cleanup of keys
      wipe(sessionSecret);
      wipe(authKey);

      // TODO: global constraint deleted_at is null?
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

      if (!keyQueryRes) unauthorized();

      return { sessionId, userPasswordKeys: keyQueryRes };
    }),
});
