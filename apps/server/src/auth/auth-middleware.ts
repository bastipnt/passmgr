import { TRPCError } from "@trpc/server";
import { claimNonce, getSession, touchSession } from "../util/redis-utils";
import { getMessage, verifyHmac } from "@repo/crypto";
import { fromBase64 } from "@repo/util";
import { loggedProcedure, shortHash } from "../logger";

function checkTimestamp(timestamp: string): boolean {
  const now = Date.now();

  if (Math.abs(now - Number(timestamp)) > 5 * 60_000) return false;
  else return true;
}

type AuthFailReason =
  | "missing_session_id"
  | "session_not_found"
  | "missing_auth_headers"
  | "stale_timestamp"
  | "invalid_signature"
  | "replay_detected";

async function denyAuth(
  log: { warn: (obj: object, msg: string) => void } | undefined,
  path: string,
  reason: AuthFailReason,
  sessionId?: string,
): Promise<never> {
  const sidHash = sessionId ? await shortHash(sessionId) : undefined;
  log?.warn({ reason, path, sidHash }, "auth.unauthorized");
  throw new TRPCError({ code: "UNAUTHORIZED" });
}

// TODO: verify signature here?
export const protectedSubscriptionProcedure = loggedProcedure.use(async (opts) => {
  const { ctx, path } = opts;
  const log = ctx.req?.log;

  const sessionId = ctx.session?.sessionId;
  if (!sessionId) return denyAuth(log, path, "missing_session_id");

  const session = await getSession(sessionId);
  if (!session) return denyAuth(log, path, "session_not_found", sessionId);

  void touchSession(sessionId);

  return opts.next({ ctx: { userId: session.userId } });
});

export const protectedProcedure = loggedProcedure.use(async (opts) => {
  const { ctx, type, path, getRawInput } = opts;
  const log = ctx.req?.log;

  if (
    !ctx.session ||
    !ctx.session.sessionId ||
    !ctx.session.timestamp ||
    !ctx.session.signature ||
    !ctx.session.nonce
  ) {
    return denyAuth(log, path, "missing_auth_headers", ctx.session?.sessionId);
  }

  const { sessionId, timestamp, signature, nonce } = ctx.session;

  // Reject replayed requests (> 5min)
  if (!checkTimestamp(timestamp)) return denyAuth(log, path, "stale_timestamp", sessionId);

  const session = await getSession(sessionId);
  if (!session) return denyAuth(log, path, "session_not_found", sessionId);

  const { rawAuthKey, userId } = session;

  // TODO: check input??
  const input = await getRawInput();

  const message = getMessage(
    type,
    path,
    timestamp,
    nonce,
    input as unknown as Record<string, string>,
  );

  const valid = await verifyHmac(fromBase64(rawAuthKey), fromBase64(signature), message);
  if (!valid) return denyAuth(log, path, "invalid_signature", sessionId);

  // Atomic claim — fails iff the nonce was already accepted within the active
  // window, which means this is a replay of a previously-valid request.
  const claimed = await claimNonce(nonce);
  if (!claimed) return denyAuth(log, path, "replay_detected", sessionId);

  // Sliding expiration: any authenticated activity rolls the 24h TTL forward.
  void touchSession(sessionId);

  return opts.next({
    ctx: {
      userId,
    },
  });
});
