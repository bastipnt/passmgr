import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DEVICE_LOGIN_TTL_MS,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_SECONDS,
} from "@repo/schema";
import type { ChainableCommander, Result } from "ioredis";
import { serverEnv } from "../env";
import { emitSessionEnded, emitSessionSignedOut } from "../events/record-events";
import { redis } from "../redis";
import { DAY_MS, REQUEST_TIMESTAMP_WINDOW_MS } from "./time";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // idle
// Hard cap from the OPAQUE login, however active the session stays.
export const SESSION_MAX_AGE_MS = 30 * DAY_MS;
const LOGIN_ATTEMPT_TTL_SECONDS = REQUEST_TIMESTAMP_WINDOW_MS / 1000;
// A minute past the window, so a nonce outlives the timestamps it could replay.
const NONCE_TTL_SECONDS = LOGIN_ATTEMPT_TTL_SECONDS + 60;
const TOTP_ENROLLMENT_TTL_SECONDS = 10 * 60; // 10min to scan and confirm
export const INVITE_TTL_SECONDS = 60 * 60 * 24;
// A new login past this signs out the user's least recently active sessions.
export const MAX_SESSIONS_PER_USER = 50;

// Per-account login throttling. OPAQUE lets the client check a password guess
// locally in `authFinish`, so every `startLogin` is one guess — count starts,
// not failed finishes. Keyed by emailHash (also for unknown emails, so the
// throttle itself doesn't reveal which accounts exist).
// Trade-off: anyone who knows an email can lock that account for at most
// LOGIN_MAX_BACKOFF_MS; the cap keeps that a nuisance rather than a lockout.
export const LOGIN_FREE_ATTEMPTS = 5;
const LOGIN_BASE_BACKOFF_MS = 1_000;
const LOGIN_MAX_BACKOFF_MS = 15 * 60_000;
const LOGIN_THROTTLE_WINDOW_SECONDS = 60 * 60; // 1h without starts resets the counter

type Session = {
  userId: string;
  rawAuthKey: string;
  // Unix ms of the OPAQUE login that created this session (fresh-auth checks,
  // SESSION_MAX_AGE_MS).
  authenticatedAt: number;
  // Label the client sent at login ("Firefox on macOS"), for the session list.
  deviceName?: string;
  // The login passed a second factor (`login.verifySecondFactor`). Changing
  // two-factor needs a session that did.
  secondFactor?: boolean;
  // This device's credential (`device_credentials`): the one it logged in
  // with, registered or linked (`user.linkDeviceCredential`) during the
  // session. Revoking the session deletes it.
  deviceCredentialId?: string;
  // Logged in with a device credential, not the password: never fresh auth.
  passwordless?: boolean;
};

/** A live session of a user, as the session list shows it. */
export type UserSession = {
  sessionId: string;
  deviceName?: string;
  authenticatedAt: number;
  // Unix ms of the last authenticated request (or the login).
  lastSeenAt: number;
};

type RecoveryAttempt = {
  userId: string;
  emailHash: string;
  // Active key set when recovery started; finish refuses if it changed since.
  keySetId: string;
};

type PasswordChangeAttempt = {
  userId: string;
  // Active key set when the change started; finish refuses if it changed since.
  keySetId: string;
};

/** A login whose password was right, waiting for its second factor. */
type SecondFactorChallenge = {
  userId: string;
  emailHash: string;
  // The session's auth key, derived at finishLogin; the session is created
  // with it once the code checks out.
  rawAuthKey: string;
  deviceName?: string;
  // The login's startLogin (LoginAttempt.startedAt), see isLoginRevoked.
  startedAt: number;
  // A device login's credential (Session.deviceCredentialId, `passwordless`).
  deviceCredentialId?: string;
};

/** A device login (WebAuthn) waiting for its signed assertion. */
type DeviceLoginAttempt = {
  userId: string;
  credentialId: string;
  // base64: the nonce and the server's ephemeral X25519 key pair.
  nonce: string;
  serverPrivateKey: string;
  serverPublicKey: string;
  // Unix ms before the credential was read, see isLoginRevoked.
  startedAt: number;
};

