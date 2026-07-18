import { getToken } from "@repo/crypto";
import { isDefined } from "@repo/util";
import { useCallback, useEffect, useRef, useState } from "react";

export const TOTP_PERIOD_MS = 30 * 1_000;
const TICK_MS = 1_000;

const currentPeriod = () => Math.floor(Date.now() / TOTP_PERIOD_MS);

/** "123456" → "123 456"; anything else (undefined, error text) passes through. */
export const formatTotpToken = (token?: string) =>
  token && /^\d{6}$/.test(token) ? `${token.slice(0, 3)} ${token.slice(3)}` : token;

/**
 * Current TOTP token plus countdown state. `seconds` ticks once per second for
 * text display; `period` only changes at the 30s rollover so a countdown ring
 * can run one smooth animation per period instead of stepping every tick.
 *
 * Timers are throttled or paused while the page/app is backgrounded. On web
 * the hook re-syncs itself via `visibilitychange`; React Native has no
 * `document`, so call the returned `resync` from an AppState listener when
 * the app becomes active again.
 */
export function useTotp(totpSecret?: string) {
  const [token, setToken] = useState<string>();
  const [isInvalid, setIsInvalid] = useState(false);
  const [seconds, setSeconds] = useState<number>();
  const [period, setPeriod] = useState<number>(currentPeriod);
  const tickRef = useRef<() => void>(null);

  useEffect(() => {
    if (!isDefined(totpSecret)) {
      setToken(undefined);
      setSeconds(undefined);
      return;
    }

    let cancelled = false;

    async function fetchToken(secret: string) {
      try {
        const next = await getToken(secret);
        if (!cancelled) {
          setIsInvalid(false);
          setToken(next);
        }
      } catch {
        if (!cancelled) {
          setIsInvalid(true);
          setToken("invalid TOTP secret");
        }
      }
    }

    let lastPeriod = currentPeriod();

    function tick() {
      const nextPeriod = currentPeriod();
      if (nextPeriod !== lastPeriod) {
        lastPeriod = nextPeriod;
        void fetchToken(totpSecret!);
      }
      const nextSeconds = Math.ceil((TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS)) / 1_000);
      setPeriod(nextPeriod);
      setSeconds((prev) => (prev === nextSeconds ? prev : nextSeconds));
    }

    tickRef.current = tick;
    void fetchToken(totpSecret);
    tick();
    const interval = setInterval(tick, TICK_MS);

    const canObserveVisibility = typeof document !== "undefined";
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    if (canObserveVisibility) document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (canObserveVisibility)
        document.removeEventListener("visibilitychange", onVisibilityChange);
      tickRef.current = null;
    };
  }, [totpSecret]);

  /** Force a tick outside the interval, e.g. when the app returns to foreground. */
  const resync = useCallback(() => tickRef.current?.(), []);

  return { token, isInvalid, seconds, period, resync };
}
