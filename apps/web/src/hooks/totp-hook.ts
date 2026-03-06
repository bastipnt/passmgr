import { getToken } from "@repo/crypto";
import { isDefined } from "@repo/util";
import { useEffect, useRef, useState } from "react";

const TOTP_PERIOD_MS = 30 * 1_000;

export function useTotp(totpSecret?: string) {
  const [seconds, setSeconds] = useState<number>();
  const [progress, setProgress] = useState<number>();
  const [token, setToken] = useState<string>();

  const totpSecretRef = useRef(totpSecret);
  const periodRef = useRef<number>(null);

  async function fetchToken(secret: string) {
    try {
      setToken(await getToken(secret));
    } catch {
      setToken("invalid TOTP secret");
    }
  }

  useEffect(() => {
    totpSecretRef.current = totpSecret;
    if (isDefined(totpSecret)) {
      void fetchToken(totpSecret);
    }
  }, [totpSecret]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const msRemaining = TOTP_PERIOD_MS - (now % TOTP_PERIOD_MS);

      setSeconds(Math.ceil(msRemaining / 1_000));
      setProgress((msRemaining / TOTP_PERIOD_MS) * 100);

      const period = Math.floor(now / TOTP_PERIOD_MS);
      if (period !== periodRef.current && isDefined(totpSecretRef.current)) {
        periodRef.current = period;
        void fetchToken(totpSecretRef.current);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return { seconds, progress, token };
}
