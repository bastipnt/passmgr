import { createHash, randomBytes } from "node:crypto";
import { emitSessionSignedOut } from "../events/record-events";
import { redis } from "../redis";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h idle
// Hard cap from the OPAQUE login, however active the session stays.
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60_000; // 30 days
const LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60; // 5min — matches OPAQUE replay window
const NONCE_TTL_SECONDS = 6 * 60; // 6min — slightly outlives the ±5min timestamp window
const TOTP_ENROLLMENT_TTL_SECONDS = 10 * 60; // 10min to scan and confirm
export const INVITE_TTL_SECONDS = 60 * 60 * 24; // 24h

// Per-account login throttling. OPAQUE lets the client check a password guess
// locally in `authFinish`, so every `startLogin` is one guess — count starts,
// not failed finishes. Keyed by emailHash (also for unknown emails, so the
// throttle itself doesn't reveal which accounts exist).
// Trade-off: anyone who knows an email can lock that account for at most
// LOGIN_MAX_BACKOFF_MS; the cap keeps that a nuisance rather than a lockout.
export const LOGIN_FREE_ATTEMPTS = 5;
const LOGIN_BASE_BACKOFF_MS = 1_000;
const LOGIN_MAX_BACKOFF_MS = 15 * 60_000; // 15min
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

// Keyed by a random per-attempt id (not the userId) so a third party calling
// startLogin with the victim's email can't overwrite the victim's attempt.
function loginKey(attemptId: string) {
  return `login:${attemptId}`;
}

function recoveryKey(attemptId: string) {
  return `recovery:${attemptId}`;
}

// A hash: the challenge's fields plus an `attempts` counter.
function secondFactorKey(challengeId: string) {
  return `login2fa:${challengeId}`;
}

// The secret of a TOTP enrollment the user hasn't confirmed with a code yet.
function totpEnrollmentKey(userId: string) {
  return `totpenroll:${userId}`;
}

function passwordChangeKey(attemptId: string) {
  return `passwordchange:${attemptId}`;
}

// Unix ms before which every session of this user is invalid (see
// revokeUserSessions). No TTL: sliding sessions can outlive any fixed window.
function sessionEpochKey(userId: string) {
  return `sessionepoch:${userId}`;
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

function loginThrottleKey(emailHash: string) {
  return `loginthrottle:${emailHash}`;
}

function loginLockKey(emailHash: string) {
  return `loginlock:${emailHash}`;
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

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const rawSession = await redis.get(sessionKey(sessionId));
  if (rawSession === null) return undefined;

  const session: Session = JSON.parse(rawSession);
  const epoch = await redis.get(sessionEpochKey(session.userId));
  if (!isLive(session, epoch, Date.now())) {
    await deleteSession(sessionId, session.userId);
    return undefined;
  }

  return session;
}

export async function setSession(session: Session): Promise<string> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const index = userSessionsKey(session.userId);

  await redis
    .multi()
    .set(sessionKey(sessionId), JSON.stringify(session), "EX", sessionTtlSeconds(session, now))
    .zadd(index, now, sessionId)
    // Idle longer than the TTL: those sessions are gone.
    .zremrangebyscore(index, "-inf", now - SESSION_TTL_SECONDS * 1000)
    // No session in it can outlive the newest one's max age.
    .pexpire(index, SESSION_MAX_AGE_MS)
    .exec();

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
  await redis.multi().del(sessionKey(sessionId)).zrem(userSessionsKey(userId), sessionId).exec();
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
  await tx.zrem(userSessionsKey(userId), ...sessionIds).exec();
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
  const ids = await userSessionIds(userId);
  await redis.set(sessionEpochKey(userId), String(Date.now()));
  await signOutSessions(
    userId,
    ids.filter((id) => id !== exceptSessionId),
  );
  if (exceptSessionId) await deleteSession(exceptSessionId, userId);
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
}

