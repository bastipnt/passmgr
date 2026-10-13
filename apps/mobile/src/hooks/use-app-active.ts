import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Whether the app is in the foreground. Gates the record sync stream — the OS
 * suspends sockets and timers while backgrounded, so the subscription is torn
 * down and re-established (with an immediate sync) on return — and re-reads the
 * OS autofill setting, which the user changes outside the app.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return active;
}