type Invite = {
  // When set, the invite can only register this exact email.
  email?: string;
};

type LoginAttempt = {
  // null when startLogin answered with a fake record (unknown email).
  userId: string | null;
  emailHash: string;
  // Base64-encoded ExpectedAuthResult from @cloudflare/opaque-ts authInit.
  // Threaded from startLogin to finishLogin (5min TTL = OPAQUE replay window).
  expected: string;
  // Unix ms when startLogin read the registration record, see isLoginRevoked.
  startedAt: number;
};

function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

// A hash: the challenge's fields plus an `attempts` counter.
function secondFactorKey(challengeId: string) {
  return `login2fa:${challengeId}`;
}

// The secret of a TOTP enrollment the user hasn't confirmed with a code yet.
function totpEnrollmentKey(userId: string) {
  return `totpenroll:${userId}`;
}

// Unix ms before which every session of this user is invalid (see
// revokeUserSessions). No TTL: sliding sessions can outlive any fixed window.
function sessionEpochKey(userId: string) {
  return `sessionepoch:${userId}`;
}

// Set once a request found the user's email verified, so `verifiedProcedure`
// reads it with the session instead of asking Postgres.
function emailVerifiedKey(userId: string) {
  return `emailverified:${userId}`;
}

// Sorted set of a user's session ids, scored by last activity (Unix ms). The
// only way to find a user's sessions (session list, log out other devices).
// Members may outlive their session; readers drop them.
function userSessionsKey(userId: string) {
  return `usersessions:${userId}`;
}

// Set when a session is signed out from elsewhere (revoked, password changed);
// outlives the session so the device learns why it was refused.
function signedOutKey(sessionId: string) {
  return `signedout:${sessionId}`;
}

// Second-factor codes of a device login count on their own throttle: a device
// login never touches the password throttle.
export type LoginThrottle = "password" | "device";

function loginThrottleKey(emailHash: string, throttle: LoginThrottle = "password") {
  return throttle === "password"
    ? `loginthrottle:${emailHash}`
    : `loginthrottle:device:${emailHash}`;
}

function loginLockKey(emailHash: string, throttle: LoginThrottle = "password") {
  return throttle === "password" ? `loginlock:${emailHash}` : `loginlock:device:${emailHash}`;
}

function isLive(session: Session, epoch: string | null, now: number): boolean {
  // `?? 0`: a session without a login time counts as oldest (expired).
  const authenticatedAt = session.authenticatedAt ?? 0;
  if (epoch !== null && authenticatedAt <= Number(epoch)) return false;
  return now - authenticatedAt < SESSION_MAX_AGE_MS;
}

/** The sliding idle TTL, capped by what is left of the session's max age. */
function sessionTtlSeconds(session: Session, now: number): number {
  const leftSeconds = Math.ceil((session.authenticatedAt + SESSION_MAX_AGE_MS - now) / 1000);
  return Math.min(SESSION_TTL_SECONDS, leftSeconds);
}

export async function getSession(
  sessionId: string,
): Promise<(Session & { emailVerified: boolean }) | undefined> {
  const rawSession = await redis.get(sessionKey(sessionId));
  if (rawSession === null) return undefined;

  const session: Session = JSON.parse(rawSession);
  const [epoch, emailVerified] = await redis.mget(
    sessionEpochKey(session.userId),
    emailVerifiedKey(session.userId),
  );
  if (!isLive(session, epoch ?? null, Date.now())) {
    await deleteSession(sessionId, session.userId);
    return undefined;
  }

  return { ...session, emailVerified: emailVerified !== null };
}

export async function forgetEmailVerified(userId: string): Promise<void> {
  await redis.del(emailVerifiedKey(userId));
}

export async function cacheEmailVerified(userId: string): Promise<void> {
  await redis.set(emailVerifiedKey(userId), "1", "PX", SESSION_MAX_AGE_MS);
}

/**
 * Store a new session. Past MAX_SESSIONS_PER_USER live sessions, the least
 * recently active ones are signed out; that part is best-effort (`onEvictError`),
 * the next login retries it.
 */
