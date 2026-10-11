import { createHash } from "node:crypto";
import {
  listSessionsOutputSchema,
  revokeOtherSessionsInputSchema,
  revokeSessionInputSchema,
} from "@repo/schema";
import { TRPCError } from "@trpc/server";
import { shortHash } from "../logger";
import { router } from "../trpc";
import {
  listUserSessions,
  revokeOtherUserSessions,
  revokeUserSession,
  userSessionIds,
} from "../util/redis-utils";
import { protectedProcedure } from "./auth-middleware";

/**
 * The handle a session is listed and revoked by. The session id is half of a
 * request's credentials, so it never leaves the server for another device.
 */
function publicSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("base64url").slice(0, 22);
}

/**
 * The user's signed-in devices (server sessions): list them, end one, or end
 * all but this one. A revoked device is refused with SESSION_SIGNED_OUT and
 * its record stream ends with `signedOut`: it locks like a sign-out.
 */
export const sessionRouter = router({
  list: protectedProcedure.output(listSessionsOutputSchema).query(async ({ ctx }) => {
    const sessions = await listUserSessions(ctx.userId);
    return sessions.map((s) => ({
      id: publicSessionId(s.sessionId),
      deviceName: s.deviceName ?? null,
      createdAt: s.authenticatedAt,
      lastSeenAt: s.lastSeenAt,
      current: s.sessionId === ctx.sessionId,
    }));
  }),

  revoke: protectedProcedure.input(revokeSessionInputSchema).mutation(async ({ ctx, input }) => {
    const ids = await userSessionIds(ctx.userId);
    const target = ids.find((id) => publicSessionId(id) === input.id);
    if (!target || !(await revokeUserSession(ctx.userId, target))) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    ctx.req?.log?.info({ sidHash: await shortHash(target) }, "auth.session.revoked");
    return { ok: true } as const;
  }),

  revokeOthers: protectedProcedure
    .input(revokeOtherSessionsInputSchema)
    .mutation(async ({ ctx }) => {
      const revoked = await revokeOtherUserSessions(ctx.userId, ctx.sessionId);
      ctx.req?.log?.info({ revoked }, "auth.session.revoked_others");
      return { revoked };
    }),
});
