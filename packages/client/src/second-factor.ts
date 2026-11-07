/** The user closed the second-factor prompt: no session. */
export class SecondFactorCancelledError extends Error {
  override message = "SecondFactorCancelledError";
}

/**
 * The second-factor challenge is gone (expired, or too many wrong codes): the
 * login has to start over with the password.
 */
export class SecondFactorExpiredError extends Error {
  override message = "SecondFactorExpiredError";
}

/**
 * Asks the user for a second-factor code (TOTP or backup code) when the
 * account has two-factor on. `invalid`: the last code was wrong. Resolves the
 * code, or null when the user cancels. `cancelled`: the user cancelled after
 * handing over the code being checked, so the login stops without a session
 * whatever the server answers. `done` is called once the login is past the
 * code step (it passed, or failed for good): the prompt can close.
 */
export type SecondFactorPrompt = {
  (state: { invalid: boolean }): Promise<string | null>;
  cancelled?: () => boolean;
  done?: () => void;
};

/** For logins that can't ask (a brand-new account never has two-factor on). */
export const noSecondFactor: SecondFactorPrompt = async () => null;