export async function setSession(
  session: Session,
  onEvictError?: (err: unknown) => void,
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const index = userSessionsKey(session.userId);

  const results = await redis
    .multi()
    .set(sessionKey(sessionId), JSON.stringify(session), "EX", sessionTtlSeconds(session, now))
    .zadd(index, now, sessionId)
    // Idle longer than the TTL: those sessions are gone.
    .zremrangebyscore(index, "-inf", now - SESSION_TTL_SECONDS * 1000)
    // No session in it can outlive the newest one's max age.
    .pexpire(index, SESSION_MAX_AGE_MS)
    .zcard(index)
    .exec();

  const indexed = Number(results?.[4]?.[1] ?? 0);
  if (indexed > MAX_SESSIONS_PER_USER) {
    try {
      // The index may hold dead entries; only live sessions count.
      const live = await listUserSessions(session.userId);
      const evicted = live.slice(MAX_SESSIONS_PER_USER).map((s) => s.sessionId);
      await signOutSessions(session.userId, evicted);
    } catch (err) {
      onEvictError?.(err);
    }
  }

  return sessionId;
}

/**
 * Sliding-expiration refresh: roll the session's 24h TTL forward on activity so
 * an active user (mobile session restored on each reopen) stays logged in,
 * while an idle session still expires after 24h. Never past
 * SESSION_MAX_AGE_MS from the login. Best-effort.
 */
export async function touchSession(sessionId: string, session: Session): Promise<void> {
  const now = Date.now();
  const ttl = sessionTtlSeconds(session, now);
  if (ttl <= 0) return;
  await redis
    .multi()
    .expire(sessionKey(sessionId), ttl)
    // XX: a session revoked meanwhile is not listed again.
    .zadd(userSessionsKey(session.userId), "XX", now, sessionId)
    .exec();
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  await execOrThrow(
    redis.multi().del(sessionKey(sessionId)).zrem(userSessionsKey(userId), sessionId),
  );
  emitSessionEnded(sessionId);
}

/** `exec` resolves a failed command as an `[err, result]` tuple; throw it instead. */
async function execOrThrow(tx: ChainableCommander): Promise<unknown[]> {
  const results = await tx.exec();
  if (!results) throw new Error("transaction aborted");
  const failed = results.find(([err]) => err);
  if (failed) throw failed[0];
  return results.map(([, result]) => result);
}

/** The user's live sessions, most recently active first. Drops dead index entries. */
export async function listUserSessions(userId: string): Promise<UserSession[]> {
  const index = userSessionsKey(userId);
  const scored = await redis.zrevrange(index, 0, -1, "WITHSCORES");
  if (scored.length === 0) return [];

  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < scored.length; i += 2) {
    ids.push(scored[i]!);
    scores.push(Number(scored[i + 1]));
  }
  const [raws, epoch] = await Promise.all([
    redis.mget(ids.map(sessionKey)),
    redis.get(sessionEpochKey(userId)),
  ]);

  const now = Date.now();
  const live: UserSession[] = [];
  const dead: string[] = [];
  ids.forEach((sessionId, i) => {
    const raw = raws[i];
    const session: Session | undefined = raw ? JSON.parse(raw) : undefined;
    if (!session || session.userId !== userId || !isLive(session, epoch, now)) {
      dead.push(sessionId);
      return;
    }
    live.push({
      sessionId,
      deviceName: session.deviceName,
      authenticatedAt: session.authenticatedAt,
      lastSeenAt: scores[i]!,
    });
  });
  if (dead.length > 0) await redis.zrem(index, ...dead);

  return live;
}

/** Ids in the user's session index (may include sessions that already ended). */
export async function userSessionIds(userId: string): Promise<string[]> {
  return await redis.zrange(userSessionsKey(userId), 0, -1);
}

/**
 * End sessions and mark them signed out: a request with one of them is
 * refused with SESSION_SIGNED_OUT (the device locks instead of going offline),
 * and its open record stream is told right away.
 */
