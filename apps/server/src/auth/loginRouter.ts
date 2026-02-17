import z from "zod";
import { loggedProcedure } from "../logger";
import { opaque, serverKey, serverSetup } from "../opaque";
import { router } from "../trpc";
import { db } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { fromString, hashEmail, hkdf, wipe } from "@repo/crypto";
import { delLoginAttempt, getLoginAttempt, setLoginAttempt, setSession } from "@util/redisUtils";
import { fromBase64, toBase64 } from "@repo/util";

class LoginError extends Error {
  override name: string = "LoginError";
}

const startLoginInputSchema = z.object({
  email: z.email(),
  startLoginRequest: z.string(),
});

const startLoginOutputSchema = z.object({
  loginResponse: z.string(),
});

const finishLoginInputSchema = z.object({
  email: z.string(),
  finishLoginRequest: z.string(),
  authSalt: z.string(),
});

const finishLoginOutputSchema = z.object({
  sessionId: z.string(),
});

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

      if (!res)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "invalid user credentials",
        });
      const { registrationRecord, userId } = res;

      let serverLoginState, loginResponse;

      try {
        ({ serverLoginState, loginResponse } = opaque.server.startLogin({
          serverSetup,
          userIdentifier: email,
          registrationRecord,
          startLoginRequest,
        }));
      } catch (error) {
        console.log(error);
        throw new LoginError();
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

      const res = await db.query.usersTable.findFirst({
        columns: { userId: true },
        where: { emailHash },
      });

      if (!res)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "invalid user credentials",
        });
      const { userId } = res;

      const loginAttempt = await getLoginAttempt(userId);
      if (!loginAttempt) throw new LoginError();

      const { serverLoginState } = loginAttempt;

      let sessionKey: string;

      try {
        ({ sessionKey } = opaque.server.finishLogin({
          finishLoginRequest,
          serverLoginState,
        }));
      } catch (error) {
        console.log(error);
        throw new LoginError();
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

      return { sessionId };
    }),
});
