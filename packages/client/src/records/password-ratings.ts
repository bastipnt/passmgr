import type { PasswordStrength } from "@repo/util";

// Ratings only, never a password: a version's rating can't change, so a revisit skips zxcvbn.
// Per open profile database; `RecordsProvider` drops them on lock.
const ratingsByVault = new WeakMap<object, Map<string, PasswordStrength | null>>();

export function passwordRatingsOf(vault: object) {
  let ratings = ratingsByVault.get(vault);
  if (!ratings) ratingsByVault.set(vault, (ratings = new Map()));
  return ratings;
}

export function forgetPasswordRatings(vault: object) {
  ratingsByVault.delete(vault);
}
