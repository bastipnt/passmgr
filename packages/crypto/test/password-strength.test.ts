import { beforeAll, describe, expect, it } from "vitest";
import {
  getStrengthFromString,
  isPasswordStrengthLoaded,
  loadPasswordStrength,
} from "../src/password-strength";

describe("getStrengthFromString", () => {
  it("is null until the estimator is loaded", () => {
    expect(isPasswordStrengthLoaded()).toBe(false);
    expect(getStrengthFromString("correct horse battery staple")).toBeNull();
  });

  // zxcvbn with Levenshtein matching is CPU-bound: ~0.3s per check alone, but several times that
  // while the Argon2 tests (hash.test.ts) saturate the cores in parallel.
  describe("loaded", { timeout: 30_000 }, () => {
    beforeAll(() => loadPasswordStrength());

    it("rates common passwords and their l33t or suffixed variants as weak", () => {
      for (const password of ["Password1!", "P@ssw0rd123", "qwerty123", "Tr0ub4dor&3"]) {
        expect(getStrengthFromString(password)?.level, password).toBe("weak");
      }
    });

    it("explains why a password is weak", () => {
      expect(getStrengthFromString("password")?.warning).toBeTruthy();
    });

    it("rates a long random password as very strong", () => {
      const strength = getStrengthFromString("v9#Tq2!mZr@8LxKp4&Wn");
      expect(strength?.level).toBe("very-strong");
      expect(strength?.label).toBe("Very strong");
    });

    it("penalises a password built from the user's own inputs", () => {
      const password = "Quorvenkade88";
      expect(getStrengthFromString(password)?.level).toBe("very-strong");
      expect(getStrengthFromString(password, ["quorvenkade@example.com"])?.level).toBe("weak");
    });
  });
});
