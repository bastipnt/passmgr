import type { AppRouter } from "@repo/types";
import type { TRPCClient } from "@trpc/client";

/** How long ending the session may take before the caller moves on. */
export const END_SERVER_SESSION_TIMEOUT_MS = 2_000;

/**
 * End the server session, best-effort: a network error, an already expired
 * session or a request slower than `timeoutMs` (aborted) must not block the
 * local action (the Redis session dies via its TTL). Call it before the keys
 * are wiped: the request is signed with the authKey.
 */
export async function endServerSession(
  trpc: Pick<TRPCClient<AppRouter>, "login">,
  timeoutMs = END_SERVER_SESSION_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.race([
      trpc.login.logout.mutate({}, { signal: controller.signal }),
      new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve())),
    ]);
  } catch {
    // Best-effort, see above.
  } finally {
    clearTimeout(timer);
  }
}
