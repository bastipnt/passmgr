import { createHash, randomBytes } from "node:crypto";
import { redis } from "../redis";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60; // 5min — matches OPAQUE replay window
const NONCE_TTL_SECONDS = 6 * 60; // 6min — slightly outlives the ±5min timestamp window
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
  // Unix ms of the OPAQUE login that created this session (fresh-auth checks).
  authenticatedAt: number;
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
};

function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

// Keyed by a random per-attempt id (not the userId) so a third party calling
// startLogin with the victim's email can't overwrite the victim's attempt.
function loginKey(attemptId: string) {
  return `login:${attemptId}`;
}

function loginThrottleKey(emailHash: string) {
  return `loginthrottle:${emailHash}`;
}

function loginLockKey(emailHash: string) {
  return `loginlock:${emailHash}`;
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const rawSession = await redis.get(sessionKey(sessionId));
  if (rawSession === null) return undefined;

  return JSON.parse(rawSession);
}

export async function setSession(session: Session): Promise<string> {
  const sessionId = crypto.randomUUID();

  await redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);

  return sessionId;
}

/**
 * Sliding-expiration refresh: roll the session's 24h TTL forward on activity so
 * an active user (mobile session restored on each reopen) stays logged in,
 * while an idle session still expires after 24h. Best-effort.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await redis.expire(sessionKey(sessionId), SESSION_TTL_SECONDS);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
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