async function signOutSessions(userId: string, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const tx = redis.multi();
  for (const id of sessionIds) {
    tx.del(sessionKey(id)).set(signedOutKey(id), "1", "PX", SESSION_MAX_AGE_MS);
  }
  await execOrThrow(tx.zrem(userSessionsKey(userId), ...sessionIds));
  for (const id of sessionIds) emitSessionSignedOut(id);
}

/** Whether this session was ended by a sign-out from elsewhere (not expired). */
export async function isSignedOut(sessionId: string): Promise<boolean> {
  return (await redis.exists(signedOutKey(sessionId))) === 1;
}

/** Sign one of the user's sessions out. False when it isn't theirs (or already gone). */
export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const listed = await redis.zscore(userSessionsKey(userId), sessionId);
  if (listed === null) return false;
  await signOutSessions(userId, [sessionId]);
  return true;
}

/** Sign out every session of the user except `keepSessionId` ("sign out other devices"). */
export async function revokeOtherUserSessions(
  userId: string,
  keepSessionId: string,
): Promise<number> {
  const others = (await userSessionIds(userId)).filter((id) => id !== keepSessionId);
  await signOutSessions(userId, others);
  return others.length;
}

/**
 * Invalidate every existing session of a user (password changed or
 * recovered). Records a cut-off that getSession checks (covers a session whose
 * index entry was lost) and signs the indexed sessions out. `exceptSessionId`
 * (the device making the change, which logs in again right away) only ends,
 * without the sign-out. Sessions created afterwards work.
 */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
  // Runs after the password swap has committed: the cut-off alone ends every
  // session, so it's set first, together with reading the index (a session
  // created in between is either listed or after the cut-off), and retried.
  // One cut-off for every attempt: a retry after a lost reply must not end
  // sessions logged in with the new password meanwhile.
  const cutOff = String(Date.now());
  const [, ids] = await withRetry(() =>
    execOrThrow(
      redis.multi().set(sessionEpochKey(userId), cutOff).zrange(userSessionsKey(userId), 0, -1),
    ),
  );
  await withRetry(() =>
    signOutSessions(
      userId,
      (ids as string[]).filter((id) => id !== exceptSessionId),
    ),
  );
  if (exceptSessionId) await withRetry(() => deleteSession(exceptSessionId, userId));
}

const REVOKE_ATTEMPTS = 3;
const REVOKE_RETRY_DELAY_MS = 100;

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= REVOKE_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, REVOKE_RETRY_DELAY_MS * attempt));
    }
  }
}

/**
 * A login started (registration record read) at or before the user's last
 * revokeUserSessions: it ran against the old password and must not create a
 * session. Its session would be stamped later and slip past the cut-off.
 */
export async function isLoginRevoked(userId: string, startedAt: number): Promise<boolean> {
  const epoch = await redis.get(sessionEpochKey(userId));
  return epoch !== null && startedAt <= Number(epoch);
}

/**
 * End every session of a deleted account (`revokeUserSessions`). The cut-off
 * expires once no session from before it could still be live: nothing
 * outlives the account.
 */
export async function endDeletedUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await revokeUserSessions(userId, exceptSessionId);
  await redis.pexpire(sessionEpochKey(userId), SESSION_MAX_AGE_MS);
  await forgetEmailVerified(userId);
}

/**
 * Short-lived state between the two steps of a flow, keyed by a random attempt
 * id (not the userId, so a third party calling startLogin with the victim's email
 * can't overwrite the victim's attempt). `take` fetches and deletes atomically,
 * so each attempt finishes at most once.
 */
function attemptStore<T>(prefix: string, ttlSeconds: number) {
  return {
    async set(attempt: T): Promise<string> {
      const attemptId = crypto.randomUUID();
      await redis.set(`${prefix}:${attemptId}`, JSON.stringify(attempt), "EX", ttlSeconds);
      return attemptId;
    },
    async take(attemptId: string): Promise<T | undefined> {
      const raw = await redis.getdel(`${prefix}:${attemptId}`);
      return raw === null ? undefined : JSON.parse(raw);
    },
  };
}

