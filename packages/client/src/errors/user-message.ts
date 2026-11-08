import { TRPCClientError } from "@trpc/client";
import { isConflict, isServerAnswer, isThrottled, isUnauthorized } from "../util/trpc-errors";

export type ErrorKind =
  | "unauthorized"
  | "offline"
  | "rate-limit"
  | "quota"
  | "conflict"
  | "unknown";

const MESSAGES: Record<ErrorKind, string> = {
  unauthorized: "Your session has expired. Unlock your vault again to continue.",
  offline: "The server can't be reached. Check your connection and try again.",
  "rate-limit": "Too many attempts. Wait a moment and try again.",
  quota: "Your storage is full. Delete some items to free up space.",
  conflict: "This item changed on another device. Reload it and try again.",
  unknown: "Something went wrong. Try again.",
};

const FETCH_FAILURES = ["Failed to fetch", "Load failed", "Network request failed", "NetworkError"];

function isFetchFailure(err: unknown): boolean {
  return (
    err instanceof TypeError && FETCH_FAILURES.some((failure) => err.message.includes(failure))
  );
}

function isQuotaExceeded(err: unknown): boolean {
  return (
    err instanceof TRPCClientError &&
    (err.data?.code === "PAYLOAD_TOO_LARGE" || err.data?.httpStatus === 413)
  );
}

export function errorKind(err: unknown): ErrorKind {
  if (isUnauthorized(err)) return "unauthorized";
  if (isThrottled(err)) return "rate-limit";
  if (isQuotaExceeded(err)) return "quota";
  if (isConflict(err)) return "conflict";
  if (isFetchFailure(err) || (err instanceof TRPCClientError && !isServerAnswer(err))) {
    return "offline";
  }
  return "unknown";
}

/**
 * Text that is safe to show: picked by the kind of error, never taken from it.
 * Server and exception messages can carry input values (decrypted secrets).
 */
export function userMessage(err: unknown): string {
  return MESSAGES[errorKind(err)];
}
