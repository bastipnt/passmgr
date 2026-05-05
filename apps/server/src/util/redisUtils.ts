import { server } from "../server";

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60; // 5min — matches OPAQUE replay window

type Session = {
  userId: string;
  rawAuthKey: string;
};

type LoginAttempt = {
  userId: string;
  serverLoginState: string;
};

function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

function loginKey(userId: string) {
  return `login:${userId}`;
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const rawSession = await server.redis.get(sessionKey(sessionId));
  if (rawSession === null) return undefined;

  return JSON.parse(rawSession);
}

export async function setSession(session: Session): Promise<string> {
  const sessionId = crypto.randomUUID();

  await server.redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);

  return sessionId;
}

export async function getLoginAttempt(userId: string): Promise<LoginAttempt | undefined> {
  const rawLoginAttempt = await server.redis.get(loginKey(userId));
  if (rawLoginAttempt === null) return undefined;

  return JSON.parse(rawLoginAttempt);
}

export async function setLoginAttempt(loginAttempt: LoginAttempt) {
  await server.redis.set(
    loginKey(loginAttempt.userId),
    JSON.stringify(loginAttempt),
    "EX",
    LOGIN_ATTEMPT_TTL_SECONDS,
  );
}

export async function delLoginAttempt(userId: string) {
  await server.redis.del(loginKey(userId));
}