const loginAttempts = attemptStore<LoginAttempt>("login", LOGIN_ATTEMPT_TTL_SECONDS);
const deviceLoginAttempts = attemptStore<DeviceLoginAttempt>(
  "devicelogin",
  DEVICE_LOGIN_TTL_MS / 1000,
);
const recoveryAttempts = attemptStore<RecoveryAttempt>("recovery", LOGIN_ATTEMPT_TTL_SECONDS);
const passwordChangeAttempts = attemptStore<PasswordChangeAttempt>(
  "passwordchange",
  LOGIN_ATTEMPT_TTL_SECONDS,
);

export const setLoginAttempt = loginAttempts.set;
export const takeLoginAttempt = loginAttempts.take;
export const setDeviceLoginAttempt = deviceLoginAttempts.set;
export const takeDeviceLoginAttempt = deviceLoginAttempts.take;
export const setRecoveryAttempt = recoveryAttempts.set;
export const takeRecoveryAttempt = recoveryAttempts.take;
export const setPasswordChangeAttempt = passwordChangeAttempts.set;
export const takePasswordChangeAttempt = passwordChangeAttempts.take;

/** A session's device: its credential (see Session.deviceCredentialId) and name. Live or not. */
export async function sessionDevice(
  sessionId: string,
): Promise<Pick<Session, "deviceCredentialId" | "deviceName"> | undefined> {
  const raw = await redis.get(sessionKey(sessionId));
  if (raw === null) return undefined;
  const { deviceCredentialId, deviceName } = JSON.parse(raw) as Session;
  return { deviceCredentialId, deviceName };
}

/** The device credential of a session (see Session.deviceCredentialId). */
export async function sessionCredentialId(sessionId: string): Promise<string | undefined> {
  return (await sessionDevice(sessionId))?.deviceCredentialId;
}

/** Note the credential this session's device registered (see Session.deviceCredentialId). */
export async function linkSessionCredential(sessionId: string, credentialId: string) {
  const raw = await redis.get(sessionKey(sessionId));
  if (raw === null) return;
  const session: Session = { ...JSON.parse(raw), deviceCredentialId: credentialId };
  await redis.set(sessionKey(sessionId), JSON.stringify(session), "KEEPTTL", "XX");
}

export async function setSecondFactorChallenge(challenge: SecondFactorChallenge): Promise<string> {
  const challengeId = crypto.randomUUID();
  const key = secondFactorKey(challengeId);
  await redis
    .multi()
    .hset(key, {
      ...challenge,
      deviceName: challenge.deviceName ?? "",
      deviceCredentialId: challenge.deviceCredentialId ?? "",
      attempts: 0,
    })
    .expire(key, LOGIN_ATTEMPT_TTL_SECONDS)
    .exec();
  return challengeId;
}

/** The challenge, or undefined when it expired, was used or burned. */
export async function getSecondFactorChallenge(
  challengeId: string,
): Promise<SecondFactorChallenge | undefined> {
  const raw = await redis.hgetall(secondFactorKey(challengeId));
  if (!raw.userId || !raw.emailHash || !raw.rawAuthKey || !raw.startedAt) return undefined;
  return {
    userId: raw.userId,
    emailHash: raw.emailHash,
    rawAuthKey: raw.rawAuthKey,
    deviceName: raw.deviceName || undefined,
    startedAt: Number(raw.startedAt),
    deviceCredentialId: raw.deviceCredentialId || undefined,
  };
}

// HINCRBY alone would recreate an expired challenge (without a TTL).
const COUNT_ATTEMPT_SCRIPT = `
if redis.call("exists", KEYS[1]) == 0 then return -1 end
return redis.call("hincrby", KEYS[1], "attempts", 1)
`;

/**
 * Count one code tried against the challenge; returns the count including it,
 * or -1 when the challenge is gone. Counted before the code is checked, so
 * parallel guesses can't exceed the cap.
 */
export async function countSecondFactorAttempt(challengeId: string): Promise<number> {
  return Number(await redis.eval(COUNT_ATTEMPT_SCRIPT, 1, secondFactorKey(challengeId)));
}

