import { PASSWORD_STRENGTH_LABEL, type PasswordStrength } from "@repo/util";
import type { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { loadZxcvbnModules } from "./zxcvbn-modules";

const LEVEL_BY_SCORE = ["weak", "weak", "fair", "strong", "very-strong"] as const;

let estimator: ZxcvbnFactory | null = null;
let loading: Promise<void> | null = null;

/** Loads zxcvbn and its dictionaries on first call, so they stay out of the main bundle. */
export function loadPasswordStrength(): Promise<void> {
  loading ??= loadZxcvbnModules()
    .then(([core, common, en]) => {
      estimator = new core.ZxcvbnFactory({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
        useLevenshteinDistance: true,
        // Matching is superlinear in length and runs on every keystroke; 32 characters already rate
        // anything but a repeated pattern as very strong.
        maxLength: 32,
      });
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function isPasswordStrengthLoaded(): boolean {
  return estimator !== null;
}

/**
 * Guess-based strength of a password (typed or generated); `null` until `loadPasswordStrength` resolved.
 * `userInputs` (email, site name …) and their parts (`lin`, `park` of `lin.park@…`) count as known words.
 */
export function getStrengthFromString(
  password: string,
  userInputs: string[] = [],
): PasswordStrength | null {
  if (!estimator) return null;
  const words = userInputs.flatMap((input) => [input, ...input.split(/[\s.@_+-]+/)]);
  const result = estimator.check(
    password,
    words.filter((word) => word.length > 1),
  );
  const level = LEVEL_BY_SCORE[result.score];
  return {
    level,
    label: PASSWORD_STRENGTH_LABEL[level],
    warning: result.feedback.warning ?? undefined,
  };
}
