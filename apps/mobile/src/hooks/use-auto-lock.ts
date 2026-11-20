import { AUTO_LOCK_PREFERENCE, useChoicePreference, useLock } from "@repo/client";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Locks (never signs out) after `minutes` away, `0` = off: "Auto-lock", apps/mobile/CLAUDE.md. */
export function useAutoLock() {
  const [minutes] = useChoicePreference(AUTO_LOCK_PREFERENCE);
  const lock = useLock();

  const lockRef = useRef(lock);
  lockRef.current = lock;

  useEffect(() => {
    if (minutes <= 0) return;

    const timeoutMs = minutes * 60_000;
    let leftAt: number | null = null;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        // "inactive" (iOS app switcher, a call) precedes "background": keep the first timestamp,
        // so a peek at the switcher does not reset the clock.
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