/** End a challenge. True only for the one caller that ended it (single use). */
export async function takeSecondFactorChallenge(challengeId: string): Promise<boolean> {
  return (await redis.del(secondFactorKey(challengeId))) === 1;
}

/** Keep the secret of a TOTP enrollment until it's confirmed (replaces an older one). */
export async function setTotpEnrollment(userId: string, secret: string): Promise<void> {
  await redis.set(totpEnrollmentKey(userId), secret, "EX", TOTP_ENROLLMENT_TTL_SECONDS);
}

export async function getTotpEnrollment(userId: string): Promise<string | undefined> {
  return (await redis.get(totpEnrollmentKey(userId))) ?? undefined;
}

export async function deleteTotpEnrollment(userId: string): Promise<void> {
  await redis.del(totpEnrollmentKey(userId));
}

// One script so parallel attempts can't all pass the lock check before any of
// them sets the lock.
redis.defineCommand("claimLoginAttempt", {
  numberOfKeys: 2,
  lua: `
local lockMs = redis.call("pttl", KEYS[2])
if lockMs > 0 then return lockMs end
local count = redis.call("incr", KEYS[1])
redis.call("expire", KEYS[1], ARGV[1])
local excess = count - tonumber(ARGV[2])
if excess > 0 then
  local backoffMs = math.min(tonumber(ARGV[3]) * 2 ^ (excess - 1), tonumber(ARGV[4]))
  redis.call("set", KEYS[2], "1", "PX", backoffMs)
end
return 0
`,
});

declare module "ioredis" {
  interface RedisCommander<Context> {
    claimLoginAttempt(
      counterKey: string,
      lockKey: string,
      windowSeconds: number,
      freeAttempts: number,
      baseBackoffMs: number,
      maxBackoffMs: number,
    ): Result<number, Context>;
  }
}

/** Remaining lock time in ms, or 0. Only a pre-check: claimLoginAttempt is what enforces the lock. */
export async function getLoginLockMs(
  emailHash: string,
  throttle: LoginThrottle = "password",
): Promise<number> {
  const ttl = await redis.pttl(loginLockKey(emailHash, throttle));
  return ttl > 0 ? ttl : 0;
}

/**
 * Count one password guess or second-factor code. Returns the remaining lock
 * time in ms (nothing counted), or 0 when the attempt may go ahead. After
 * LOGIN_FREE_ATTEMPTS without a successful login, locks with exponential
 * back-off (1s, 2s, 4s, … capped).
 */
export async function claimLoginAttempt(
  emailHash: string,
  throttle: LoginThrottle = "password",
): Promise<number> {
  return Number(
    await redis.claimLoginAttempt(
      loginThrottleKey(emailHash, throttle),
      loginLockKey(emailHash, throttle),
      LOGIN_THROTTLE_WINDOW_SECONDS,
      LOGIN_FREE_ATTEMPTS,
      LOGIN_BASE_BACKOFF_MS,
      LOGIN_MAX_BACKOFF_MS,
    ),
  );
}

export async function resetLoginThrottle(
  emailHash: string,
  throttle: LoginThrottle = "password",
): Promise<void> {
  await redis.del(loginThrottleKey(emailHash, throttle), loginLockKey(emailHash, throttle));
}

function nonceKey(nonce: string) {
  return `nonce:${nonce}`;
}

/**
 * Atomically claim a per-request nonce. Returns `true` when this is the first
 * time the nonce has been seen (caller may proceed) and `false` when the nonce
 * has already been used inside the active window (caller must reject as replay).
 */
export async function claimNonce(nonce: string): Promise<boolean> {
  const result = await redis.set(nonceKey(nonce), "1", "EX", NONCE_TTL_SECONDS, "NX");
  return result === "OK";
}

/**
 * Only the SHA-256 of the code is stored, so a Redis dump doesn't leak
 * redeemable invites.
 */
function inviteKey(code: string) {
  return `invite:${createHash("sha256").update(code).digest("base64url")}`;
}

/**
 * Mint a single-use registration invite. Lets one user register while
 * REGISTRATION_DISABLED=true. Returns the code — it is not recoverable later.
 */
