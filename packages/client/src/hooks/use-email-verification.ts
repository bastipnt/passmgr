import type { EmailVerificationStatus } from "@repo/schema";
import { EMAIL_CODE_EXPIRED, EMAIL_CODE_INVALID } from "@repo/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useContext, useEffect, useState } from "react";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import { isServerAnswer, isThrottled } from "../util/trpc-errors";
import { useAppConfig } from "./use-app-config";
import { useSyncStatus } from "./use-sync-status";

const EMAIL_VERIFICATION_KEY = "account-email-verification";

/**
 * - `wrong_code`: the code doesn't match, try again
 * - `expired`: the code ran out, was replaced or took too many wrong tries
 * - `throttled`: a code was sent less than a minute ago, or too many this hour
 * - `offline`: no server session
 * - `failed`: the server couldn't be reached or refused
 */
export type EmailVerificationError = "wrong_code" | "expired" | "throttled" | "offline" | "failed";

/** User-facing text for each email verification error (web + mobile). */
export const EMAIL_VERIFICATION_ERROR_MESSAGES: Record<EmailVerificationError, string> = {
  wrong_code: "That code doesn't match. Check the email and try again.",
  expired: "That code is no longer valid. Send a new one.",
  throttled: "A code was sent a moment ago. Wait a minute, then ask for another.",
  offline: "Verifying your email needs a connection to the server. Try again once you're online.",
  failed: "That didn't work. Try again.",
};

/**
 * Verifying the account's email, on a server that sends codes (`linked` +
 * `online` only). Until it is verified the server neither syncs nor shares
 * (`SyncStatus.paused`). Registration mailed the first code; `resend` mails
 * another, `verify(code)` checks it and syncs right away. Verified elsewhere
 * (another device), the next status check resumes syncing here too.
 */
export function useEmailVerification() {
  const { emailVerification } = useAppConfig();
  const { mode, networkOffline } = useContext(SessionContext);
  const { profile, syncManager } = useStore();
  const { paused } = useSyncStatus();
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();
  const [error, setError] = useState<EmailVerificationError>();
  const [pending, setPending] = useState<"verify" | "resend">();

  const online = mode === "online" && profile?.mode === "linked";
  const queryKey = [EMAIL_VERIFICATION_KEY, profile?.userId];
  const { data } = useQuery({
    queryKey,
    enabled: online && emailVerification,
    queryFn: async (): Promise<EmailVerificationStatus> =>
      await trpc.user.emailVerificationStatus.query(),
  });
  const verified = data?.verified;

  useEffect(() => {
    if (verified && paused) void syncManager?.sync();
  }, [verified, paused, syncManager]);

  async function run(kind: "verify" | "resend", action: () => Promise<unknown>): Promise<boolean> {
    setError(undefined);
    if (!online || networkOffline) {
      setError("offline");
      return false;
    }
    setPending(kind);
    try {
      await action();
      return true;
    } catch (e) {
      setError(toError(e));
      return false;
    } finally {
      setPending(undefined);
    }
  }

  /** Check a code from the email; resolves whether the email is verified now. */
  const verify = (code: string): Promise<boolean> =>
    run("verify", async () => {
      await trpc.user.verifyEmail.mutate({ code });
      queryClient.setQueryData<EmailVerificationStatus>(queryKey, { verified: true });
      void syncManager?.sync();
    });

  /** Mail a new code, replacing the last one; resolves whether it was sent. */
  const resend = (): Promise<boolean> =>
    run("resend", () => trpc.user.sendVerificationCode.mutate({}));

  const clearError = useCallback(() => setError(undefined), []);

  return {
    /** The account's email still needs verifying. */
    required: emailVerification && online && (verified === undefined ? paused : !verified),
    verified: emailVerification && online ? verified : undefined,
    email: profile?.mode === "linked" ? profile.email : undefined,
    verify,
    resend,
    error,
    clearError,
    pending,
  };
}

function toError(e: unknown): EmailVerificationError {
  if (isThrottled(e)) return "throttled";
  if (e instanceof TRPCClientError && isServerAnswer(e)) {
    if (e.message === EMAIL_CODE_INVALID) return "wrong_code";
    if (e.message === EMAIL_CODE_EXPIRED) return "expired";
  }
  console.error("Email verification failed", e);
  return "failed";
}
