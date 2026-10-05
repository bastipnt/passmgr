import { AUTO_LOCK_DEFAULT_MINUTES, PREF_KEYS, useLock, usePreference } from "@repo/client";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Locks the vault when the app comes back after `minutes` in the background.
 * `0` disables it.
 *
 * The web counterpart (`apps/web/src/hooks/use-idle-lock.ts`) watches input
 * events, because a browser tab stays interactive while it sits untouched. A
 * phone does not: the OS suspends timers the moment the app leaves the
 * foreground, so how long it was away is both the measurable signal and the one
 * that matters.
 *
 * This is a lock, not a sign-out — the vault and the persisted login stay on the device.
 */
export function useAutoLock() {
  const [minutes] = usePreference<number>(PREF_KEYS.autoLockMinutes, AUTO_LOCK_DEFAULT_MINUTES);
  const lock = useLock();

  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (minutes <= 0) return;

    const timeoutMs = minutes * 60_000;
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        // "inactive" (the iOS app switcher, an incoming call) precedes
        // "background" — keep the first timestamp so a quick peek at the
        // switcher does not reset the clock.
        leftAt ??= Date.now();
        return;
      }

      const awayFor = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;
      if (awayFor < timeoutMs) return;

      lockRef.current();
    });

    return () => subscription.remove();
  }, [minutes]);
}