export async function createInvite(
  invite: Invite = {},
  ttlSeconds = INVITE_TTL_SECONDS,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await redis.set(inviteKey(code), JSON.stringify(invite), "EX", ttlSeconds);
  return code;
}

export async function getInvite(code: string): Promise<Invite | undefined> {
  const rawInvite = await redis.get(inviteKey(code));
  if (rawInvite === null) return undefined;

  return JSON.parse(rawInvite);
}

/**
 * Atomically redeem an invite. Returns `undefined` when it doesn't exist,
 * expired, or was already used.
 */
export async function consumeInvite(code: string): Promise<Invite | undefined> {
  const rawInvite = await redis.getdel(inviteKey(code));
  if (rawInvite === null) return undefined;

  return JSON.parse(rawInvite);
}

const EMAIL_CODE_TTL_SECONDS = 15 * 60;
const EMAIL_CODES_PER_HOUR = 5;
// Across every code the account is sent: with 5 tries per code alone, a week of
// resends would give a squatter about a 0.4 % chance at a foreign address.
export const EMAIL_CODE_MAX_TOTAL_ATTEMPTS = 25;
// Outlives the unverified account (purged after 7 days), so the cap holds for its lifetime.
const EMAIL_CODE_TOTAL_TTL_SECONDS = (8 * DAY_MS) / 1000;
// Shared by `user.publicKey` and `vault.invite` (both tell whether an email has
// an account); an invite takes a lookup and the invite itself.
const ACCOUNT_LOOKUPS_PER_HOUR = 60;

function emailCodeKey(userId: string) {
  return `emailcode:${userId}`;
}

function emailCodeCooldownKey(userId: string) {
  return `emailcode:cooldown:${userId}`;
}

function emailCodeHourlyKey(userId: string) {
  return `emailcode:hourly:${userId}`;
}

function emailCodeTotalKey(userId: string) {
  return `emailcode:total:${userId}`;
}

/** Count one event in a window that starts at the first; returns the count including it. */
async function countInWindow(key: string, windowSeconds: number): Promise<number> {
  const [[, count]] = (await redis.multi().incr(key).expire(key, windowSeconds, "NX").exec()) as [
    [Error | null, number],
    [Error | null, number],
  ];
  return count;
}

/**
 * Claim one email code send: false within EMAIL_CODE_RESEND_SECONDS of the
 * last one, past EMAIL_CODES_PER_HOUR (the hour runs from the first send), or
 * once the account has used up EMAIL_CODE_MAX_TOTAL_ATTEMPTS.
 */
export async function claimEmailCodeSend(userId: string): Promise<boolean> {
  const total = Number(await redis.get(emailCodeTotalKey(userId)));
  if (total >= EMAIL_CODE_MAX_TOTAL_ATTEMPTS) return false;

  const hourly = emailCodeHourlyKey(userId);
  if ((await countInWindow(hourly, 60 * 60)) > EMAIL_CODES_PER_HOUR) return false;

  const cooldown = await redis.set(
    emailCodeCooldownKey(userId),
    "1",
    "EX",
    EMAIL_CODE_RESEND_SECONDS,
    "NX",
  );
  if (cooldown === "OK") return true;
  await redis.decr(hourly);
  return false;
}

/** Undo a `claimEmailCodeSend` whose mail wasn't sent after all. */
export async function releaseEmailCodeSend(userId: string): Promise<void> {
  await redis.multi().del(emailCodeCooldownKey(userId)).decr(emailCodeHourlyKey(userId)).exec();
}

/**
 * Claim one outgoing mail against the server-wide and the per-domain hourly
 * cap (`domainHash`: a keyed hash of the recipient's domain). A refused send
 * isn't counted. Registration mails any address, so these bound what the
 * server sends for others; anyone registering can fill them, which only delays
 * verification (`rate_limited_total{limiter="mail"}` shows it), see
 * `MAILS_PER_HOUR` in `apps/server/CLAUDE.md`.
 */
