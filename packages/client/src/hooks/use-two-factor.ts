import type { TwoFactorStatus } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useContext, useState } from "react";
import { freshLogin, WrongPasswordError } from "../account/change-password";
import {
  LoginThrottledError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import { isServerAnswer, isThrottled } from "../util/trpc-errors";

const TWO_FACTOR_KEY = "account-two-factor";

/**
 * - `wrong_password`: the master password is wrong
 * - `offline`: no server session; two-factor lives on the server
 * - `throttled`: too many login attempts, retry later
 * - `second_factor`: the sign-in's two-factor step didn't finish (closed, or
 *   timed out after too many wrong codes)
 * - `wrong_code`: the code from the authenticator app doesn't match
 * - `expired`: the setup took too long; start it again
 * - `failed`: the server couldn't be reached or refused
 */
export type TwoFactorError =
  | "wrong_password"
  | "offline"
  | "throttled"
  | "second_factor"
  | "wrong_code"
  | "expired"
  | "failed";

/** User-facing text for each two-factor error (web + mobile). */
export const TWO_FACTOR_ERROR_MESSAGES: Record<TwoFactorError, string> = {
  wrong_password: "That's not your password.",
  offline: "Two-factor settings need a connection to the server. Try again once you're online.",
  throttled: "Too many attempts. Please wait and try again.",
  second_factor: "The two-factor step of the sign-in didn't finish. Try again.",
  wrong_code: "That code doesn't match. Check the time on your device and try the current code.",
  expired: "The setup took too long. Start it again.",
  failed: "That didn't work. Nothing was changed.",
};

/** A started enrollment: what the authenticator app needs. */
export type TotpEnrollment = { uri: string; secret: string };

class TwoFactorFailedError extends Error {
  override message = "TwoFactorFailedError";
}

/**
 * Two-factor (TOTP + backup codes) for the account's server login, opt-in
 * (`linked` + `online` only). Every change starts with a fresh login with the
 * master password (`freshAuthProcedure`); with two-factor on, that login asks
 * for a code too (`onSecondFactor`, default: the app's `SecondFactorPromptProvider`).
 *
 * Turning it on: `startEnrollment(password)` → show the URI / secret →
 * `confirm(code)` → show the backup codes, once.
 */
export function useTwoFactor(onSecondFactor?: SecondFactorPrompt) {
  const { mode, networkOffline, attachServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  const contextPrompt = useSecondFactorPrompt();
  const prompt = onSecondFactor ?? contextPrompt;
  const queryClient = useQueryClient();
  const [error, setError] = useState<TwoFactorError>();
  const [pending, setPending] = useState(false);
  const online = mode === "online";
  const blocked = !online || networkOffline;

  const { data: status, isPending: statusPending } = useQuery({
    queryKey: [TWO_FACTOR_KEY],
    enabled: online,
    queryFn: async (): Promise<TwoFactorStatus> => await trpc.user.twoFactorStatus.query(),
  });

  /** Run `action` after a fresh login; resolves its result, or undefined with `error` set. */
  async function run<T>(password: string | null, action: () => Promise<T>): Promise<T | undefined> {
    setError(undefined);
    setPending(true);
    try {
      const profile = store.current()?.profile;
      if (profile?.mode !== "linked" || !secretsStore.isVaultUnlocked) {
        setError("failed");
        return undefined;
      }
      if (blocked || !secretsStore.hasServerSession) {
        setError("offline");
        return undefined;
      }
      if (password !== null)
        await freshLogin(trpc, attachServer, profile, password, TwoFactorFailedError, prompt);
      return await action();
    } catch (e) {
      setError(toError(e));
      return undefined;
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({ queryKey: [TWO_FACTOR_KEY] });
    }
  }

  /** Turning it on, step 1: a new secret for the authenticator app. */
  const startEnrollment = (password: string): Promise<TotpEnrollment | undefined> =>
    run(password, () => trpc.user.startTotpEnrollment.mutate({}));

  /** Step 2: the app's current code; resolves the backup codes (show them once). */
  const confirm = async (code: string): Promise<string[] | undefined> =>
    (await run(null, () => trpc.user.confirmTotp.mutate({ code })))?.backupCodes;

  /** Back to password-only. Resolves whether it worked. */
  const disable = async (password: string): Promise<boolean> =>
    (await run(password, () => trpc.user.disableTotp.mutate({}))) !== undefined;

  /** New backup codes in place of the old ones (show them once). */
  const regenerateBackupCodes = async (password: string): Promise<string[] | undefined> =>
    (await run(password, () => trpc.user.regenerateBackupCodes.mutate({})))?.backupCodes;

  const clearError = useCallback(() => setError(undefined), []);

  return {
    status: online ? status : undefined,
    statusPending: online && statusPending,
    startEnrollment,
    confirm,
    disable,
    regenerateBackupCodes,
    error,
    clearError,
    pending,
    blocked,
  };
}

function toError(e: unknown): TwoFactorError {
  if (e instanceof WrongPasswordError) return "wrong_password";
  if (e instanceof LoginThrottledError || isThrottled(e)) return "throttled";
  if (e instanceof SecondFactorCancelledError || e instanceof SecondFactorExpiredError)
    return "second_factor";
  if (e instanceof TRPCClientError && isServerAnswer(e)) {
    // confirmTotp: a wrong code, or the pending secret (or the fresh login) ran out.
    if (e.data?.code === "BAD_REQUEST") return "wrong_code";
    if (e.data?.code === "NOT_FOUND" || e.data?.code === "FORBIDDEN") return "expired";
  }
  if (!(e instanceof TwoFactorFailedError)) console.error("Two-factor change failed", e);
  return "failed";
}
