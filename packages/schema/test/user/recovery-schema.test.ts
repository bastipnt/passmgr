import { describe, expect, it } from "vitest";
import type z from "zod";
import {
  finishRecoveryInputSchema,
  pendingRecoverySchema,
  recoverFormSchema,
  sealedPendingRecoverySchema,
  startRecoveryInputSchema,
  startRecoveryOutputSchema,
} from "../../src/user/recovery-schema";
import { nonCanonicalBase64 } from "../../testing/non-canonical";

function b64(bytes: number): string {
  return Buffer.from(new Uint8Array(bytes)).toString("base64");
}

const OPAQUE_MESSAGE = b64(98);

const ATTEMPT_ID = "3f1c2b4e-8a6d-4c1e-9b7a-2d5e6f708192";

const VALID_USER_KEYS = {
  recoveryKekSalt: b64(32),
  encryptedAccountKeyRecovery: b64(48),
  accountKeyEncryptionNonceRecovery: b64(24),
  recoveryVerifier: b64(32),
  passwordKekParams: { t: 3, m: 128 * 1024, p: 1 },
  passwordKekSalt: b64(32),
  encryptedAccountKey: b64(48),
  accountKeyEncryptionNonce: b64(24),
};

describe("startRecoveryInputSchema", () => {
  const valid = { email: "a@b.co", recoveryAuthKey: b64(32), registrationRequest: OPAQUE_MESSAGE };

  it("accepts a valid input and normalizes the email", () => {
    const parsed = startRecoveryInputSchema.parse({ ...valid, email: " A@B.co " });
    expect(parsed.email).toBe("a@b.co");
  });

  it("rejects an auth key of the wrong length", () => {
    expect(() => startRecoveryInputSchema.parse({ ...valid, recoveryAuthKey: b64(16) })).toThrow();
  });
});

describe("startRecoveryOutputSchema", () => {
  it("requires the wrap but not the verifier", () => {
    const recoveryKeys = {
      recoveryKekSalt: b64(32),
      encryptedAccountKeyRecovery: b64(48),
      accountKeyEncryptionNonceRecovery: b64(24),
    };
    const valid = { attemptId: ATTEMPT_ID, registrationResponse: "x", recoveryKeys };
    expect(() => startRecoveryOutputSchema.parse(valid)).not.toThrow();
    const { recoveryKekSalt: _, ...incomplete } = recoveryKeys;
    expect(() => startRecoveryOutputSchema.parse({ ...valid, recoveryKeys: incomplete })).toThrow();
  });
});

describe("finishRecoveryInputSchema", () => {
  const valid = {
    email: "a@b.co",
    attemptId: ATTEMPT_ID,
    registrationRecord: OPAQUE_MESSAGE,
    userKeys: VALID_USER_KEYS,
  };

  it("accepts a valid input", () => {
    expect(() => finishRecoveryInputSchema.parse(valid)).not.toThrow();
  });

  it("requires a recovery verifier in the new key set", () => {
    const { recoveryVerifier: _, ...userKeys } = VALID_USER_KEYS;
    expect(() => finishRecoveryInputSchema.parse({ ...valid, userKeys })).toThrow();
  });

  it("rejects a non-uuid attempt id", () => {
    expect(() => finishRecoveryInputSchema.parse({ ...valid, attemptId: "nope" })).toThrow();
  });
});

// Byte counts whose padded spelling leaves unused low bits in the last digit.
const BASE64_FIELDS: [string, string, z.ZodObject, number][] = [
  ["startRecoveryInputSchema", "recoveryAuthKey", startRecoveryInputSchema, 32],
  ["pendingRecoverySchema", "recoveryAuthKey", pendingRecoverySchema, 32],
  ["sealedPendingRecoverySchema", "ciphertext", sealedPendingRecoverySchema, 100],
  ["sealedPendingRecoverySchema", "nonce", sealedPendingRecoverySchema, 23],
];

describe("canonical base64 fields", () => {
  it.each(BASE64_FIELDS)(
    "%s.%s takes only the canonical spelling",
    (_name, field, schema, bytes) => {
      const canonical = b64(bytes);
      const fieldSchema = schema.shape[field] as z.ZodType;
      expect(fieldSchema.parse(canonical)).toBe(canonical);
      expect(fieldSchema.safeParse(nonCanonicalBase64(canonical)).success).toBe(false);
      expect(fieldSchema.safeParse(canonical.replace(/=+$/, "")).success).toBe(false);
    },
  );

  it("keeps the 44-character bound of the recovery auth key", () => {
    expect(pendingRecoverySchema.shape.recoveryAuthKey.safeParse(b64(30)).success).toBe(false);
  });

  it("keeps the 32-character bound of the sealed nonce", () => {
    expect(sealedPendingRecoverySchema.shape.nonce.safeParse(b64(24)).success).toBe(true);
    expect(sealedPendingRecoverySchema.shape.nonce.safeParse(b64(27)).success).toBe(false);
  });
});

describe("recoverFormSchema", () => {
  const valid = {
    email: "a@b.co",
    recoveryKey: "  AQIDBAU=  ",
    password: "a new password",
    confirmPassword: "a new password",
  };

  it("accepts a valid form and trims the recovery key", () => {
    expect(recoverFormSchema.parse(valid).recoveryKey).toBe("AQIDBAU=");
  });

  it("requires a recovery key", () => {
    expect(() => recoverFormSchema.parse({ ...valid, recoveryKey: "   " })).toThrow();
  });

  it("rejects mismatched passwords on confirmPassword", () => {
    const result = recoverFormSchema.safeParse({ ...valid, confirmPassword: "other" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("enforces the minimum password length", () => {
    expect(() =>
      recoverFormSchema.parse({ ...valid, password: "short", confirmPassword: "short" }),
    ).toThrow();
  });
});
