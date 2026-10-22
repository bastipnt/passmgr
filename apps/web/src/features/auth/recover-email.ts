import { useHistoryState } from "wouter/use-browser-location";

/** History state, not the URL: the email stays out of the address bar and browser history. */
export type RecoverState = { email: string };

/** The email typed on the login form before "Forgot password?". */
export function useRecoverEmail(): string {
  const state = useHistoryState<Partial<RecoverState> | null>();
  return typeof state?.email === "string" ? state.email : "";
}
