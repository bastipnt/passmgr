import { server } from "../server";

type Session = {
  userId: string;
  rawAuthKey: string;
  createdAt: string;
  expiresAt: string;
};

type LoginAttempt = {
  userId: string;
  serverLoginState: string;
  createdAt: string;
  expiresAt: string;
};

export function sessionKey(sessionId: string) {
  return `session:${sessionId}`;
}

export function loginKey(userId: string) {
  return `login:${userId}`;
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  const rawSession = await server.redis.get(sessionKey(sessionId));
  if (rawSession === null) return undefined;

  return JSON.parse(rawSession);
}

export async function setSession(
  partialSession: Omit<Session, "createdAt" | "expiresAt">,
): Promise<string> {
  const sessionId = crypto.randomUUID();

  const session: Session = {
    ...partialSession,
    createdAt: Date.now().toString(),
    expiresAt: Date.now().toString(), // TODO: + 1 day??
  };

  const sessionString = JSON.stringify(session);
  await server.redis.set(sessionKey(sessionId), sessionString);

  return sessionId;
}

export async function getLoginAttempt(userId: string): Promise<LoginAttempt | undefined> {
  const rawLoginAttempt = await server.redis.get(loginKey(userId));
  if (rawLoginAttempt === null) return undefined;

  return JSON.parse(rawLoginAttempt);
}

export async function setLoginAttempt(
  partialLoginAttempt: Omit<LoginAttempt, "createdAt" | "expiresAt">,
) {
  const loginAttempt: LoginAttempt = {
    ...partialLoginAttempt,
    createdAt: Date.now().toString(),
    expiresAt: Date.now().toString(), // TODO: + 1 day??
  };

  const loginAttemptString = JSON.stringify(loginAttempt);
  await server.redis.set(loginKey(partialLoginAttempt.userId), loginAttemptString);
}

export async function delLoginAttempt(userId: string) {
  await server.redis.del(loginKey(userId));
}
