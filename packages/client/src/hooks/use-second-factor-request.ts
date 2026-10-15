import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SecondFactorPrompt } from "../login";

/**
 * A login waiting for its second-factor code. `invalid`: the last code was
 * wrong. `verifying`: a code was handed over and the server is checking it.
 */
export type SecondFactorRequest = { invalid: boolean; verifying: boolean };

/**
 * The state behind a second-factor prompt UI: `prompt` (hand it to a login or
 * `SecondFactorPromptProvider`) sets `request` until the UI calls `cancel`, or
 * `submit`s a code and the login is past the code step (a wrong code asks
 * again, with the same `request` still showing meanwhile). A new prompt, or
 * unmounting, cancels the one before. A `cancel` while the code is being
 * verified still stops the login (`SecondFactorPrompt.cancelled`).
 */
export function useSecondFactorRequest() {
  const [request, setRequest] = useState<SecondFactorRequest | null>(null);
  const resolveRef = useRef<((code: string | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const answer = useCallback((code: string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(code);
  }, []);

  const prompt = useMemo<SecondFactorPrompt>(
    () =>
      Object.assign(
        (state: { invalid: boolean }) =>
          new Promise<string | null>((resolve) => {
            cancelledRef.current = false;
            resolveRef.current?.(null);
            resolveRef.current = resolve;
            setRequest({ invalid: state.invalid, verifying: false });
          }),
        { cancelled: () => cancelledRef.current, done: () => setRequest(null) },
      ),
    [],
  );

  useEffect(
    () => () => {
      cancelledRef.current = true;
      resolveRef.current?.(null);
    },
    [],
  );

  const submit = useCallback(
    (code: string) => {
      setRequest((current) => current && { ...current, verifying: true });
      answer(code);
    },
    [answer],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setRequest(null);
    answer(null);
  }, [answer]);

  return { request, prompt, submit, cancel };
}