export async function claimMailSend(domainHash: string): Promise<boolean> {
  const { MAILS_PER_HOUR, MAILS_PER_DOMAIN_PER_HOUR } = serverEnv;
  const global = "mail:hourly";
  const domain = `mail:domain:${domainHash}`;
  const [all, perDomain] = await Promise.all([
    countInWindow(global, 60 * 60),
    countInWindow(domain, 60 * 60),
  ]);
  if (all <= MAILS_PER_HOUR && perDomain <= MAILS_PER_DOMAIN_PER_HOUR) return true;
  await redis.multi().decr(global).decr(domain).exec();
  return false;
}

/** Claim one lookup of another account by email: false past ACCOUNT_LOOKUPS_PER_HOUR. */
export async function claimAccountLookup(userId: string): Promise<boolean> {
  return (await countInWindow(`lookup:hourly:${userId}`, 60 * 60)) <= ACCOUNT_LOOKUPS_PER_HOUR;
}

/** Store a new code's hash for the user, replacing any earlier one. */
export async function setEmailCode(userId: string, codeHash: string): Promise<void> {
  const key = emailCodeKey(userId);
  await redis
    .multi()
    .del(key)
    .hset(key, { hash: codeHash, attempts: 0 })
    .expire(key, EMAIL_CODE_TTL_SECONDS)
    .exec();
}

/**
 * Check a code's hash. The attempt is counted before the comparison, so
 * concurrent guesses can't exceed EMAIL_CODE_MAX_ATTEMPTS; the code is gone
 * after a match or the last wrong guess. Wrong guesses also count toward the
 * account's EMAIL_CODE_MAX_TOTAL_ATTEMPTS ("exhausted" once used up).
 */
export async function checkEmailCode(
  userId: string,
  codeHash: string,
): Promise<"ok" | "invalid" | "expired" | "exhausted"> {
  const key = emailCodeKey(userId);
  const totalKey = emailCodeTotalKey(userId);
  const [[, attempts], [, stored], [, total]] = (await redis
    .multi()
    .hincrby(key, "attempts", 1)
    .hget(key, "hash")
    .get(totalKey)
    .exec()) as [
    [Error | null, number],
    [Error | null, string | null],
    [Error | null, string | null],
  ];
  if (Number(total) >= EMAIL_CODE_MAX_TOTAL_ATTEMPTS) {
    await redis.del(key);
    return "exhausted";
  }
  if (stored === null || attempts > EMAIL_CODE_MAX_ATTEMPTS) {
    await redis.del(key);
    return "expired";
  }

  const given = Buffer.from(codeHash);
  if (given.length === stored.length && timingSafeEqual(given, Buffer.from(stored))) {
    await redis.del(key);
    return "ok";
  }
  await countInWindow(totalKey, EMAIL_CODE_TOTAL_TTL_SECONDS);
  if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) await redis.del(key);
  return "invalid";
}

export async function deleteEmailCodes(userId: string): Promise<void> {
  await redis.del(
    emailCodeKey(userId),
    emailCodeCooldownKey(userId),
    emailCodeHourlyKey(userId),
    emailCodeTotalKey(userId),
  );
}

// Active users: one HyperLogLog per UTC day. It only yields an approximate count
// (~1 %) of distinct users, never which users, so metrics can show daily /
// weekly / monthly actives without a per-user last-seen record.
const ACTIVE_USERS_DAYS = 30;

function activeUsersKey(dayMs: number) {
  return `activeusers:${new Date(dayMs).toISOString().slice(0, 10)}`;
}

export async function recordActiveUser(userId: string, now = Date.now()): Promise<void> {
  const key = activeUsersKey(now);
  await redis
    .multi()
    .pfadd(key, userId)
    .expire(key, (ACTIVE_USERS_DAYS + 1) * 24 * 60 * 60, "NX")
    .exec();
}

/** Distinct users active on the last `days` UTC days, today included. */
export async function countActiveUsers(days: number, now = Date.now()): Promise<number> {
  const keys = Array.from({ length: days }, (_, i) => activeUsersKey(now - i * DAY_MS));
  return await redis.pfcount(...keys);
}