/** Store a login attempt and return its id (handed to the client for finishLogin). */
export async function setLoginAttempt(loginAttempt: LoginAttempt): Promise<string> {
  const attemptId = crypto.randomUUID();
  await redis.set(
    loginKey(attemptId),
    JSON.stringify(loginAttempt),
    "EX",
    LOGIN_ATTEMPT_TTL_SECONDS,
  );
  return attemptId;
}

/** Atomically fetch and delete a login attempt — each attempt finishes at most once. */
export async function takeLoginAttempt(attemptId: string): Promise<LoginAttempt | undefined> {
  const rawLoginAttempt = await redis.getdel(loginKey(attemptId));
  if (rawLoginAttempt === null) return undefined;

  return JSON.parse(rawLoginAttempt);
}

/** Store a second-factor challenge and return its id (for verifySecondFactor). */
export async function setSecondFactorChallenge(challenge: SecondFactorChallenge): Promise<string> {
  const challengeId = crypto.randomUUID();
  const key = secondFactorKey(challengeId);
  await redis
    .multi()
    .hset(key, { ...challenge, deviceName: challenge.deviceName ?? "", attempts: 0 })
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

/** Store a recovery attempt and return its id (handed to the client for finishRecovery). */
export async function setRecoveryAttempt(attempt: RecoveryAttempt): Promise<string> {
  const attemptId = crypto.randomUUID();
  await redis.set(recoveryKey(attemptId), JSON.stringify(attempt), "EX", LOGIN_ATTEMPT_TTL_SECONDS);
  return attemptId;
}

/** Atomically fetch and delete a recovery attempt — each attempt finishes at most once. */
export async function takeRecoveryAttempt(attemptId: string): Promise<RecoveryAttempt | undefined> {
  const raw = await redis.getdel(recoveryKey(attemptId));
  if (raw === null) return undefined;

  return JSON.parse(raw);
}

/** Store a password change attempt and return its id (for finishPasswordChange). */
export async function setPasswordChangeAttempt(attempt: PasswordChangeAttempt): Promise<string> {
  const attemptId = crypto.randomUUID();
  await redis.set(
    passwordChangeKey(attemptId),
    JSON.stringify(attempt),
    "EX",
    LOGIN_ATTEMPT_TTL_SECONDS,
  );
  return attemptId;
}

/** Atomically fetch and delete a password change attempt — each finishes at most once. */
export async function takePasswordChangeAttempt(
  attemptId: string,
): Promise<PasswordChangeAttempt | undefined> {
  const raw = await redis.getdel(passwordChangeKey(attemptId));
  if (raw === null) return undefined;

  return JSON.parse(raw);
}

/** Remaining lock time in ms for this account, or 0 when a login may start. */
export async function getLoginLockMs(emailHash: string): Promise<number> {
  const ttl = await redis.pttl(loginLockKey(emailHash));
  return ttl > 0 ? ttl : 0;
}

/**
 * Count a login start. After LOGIN_FREE_ATTEMPTS starts without a successful
 * finish, lock the account with exponential back-off (1s, 2s, 4s, … capped).
 */
export async function recordLoginStart(emailHash: string): Promise<void> {
  const key = loginThrottleKey(emailHash);
  const [[, count]] = (await redis
    .multi()
    .incr(key)
    .expire(key, LOGIN_THROTTLE_WINDOW_SECONDS)
    .exec()) as [[Error | null, number], [Error | null, number]];

  const excess = count - LOGIN_FREE_ATTEMPTS;
  if (excess <= 0) return;

  const backoffMs = Math.min(LOGIN_BASE_BACKOFF_MS * 2 ** (excess - 1), LOGIN_MAX_BACKOFF_MS);
  await redis.set(loginLockKey(emailHash), "1", "PX", backoffMs);
}

export async function resetLoginThrottle(emailHash: string): Promise<void> {
  await redis.del(loginThrottleKey(emailHash), loginLockKey(emailHash));
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
