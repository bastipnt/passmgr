import { getToken } from "@repo/crypto";
import { isDefined } from "@repo/util";
import { useEffect, useState } from "react";

const TOTP_PERIOD_MS = 30 * 1_000;
const TICK_MS = 1_000;

export function useTotp(totpSecret?: string) {
  const [seconds, setSeconds] = useState<number>();
  const [progress, setProgress] = useState<number>();
  const [token, setToken] = useState<string>();

  useEffect(() => {
    if (!isDefined(totpSecret)) {
      setSeconds(undefined);
      setProgress(undefined);
      setToken(undefined);
      return;
    }

    let cancelled = false;

    async function fetchToken(secret: string) {
      try {
        const next = await getToken(secret);
        if (!cancelled) setToken(next);
      } catch {
        if (!cancelled) setToken("invalid TOTP secret");
      }
    }

    function updateVisuals() {
      const now = Date.now();
      const msRemaining = TOTP_PERIOD_MS - (now % TOTP_PERIOD_MS);
      const nextSeconds = Math.ceil(msRemaining / 1_000);
      const nextProgress = (msRemaining / TOTP_PERIOD_MS) * 100;
      setSeconds((prev) => (prev === nextSeconds ? prev : nextSeconds));
      setProgress(nextProgress);
    }

    let lastPeriod = Math.floor(Date.now() / TOTP_PERIOD_MS);
    void fetchToken(totpSecret);
    updateVisuals();

    const interval = setInterval(() => {
      const period = Math.floor(Date.now() / TOTP_PERIOD_MS);
      if (period !== lastPeriod) {
        lastPeriod = period;
        void fetchToken(totpSecret);
      }
      updateVisuals();
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [totpSecret]);

  return { seconds, progress, token };
}
