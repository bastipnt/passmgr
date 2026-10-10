import { TRPCClientError } from "@trpc/client";

/** The server rejected the session (expired, revoked or unknown). */
export function isUnauthorized(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "UNAUTHORIZED" || err.data?.httpStatus === 401)
  );
}

/** The server can't take the request right now (e.g. a vault is locked); try again later. */
export function isRetryLater(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "SERVICE_UNAVAILABLE" || err.data?.httpStatus === 503)
  );
}

/** The server failed on its side (a 5xx), whatever the request held. */
export function isServerError(err: unknown): boolean {
  if (!(err instanceof TRPCClientError)) return false;
  const status = err.data?.httpStatus;
  return typeof status === "number" ? status >= 500 : err.data?.code === "INTERNAL_SERVER_ERROR";
}

/** The resource changed meanwhile (CONFLICT), e.g. another device got there first. */
export function isConflict(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "CONFLICT" || err.data?.httpStatus === 409)
  );
}

/** The server refused the call in the resource's current state (PRECONDITION_FAILED). */
export function isPreconditionFailed(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "PRECONDITION_FAILED" || err.data?.httpStatus === 412)
  );
}

/** Server rejected the call with TOO_MANY_REQUESTS (per-account or per-IP limit). */
export function isThrottled(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "TOO_MANY_REQUESTS" || err.data?.httpStatus === 429)
  );
}

/**
 * The server answered with an error about this one request (a tRPC error
 * response), as opposed to the request not getting through at all (offline,
 * network failure, a locked session that couldn't sign it).
 */
export function isServerAnswer(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data !== undefined && err.data !== null;
}
