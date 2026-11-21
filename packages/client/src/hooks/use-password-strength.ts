import { strengthWorkerService } from "@repo/crypto/services/strength-worker-service";
import type { PasswordStrength } from "@repo/util";
import { useEffect, useState } from "react";
import { logError } from "../errors/log-error";

/**
 * Strength of a password; `null` while empty or before its first rating. Rated off the main
 * thread, so the last rating stays while the next runs (no flicker while typing). A component
 * showing different records' passwords should remount per record (`key`) to not show the
 * previous one's meanwhile. `userInputs` must keep its identity between renders (memoize it).
 */
export function usePasswordStrength(
  password: string | undefined,
  userInputs?: readonly string[],
): PasswordStrength | null {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);

  useEffect(() => {
    if (!password) return;
    let active = true;
    strengthWorkerService
      .rate(password, userInputs ? [...userInputs] : [])
      .then((rated) => active && setStrength(rated))
      .catch((error: unknown) => logError("Failed to rate the password strength", error));
    return () => {
      active = false;
    };
  }, [password, userInputs]);

  return password ? strength : null;
}
