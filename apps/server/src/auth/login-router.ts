import { ExpectedAuthResult, KE1, KE3, RegistrationRecord } from "@cloudflare/opaque-ts";
import { hashEmail, hkdf, wipe } from "@repo/crypto";
import { db, userKeyPairsTable } from "@repo/db";
import {
  finishLoginInputSchema,
  finishLoginOutputSchema,
  logoutInputSchema,
  SECOND_FACTOR_EXPIRED,
  SECOND_FACTOR_INVALID,
  SECOND_FACTOR_MAX_ATTEMPTS,
  startLoginInputSchema,
  startLoginOutputSchema,
  verifySecondFactorInputSchema,
  verifySecondFactorOutputSchema,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { loggedProcedure, shortHash } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import {
  countSecondFactorAttempt,
  deleteSession,
  getLoginLockMs,
  getSecondFactorChallenge,
  isLoginRevoked,
  recordLoginStart,
  resetLoginThrottle,
  setLoginAttempt,
  setSecondFactorChallenge,
  setSession,
  takeLoginAttempt,
  takeSecondFactorChallenge,
} from "../util/redis-utils";
import { memberVaults } from "../vault/access";
import { protectedProcedure } from "./auth-middleware";
import { fakeRegistrationRecord } from "./fake-record";
import { checkSecondFactor, hasTotp } from "./two-factor";

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

function denySecondFactor(
  log: LoginLog | undefined,
  reason: string,
  message: typeof SECOND_FACTOR_INVALID | typeof SECOND_FACTOR_EXPIRED,
  emailHash?: string,
): never {
  log?.warn({ stage: "verifySecondFactor", reason, emailHash }, "auth.login.failure");
  throw new TRPCError({ code: "UNAUTHORIZED", message });
}

/**
 * What a completed login hands out besides the session: the password wrap of
 * the account key, the wrap of every vault key the user holds and the current
 * keypair.
 */
async function loginKeys(
  log: LoginLog | undefined,
  stage: "finishLogin" | "verifySecondFactor",
  userId: string,
  emailHash: string,
) {
  const keyQueryRes = await db.query.keysTable.findFirst({
    columns: {
      passwordKekParams: true,
      passwordKekSalt: true,
      encryptedAccountKey: true,
      accountKeyEncryptionNonce: true,
    },
    where: {
      userId,
      valid_to: { isNull: true },
      deleted_at: { isNull: true },
    },
  });
  if (!keyQueryRes) denyLogin(log, stage, "no_keys", emailHash);

  // Every vault the user can access, with their wrap of its key.
  const vaultKeys = await memberVaults(userId);

  // The current (highest-version) keypair.
  const [userKeyPair] = await db
    .select({
      keyVersion: userKeyPairsTable.keyVersion,
      publicKey: userKeyPairsTable.publicKey,
      encryptedPrivateKey: userKeyPairsTable.encryptedPrivateKey,
      privateKeyEncryptionNonce: userKeyPairsTable.privateKeyEncryptionNonce,
    })
    .from(userKeyPairsTable)
    .where(eq(userKeyPairsTable.userId, userId))
    .orderBy(desc(userKeyPairsTable.keyVersion))
    .limit(1);
  if (!userKeyPair) denyLogin(log, stage, "no_key_pair", emailHash);

  return { userPasswordKeys: keyQueryRes, vaultKeys, userKeyPair };
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

      // Before the read: a password change committed after it still revokes.
      const startedAt = Date.now();
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

      const attemptId = await setLoginAttempt({
        userId: res?.userId ?? null,
        emailHash,
        expected,
        startedAt,
      });

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
      // Password changed or recovered since startLogin: the old one doesn't log in.
      if (await isLoginRevoked(userId, loginAttempt.startedAt)) {
        denyLogin(log, "finishLogin", "revoked", emailHash);
      }

      const sessionKey = bytesToB64(finResult.session_key);
      const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
      const authKey = await hkdf(sessionSecret, "sessionAuth", fromBase64(authSalt));
      const rawAuthKey = toBase64(authKey);
      wipe(sessionSecret);
      wipe(authKey);

      // Two-factor on: the password was right, but no keys and no session (and
      // the throttle keeps counting) until verifySecondFactor gets a code.
      // Only said after a successful authFinish, so it reveals nothing about
      // an email to someone without its password.
      if (await hasTotp(userId)) {
        const challengeId = await setSecondFactorChallenge({
          userId,
          emailHash,
          rawAuthKey,
          deviceName: ctx.deviceName,
          startedAt: loginAttempt.startedAt,
        });
        log?.info({ emailHash }, "auth.login.second_factor_required");
        return { secondFactorRequired: true as const, challengeId };
      }

      const keys = await loginKeys(log, "finishLogin", userId, emailHash);
      await resetLoginThrottle(emailHash);
      const sessionId = await setSession({
        userId,
        rawAuthKey,
        authenticatedAt: Date.now(),
        deviceName: ctx.deviceName,
      });

      log?.info({ emailHash }, "auth.login.success");
      return { sessionId, userId, ...keys };
    }),

  // The second login step of an account with two-factor on: a TOTP code or a
  // backup code for the challenge finishLogin handed out. A wrong code counts
  // against the account's login throttle; SECOND_FACTOR_MAX_ATTEMPTS of them
  // burn the challenge (the login starts over with the password).
  verifySecondFactor: loggedProcedure
    .input(verifySecondFactorInputSchema)
    .output(verifySecondFactorOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const { challengeId, code } = input;

      const challenge = await getSecondFactorChallenge(challengeId);
      if (!challenge) denySecondFactor(log, "no_challenge", SECOND_FACTOR_EXPIRED);
      const { userId, emailHash } = challenge;

      const lockMs = await getLoginLockMs(emailHash);
      if (lockMs > 0) {
        log?.warn({ emailHash, lockMs }, "auth.login.throttled");
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `too many login attempts, retry in ${Math.ceil(lockMs / 1000)}s`,
        });
      }

      const attempts = await countSecondFactorAttempt(challengeId);
      if (attempts < 0 || attempts > SECOND_FACTOR_MAX_ATTEMPTS) {
        await takeSecondFactorChallenge(challengeId);
        denySecondFactor(log, "attempts_exhausted", SECOND_FACTOR_EXPIRED, emailHash);
      }

      // Password changed or recovered since the login started: the challenge is
      // dead. Checked (and the keys loaded) before the code is spent, so a
      // failure here doesn't burn a backup code or TOTP step.
      if (await isLoginRevoked(userId, challenge.startedAt)) {
        await takeSecondFactorChallenge(challengeId);
        denySecondFactor(log, "revoked", SECOND_FACTOR_EXPIRED, emailHash);
      }
      const keys = await loginKeys(log, "verifySecondFactor", userId, emailHash);

      if (!(await checkSecondFactor(userId, code))) {
        await recordLoginStart(emailHash);
        if (attempts >= SECOND_FACTOR_MAX_ATTEMPTS) {
          await takeSecondFactorChallenge(challengeId);
          denySecondFactor(log, "wrong_code", SECOND_FACTOR_EXPIRED, emailHash);
        }
        denySecondFactor(log, "wrong_code", SECOND_FACTOR_INVALID, emailHash);
      }

      // Single use: a parallel request with another good code gets nothing.
      if (!(await takeSecondFactorChallenge(challengeId))) {
        denySecondFactor(log, "challenge_taken", SECOND_FACTOR_EXPIRED, emailHash);
      }

      await resetLoginThrottle(emailHash);
      const sessionId = await setSession({
        userId,
        rawAuthKey: challenge.rawAuthKey,
        authenticatedAt: Date.now(),
        deviceName: challenge.deviceName,
        secondFactor: true,
      });

      log?.info({ emailHash }, "auth.login.success");
      return { sessionId, userId, ...keys };
    }),

  logout: protectedProcedure.input(logoutInputSchema).mutation(async ({ ctx }) => {
    await deleteSession(ctx.sessionId, ctx.userId);
    ctx.req?.log?.info({ sidHash: await shortHash(ctx.sessionId) }, "auth.logout");
    return { ok: true } as const;
  }),
});
