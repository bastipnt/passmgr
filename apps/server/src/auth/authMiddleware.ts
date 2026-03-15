import { TRPCError } from "@trpc/server";
import { getSession } from "../util/redisUtils";
import { getMessage, verifyHmac } from "@repo/crypto";
import { fromBase64 } from "@repo/util";
import { loggedProcedure } from "../logger";

function checkTimestamp(timestamp: string): boolean {
  const now = Date.now();

  if (Math.abs(now - Number(timestamp)) > 5 * 60_000) return false;
  else return true;
}

// TODO: verify signature here?
export const protectedSubscriptionProcedure = loggedProcedure.use(async (opts) => {
  const { ctx } = opts;

  const sessionId = ctx.session?.sessionId;
  if (!sessionId) throw new TRPCError({ code: "UNAUTHORIZED" });

  const session = await getSession(sessionId);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

  return opts.next({ ctx: { userId: session.userId } });
});

export const protectedProcedure = loggedProcedure.use(async (opts) => {
  const { ctx, type, path, getRawInput } = opts;

  if (!ctx.session || !ctx.session.sessionId || !ctx.session.timestamp || !ctx.session.signature) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const { sessionId, timestamp, signature } = ctx.session;

  // Reject replayed requests (> 5min)
  if (!checkTimestamp(timestamp)) throw new TRPCError({ code: "UNAUTHORIZED" });

  const session = await getSession(sessionId);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

  const { rawAuthKey, userId } = session;

  // TODO: check input??
  const input = await getRawInput();

  const message = getMessage(type, path, timestamp, input as unknown as Record<string, string>);

  const valid = await verifyHmac(fromBase64(rawAuthKey), fromBase64(signature), message);
  if (!valid) throw new TRPCError({ code: "UNAUTHORIZED" });

  return opts.next({
    ctx: {
      userId,
    },
  });
});
