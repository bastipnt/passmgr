import z from "zod";

/**
 * One of the user's server sessions (a signed-in device). `id` is a public
 * handle derived from the session id, never the session id itself.
 */
export const sessionInfoSchema = z.object({
  id: z.string(),
  deviceName: z.string().nullable(),
  // Unix ms of the login that created it, and of its last signed request.
  createdAt: z.number(),
  lastSeenAt: z.number(),
  // The session making this request.
  current: z.boolean(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const listSessionsOutputSchema = z.array(sessionInfoSchema);

export const revokeSessionInputSchema = z.object({ id: z.string().min(1).max(64) });

/** Same as `logoutInputSchema`: clients send `{}` (a POST needs a body). */
export const revokeOtherSessionsInputSchema = z.object({}).strict().optional();
