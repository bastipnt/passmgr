import { getRemainingTime, getToken } from "@repo/crypto";
import { isDefined } from "@repo/util";
import { useEffect, useRef, useState } from "react";

export function useTotp(totpSecret?: string) {
  const [seconds, setSeconds] = useState<number>();
  const [progress, setProgress] = useState<number>();
  const [token, setToken] = useState<string>();

  const totpSecretRef = useRef(totpSecret);

  function updateSeconds() {
    setSeconds(getRemainingTime());
  }

  function updateProgress() {
    const currentTimeRounded = Math.floor(Date.now() / 100) * 100;
    const delta = currentTimeRounded % (30 * 1_000);
    setProgress(delta);
    void updateToken(delta);
  }

  async function updateToken(ms: number) {
    if (!isDefined(totpSecretRef.current)) return;
    if (ms !== 0) return;
    let newToken = "-";

    try {
      newToken = await getToken(totpSecretRef.current);
    } catch (error) {
      // TODO: handle token error
    } finally {
      setToken(newToken);
    }
  }

  useEffect(() => {
    totpSecretRef.current = totpSecret;
    void updateToken(0);
  }, [totpSecret]);

  useEffect(() => {
    const intervalSeconds = setInterval(updateSeconds, 1_000);
    const intervalProgress = setInterval(updateProgress, 100);

    return () => {
      if (intervalSeconds) clearInterval(intervalSeconds);
      if (intervalProgress) clearInterval(intervalProgress);
    };
  }, []);

  return { seconds, progress, token };
}
