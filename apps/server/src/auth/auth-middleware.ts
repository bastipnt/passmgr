import {
  getMessage,
  SESSION_SIGNED_OUT,
  SUBSCRIPTION_SIGNATURE_PATH,
  verifyHmac,
} from "@repo/crypto";
import { fromBase64 } from "@repo/util";
import { TRPCError } from "@trpc/server";
import type { Context } from "../context";
import { loggedProcedure, shortHash } from "../logger";
import { claimNonce, getSession, isSignedOut, touchSession } from "../util/redis-utils";

// Key changes need an OPAQUE login this recent; a restored or stolen
// long-lived session can't rewrite key material.
export const FRESH_AUTH_WINDOW_MS = 5 * 60_000;

function checkTimestamp(timestamp: string): boolean {
  const now = Date.now();

  if (Math.abs(now - Number(timestamp)) > 5 * 60_000) return false;
  else return true;
}

type AuthFailReason =
  | "session_not_found"
  | "session_signed_out"
  | "missing_auth_headers"
  | "stale_timestamp"
  | "invalid_signature"
  | "replay_detected"
  | "stale_auth";

type AuthLog = { warn: (obj: object, msg: string) => void } | undefined;

async function denyAuth(
  log: AuthLog,
  path: string,
  reason: AuthFailReason,
  sessionId?: string,
  code: "UNAUTHORIZED" | "FORBIDDEN" = "UNAUTHORIZED",
  message?: string,
): Promise<never> {
  const sidHash = sessionId ? await shortHash(sessionId) : undefined;
  log?.warn({ reason, path, sidHash }, "auth.unauthorized");
  throw new TRPCError({ code, message });
}

/**
 * Verify session id + timestamp + one-time nonce + HMAC over
 * `(type, signedPath, timestamp, nonce, input)`. Throws UNAUTHORIZED on any
 * failure; returns the session on success.
 */
async function verifySignedRequest(opts: {
  ctx: Context;
  path: string;
  type: string;
  signedPath: string;
  input: unknown;
}) {
  const { ctx, path, type, signedPath, input } = opts;
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
  if (!session) {
    // Signed out from elsewhere: say so, the client locks instead of going offline.
    if (await isSignedOut(sessionId)) {
      return denyAuth(
        log,
        path,
        "session_signed_out",
        sessionId,
        "UNAUTHORIZED",
        SESSION_SIGNED_OUT,
      );
    }
    return denyAuth(log, path, "session_not_found", sessionId);
  }

  // The raw input is covered by the HMAC; zod validates its shape in the procedure.
  const message = getMessage(
    type,
    signedPath,
    timestamp,
    nonce,
    input as unknown as Record<string, string>,
  );

  const valid = await verifyHmac(fromBase64(session.rawAuthKey), fromBase64(signature), message);
  if (!valid) return denyAuth(log, path, "invalid_signature", sessionId);

  // Atomic claim — fails if the nonce was already accepted within the active
  // window, which means this is a replay of a previously-valid request.
  const claimed = await claimNonce(nonce);
  if (!claimed) return denyAuth(log, path, "replay_detected", sessionId);

  return { sessionId, session };
}

/**
 * SSE subscriptions sign their `connectionParams` (see
 * SUBSCRIPTION_SIGNATURE_PATH for why path and input aren't covered).
 * Deliberately does not extend the session TTL: a long-lived stream — or a
 * leaked connection URL — must not keep a session alive on its own.
 */
export const protectedSubscriptionProcedure = loggedProcedure.use(async (opts) => {
  const { sessionId, session } = await verifySignedRequest({
    ctx: opts.ctx,
    path: opts.path,
    type: opts.type,
    signedPath: SUBSCRIPTION_SIGNATURE_PATH,
    input: {},
  });

  return opts.next({ ctx: { userId: session.userId, sessionId } });
});

export const protectedProcedure = loggedProcedure.use(async (opts) => {
  const { ctx, type, path, getRawInput } = opts;

  const { sessionId, session } = await verifySignedRequest({
    ctx,
    path,
    type,
    signedPath: path,
    input: await getRawInput(),
  });

  // Sliding expiration: any authenticated activity rolls the 24h TTL forward.
  void touchSession(sessionId, session);

  return opts.next({
    ctx: {
      userId: session.userId,
      sessionId,
      authenticatedAt: session.authenticatedAt,
      secondFactor: session.secondFactor === true,
      passwordless: session.passwordless === true,
    },
  });
});

/**
 * For key-material changes: requires an OPAQUE login within
 * FRESH_AUTH_WINDOW_MS. A device login never counts: it proves the device, not
 * the password.
 */
export const freshAuthProcedure = protectedProcedure.use(async (opts) => {
  const { ctx, path } = opts;
  const { authenticatedAt, passwordless } = ctx;

  // Sessions created before `authenticatedAt` existed have none → stale.
  if (passwordless || !authenticatedAt || Date.now() - authenticatedAt > FRESH_AUTH_WINDOW_MS) {
    return denyAuth(ctx.req?.log, path, "stale_auth", ctx.sessionId, "FORBIDDEN");
  }

  return opts.next();
});
