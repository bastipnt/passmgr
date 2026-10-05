import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";

/**
 * End the server session, best-effort: a network error or an already expired
 * session must not block the local action (the Redis session dies via its
 * TTL). Call it before the keys are wiped: the request is signed with the authKey.
 */
export async function endServerSession(trpc: Pick<TRPCClient<AppRouter>, "login">) {
  try {
    await trpc.login.logout.mutate({});
  } catch {
    // Best-effort, see above.
  }
}
