import { strengthWorkerService } from "@repo/crypto/services/strength-worker-service";
import type { PasswordStrength } from "@repo/util";
import { useEffect, useState } from "react";

/**
 * Strength of a password; `null` while empty or before its first rating. Rated off the main
 * thread, so the last rating stays while the next runs (no flicker while typing). A component
 * showing different records' passwords should remount per record (`key`) to not show the
 * previous one's meanwhile.
 */
export function usePasswordStrength(
  password: string | undefined,
  userInputs?: string[],
): PasswordStrength | null {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  // Callers pass a fresh array every render: compare the inputs by content.
  const inputsKey = userInputs?.filter(Boolean).join("\n") ?? "";

  useEffect(() => {
    if (!password) return;
    let active = true;
    strengthWorkerService
      .rate(password, inputsKey ? inputsKey.split("\n") : [])
      .then((rated) => active && setStrength(rated))
      .catch((error: unknown) => console.error("Failed to rate the password strength", error));
    return () => {
      active = false;
    };
  }, [password, inputsKey]);

  return password ? strength : null;
}
