import { safeLocalStorage } from "@repo/ui/lib/safe-local-storage";
import { useSyncExternalStore } from "react";

export const DEMO_OVERRIDE_KEY = "passmgr:demo-override";

const listeners = new Set<() => void>();

export function isDemoBuild(): boolean {
  return import.meta.env.VITE_DEMO_MODE === "true";
}

function readOverride(): boolean {
  return safeLocalStorage.get(DEMO_OVERRIDE_KEY) !== null;
}

/** A demo build, unless this browser turned it off (`toggleDemoOverride`). */
export function isDemoMode(): boolean {
  return isDemoBuild() && !readOverride();
}

/**
 * Turn demo mode off on this browser, or back on. Not a security boundary: it
 * only shows the normal create / log in / import screens again. A demo
 * profile stays a demo profile either way. Resolves whether demo mode is now on.
 */
export function toggleDemoOverride(): boolean {
  if (readOverride()) safeLocalStorage.remove(DEMO_OVERRIDE_KEY);
  else safeLocalStorage.set(DEMO_OVERRIDE_KEY, "1");
  for (const listener of listeners) listener();
  return isDemoMode();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(subscribe, isDemoMode);
}
