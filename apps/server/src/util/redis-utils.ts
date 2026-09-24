import { createHash, randomBytes } from "node:crypto";
import { redis } from "../redis";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60; // 5min — matches OPAQUE replay window
const NONCE_TTL_SECONDS = 6 * 60; // 6min — slightly outlives the ±5min timestamp window
export const INVITE_TTL_SECONDS = 60 * 60 * 24; // 24h

type Session = {
  userId: string;
  rawAuthKey: string;
};

type Invite = {
  // When set, the invite can only register this exact email.
  email?: string;
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

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
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
