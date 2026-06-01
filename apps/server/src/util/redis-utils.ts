import { redis } from "../redis";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60; // 5min — matches OPAQUE replay window
const NONCE_TTL_SECONDS = 6 * 60; // 6min — slightly outlives the ±5min timestamp window

type Session = {
  userId: string;
  rawAuthKey: string;
};

type LoginAttempt = {
  userId: string;
  // Base64-encoded ExpectedAuthResult from @cloudflare/opaque-ts authInit.
  // Threaded from startLogin to finishLogin (5min TTL = OPAQUE replay window).
  expected: string;
};

function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

function loginKey(userId: string) {
  return `login:${userId}`;
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

export async function getLoginAttempt(userId: string): Promise<LoginAttempt | undefined> {
  const rawLoginAttempt = await redis.get(loginKey(userId));
  if (rawLoginAttempt === null) return undefined;

  return JSON.parse(rawLoginAttempt);
}

export async function setLoginAttempt(loginAttempt: LoginAttempt) {
  await redis.set(
    loginKey(loginAttempt.userId),
    JSON.stringify(loginAttempt),
    "EX",
    LOGIN_ATTEMPT_TTL_SECONDS,
  );
}

export async function delLoginAttempt(userId: string) {
  await redis.del(loginKey(userId));
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
