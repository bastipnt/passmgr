import {
  getStrengthFromString,
  isPasswordStrengthLoaded,
  loadPasswordStrength,
} from "@repo/crypto";
import type { PasswordStrength } from "@repo/util";
import { useEffect, useMemo, useState } from "react";

/** Strength of a user-entered password; `null` while empty or while the estimator loads. */
export function usePasswordStrength(
  password: string | undefined,
  userInputs?: string[],
): PasswordStrength | null {
  const [loaded, setLoaded] = useState(isPasswordStrengthLoaded);
  const hasPassword = !!password;

  useEffect(() => {
    if (loaded || !hasPassword) return;
    let active = true;
    loadPasswordStrength()
      .then(() => active && setLoaded(true))
      .catch((error: unknown) =>
        console.error("Failed to load the password strength estimator", error),
      );
    return () => {
      active = false;
    };
  }, [loaded, hasPassword]);

  // Callers pass a fresh array every render: compare the inputs by content.
  const inputsKey = userInputs?.filter(Boolean).join("\n") ?? "";
  return useMemo(
    () =>
      loaded && password
        ? getStrengthFromString(password, inputsKey ? inputsKey.split("\n") : [])
        : null,
    [loaded, password, inputsKey],
  );
}
