import { ExpectedAuthResult, KE1, KE3, RegistrationRecord } from "@cloudflare/opaque-ts";
import {
  deviceLoginChallenge,
  deviceSessionKey,
  generateDeviceLoginKeyPair,
  hashEmail,
  hkdf,
  wipe,
} from "@repo/crypto";
import { db, deviceCredentialsTable, userKeyPairsTable } from "@repo/db";
import {
  finishDeviceLoginInputSchema,
  finishDeviceLoginOutputSchema,
  finishLoginInputSchema,
  finishLoginOutputSchema,
  logoutInputSchema,
  SECOND_FACTOR_EXPIRED,
  SECOND_FACTOR_INVALID,
  SECOND_FACTOR_MAX_ATTEMPTS,
  startDeviceLoginInputSchema,
  startDeviceLoginOutputSchema,
  startLoginInputSchema,
  startLoginOutputSchema,
  verifySecondFactorInputSchema,
  verifySecondFactorOutputSchema,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { loggedProcedure, shortHash } from "../logger";
import { b64ToBytes, bytesToB64, opaqueConfig, opaqueServer, serverKey } from "../opaque";
import { router } from "../trpc";
import { allowedHostnames } from "../util/allowed-origins";
import {
  countSecondFactorAttempt,
  deleteSession,
  getLoginLockMs,
  getSecondFactorChallenge,
  isLoginRevoked,
  recordLoginStart,
  resetLoginThrottle,
  SESSION_MAX_AGE_MS,
  setDeviceLoginAttempt,
  setLoginAttempt,
  setSecondFactorChallenge,
  setSession,
  takeDeviceLoginAttempt,
  takeLoginAttempt,
  takeSecondFactorChallenge,
} from "../util/redis-utils";
import { memberVaults } from "../vault/access";
import { protectedProcedure } from "./auth-middleware";
import { fakeRegistrationRecord } from "./fake-record";
import { checkSecondFactor, hasTotp } from "./two-factor";
import { verifyAssertion } from "./webauthn";

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

function denyDeviceLogin(log: LoginLog | undefined, stage: string, reason: string): never {
  log?.warn({ stage, reason }, "auth.login.failure");
  throw new TRPCError({ code: "UNAUTHORIZED", message: "invalid device credential" });
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

type LoginStage = "finishLogin" | "finishDeviceLogin" | "verifySecondFactor";

/**
 * What a completed login hands out besides the session: the password wrap of
 * the account key, the wrap of every vault key the user holds and the current
 * keypair.
 */
async function loginKeys(
  log: LoginLog | undefined,
  stage: LoginStage,
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

/** The session's auth key (base64), derived from the login's session key as the client does. */
async function sessionAuthKey(sessionKey: string, authSalt: string): Promise<string> {
  const sessionSecret = await hkdf(fromString(sessionKey), "sessionSecret");
  const authKey = await hkdf(sessionSecret, "sessionAuth", fromBase64(authSalt));
  const rawAuthKey = toBase64(authKey);
  wipe(sessionSecret);
  wipe(authKey);
  return rawAuthKey;
}

type VerifiedLogin = {
  userId: string;
  emailHash: string;
  rawAuthKey: string;
  deviceName?: string;
  startedAt: number;
  // Set for a device login (`passwordless` session).
  deviceCredentialId?: string;
};

/**
 * The end of a verified login (password or device credential): with
 * two-factor on, a challenge for `verifySecondFactor` instead of a session.
 * Only said after the first factor passed, so it reveals nothing about an
 * account to someone who can't log in to it. A device login leaves the
 * password throttle alone: it proves nothing about password guesses.
 */
async function completeLogin(log: LoginLog | undefined, stage: LoginStage, login: VerifiedLogin) {
  const { userId, emailHash, rawAuthKey, deviceName, deviceCredentialId } = login;
  if (await hasTotp(userId)) {
    const challengeId = await setSecondFactorChallenge(login);
    log?.info({ emailHash }, "auth.login.second_factor_required");
    return { secondFactorRequired: true as const, challengeId };
  }

  const keys = await loginKeys(log, stage, userId, emailHash);
  if (!deviceCredentialId) await resetLoginThrottle(emailHash);
  const sessionId = await setSession({
    userId,
    rawAuthKey,
    authenticatedAt: Date.now(),
    deviceName,
    ...(deviceCredentialId && { deviceCredentialId, passwordless: true }),
  });

  log?.info({ emailHash, device: deviceCredentialId !== undefined }, "auth.login.success");
  return { sessionId, userId, ...keys };
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

      const rawAuthKey = await sessionAuthKey(bytesToB64(finResult.session_key), authSalt);
      return await completeLogin(log, "finishLogin", {
        userId,
        emailHash,
        rawAuthKey,
        deviceName: ctx.deviceName,
        startedAt: loginAttempt.startedAt,
      });
    }),

  // Device login (web biometric unlock): the server hands out a nonce and an
  // ephemeral X25519 key; the WebAuthn challenge covers both and the client's
  // key, so the signed assertion vouches for the key agreement the session
  // key comes from. Nothing password-equivalent is stored on the device.
  startDeviceLogin: loggedProcedure
    .input(startDeviceLoginInputSchema)
    .output(startDeviceLoginOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const startedAt = Date.now();
      const credential = await db.query.deviceCredentialsTable.findFirst({
        columns: { userId: true },
        where: { credentialId: input.credentialId },
      });
      if (!credential) denyDeviceLogin(log, "startDeviceLogin", "unknown_credential");

      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const { privateKey, publicKey } = generateDeviceLoginKeyPair();
      const attemptId = await setDeviceLoginAttempt({
        userId: credential.userId,
        credentialId: input.credentialId,
        nonce: toBase64(nonce),
        serverPrivateKey: toBase64(privateKey),
        serverPublicKey: toBase64(publicKey),
        startedAt,
      });
      wipe(privateKey);
      return { attemptId, nonce: toBase64(nonce), serverPublicKey: toBase64(publicKey) };
    }),

  finishDeviceLogin: loggedProcedure
    .input(finishDeviceLoginInputSchema)
    .output(finishDeviceLoginOutputSchema)
    .mutation(async ({ input, ctx }) => {
      const log = ctx.req?.log;
      const attempt = await takeDeviceLoginAttempt(input.attemptId);
      if (!attempt) denyDeviceLogin(log, "finishDeviceLogin", "no_login_attempt");
      const { userId, credentialId } = attempt;

      const [credential, user] = await Promise.all([
        db.query.deviceCredentialsTable.findFirst({
          where: { credentialId, userId },
        }),
        db.query.usersTable.findFirst({
          columns: { emailHash: true },
          where: { userId, deleted_at: { isNull: true } },
        }),
      ]);
      if (!credential || !user) denyDeviceLogin(log, "finishDeviceLogin", "credential_gone");
      // Like a session's hard cap: the password has to come back now and then.
      if (Date.now() - credential.passwordVerifiedAt.getTime() > SESSION_MAX_AGE_MS)
        denyDeviceLogin(log, "finishDeviceLogin", "password_too_old");

      const clientPublicKey = fromBase64(input.clientPublicKey);
      const challenge = deviceLoginChallenge(
        fromBase64(attempt.nonce),
        fromBase64(attempt.serverPublicKey),
        clientPublicKey,
      );
      const verified = verifyAssertion(
        {
          authenticatorData: fromBase64(input.authenticatorData),
          clientDataJSON: fromBase64(input.clientDataJSON),
          signature: fromBase64(input.signature),
        },
        {
          publicKey: fromBase64(credential.publicKey),
          algorithm: credential.algorithm,
          signCount: credential.signCount,
        },
        { challenge, allowedHostnames },
      );
      if (!verified.ok) denyDeviceLogin(log, "finishDeviceLogin", verified.reason);
      if (await isLoginRevoked(userId, attempt.startedAt))
        denyDeviceLogin(log, "finishDeviceLogin", "revoked");

      // Compare-and-swap: of two logins with one counter value one wins, and a
      // credential deleted meanwhile (revoked) matches nothing. A counter-less
      // authenticator (always 0) never conflicts with itself.
      const [counted] = await db
        .update(deviceCredentialsTable)
        .set({ signCount: verified.signCount, lastUsedAt: new Date() })
        .where(
          and(
            eq(deviceCredentialsTable.credentialId, credentialId),
            eq(deviceCredentialsTable.signCount, credential.signCount),
          ),
        )
        .returning({ credentialId: deviceCredentialsTable.credentialId });
      if (!counted) denyDeviceLogin(log, "finishDeviceLogin", "sign_count");

      const serverPrivateKey = fromBase64(attempt.serverPrivateKey);
      const sessionKey = await deviceSessionKey(serverPrivateKey, clientPublicKey, challenge);
      wipe(serverPrivateKey);
      return await completeLogin(log, "finishDeviceLogin", {
        userId,
        emailHash: user.emailHash,
        rawAuthKey: await sessionAuthKey(sessionKey, input.authSalt),
        deviceName: ctx.deviceName,
        startedAt: attempt.startedAt,
        deviceCredentialId: credentialId,
      });
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

      const { deviceCredentialId } = challenge;
      if (!deviceCredentialId) await resetLoginThrottle(emailHash);
      const sessionId = await setSession({
        userId,
        rawAuthKey: challenge.rawAuthKey,
        authenticatedAt: Date.now(),
        deviceName: challenge.deviceName,
        secondFactor: true,
        ...(deviceCredentialId && { deviceCredentialId, passwordless: true }),
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
