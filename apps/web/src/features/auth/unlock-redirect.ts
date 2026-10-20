import { createContext, useContext, useEffect } from "react";

/** Set by `AuthRoutes`: while held, an unlocked vault stays on the auth page. */
export const HoldUnlockRedirectContext = createContext<(held: boolean) => void>(() => {});

/**
 * Keep the page on screen after the vault unlocks, e.g. to link it to an
 * account and show its recovery key first. Released on unmount.
 */
export function useHoldUnlockRedirect() {
  const setHeld = useContext(HoldUnlockRedirectContext);
  useEffect(() => () => setHeld(false), [setHeld]);
  return setHeld;
}
