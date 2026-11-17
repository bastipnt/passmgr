import {
  genKey,
  passwordInForm,
  retrievePRK,
  setPasswordKekParams,
  unwrapAccountKey,
  wrapAccountKey,
} from "@repo/crypto";
import type { PasswordKeySchema } from "@repo/schema";
import { toBase64 } from "@repo/util";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { wrapGivenAccountKeyForPassword } from "../src/account/rekey-password-keys";
import { openWithPassword, unwrapAccountKeyWithPassword } from "../src/util/derive-password-kek";

const derive = vi.hoisted(() => vi.fn());
vi.mock("@repo/crypto/services/argon2-worker-service", async () => {
  const { retrievePRK } = await import("@repo/crypto");
  derive.mockImplementation(retrievePRK);
  return { argon2WorkerService: { derive } };
});

const FAST = { t: 1, m: 8, p: 1 };
// "é" as "e" + combining accent: what another keyboard may type for "é".
const DECOMPOSED = "caf\u{65}\u{301}";

beforeAll(() => setPasswordKekParams(FAST));

/** A wrap as made before NFKC: Argon2 over the password exactly as typed. */
async function legacyWrap(password: string, accountKey: Uint8Array): Promise<PasswordKeySchema> {
  const salt = genKey();
  const kek = await retrievePRK(password, salt, FAST);
  const [encryptedAccountKey, accountKeyEncryptionNonce] = wrapAccountKey(kek, accountKey);
  return {
    passwordKekParams: FAST,
    passwordKekSalt: toBase64(salt),
    encryptedAccountKey,
    accountKeyEncryptionNonce,
  };
}

describe("password forms", () => {
  it("makes a new wrap over the NFKC form: the composed password opens it", async () => {
    const accountKey = genKey();
    const wrap = await wrapGivenAccountKeyForPassword(DECOMPOSED, accountKey);
    expect(await unwrapAccountKeyWithPassword(passwordInForm(DECOMPOSED), wrap)).toEqual(
      accountKey,
    );
  });

  it("opens a wrap from before NFKC with the password as typed", async () => {
    const accountKey = genKey();
    const wrap = await legacyWrap(DECOMPOSED, accountKey);
    derive.mockClear();
    const { result, form } = await openWithPassword(DECOMPOSED, wrap, (kek) =>
      unwrapAccountKey(kek, wrap.encryptedAccountKey, wrap.accountKeyEncryptionNonce),
    );
    expect(result).toEqual(accountKey);
    expect(form).toBe("raw");
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it("derives once for a wrong ASCII password", async () => {
    const wrap = await legacyWrap("right", genKey());
    derive.mockClear();
    await expect(unwrapAccountKeyWithPassword("wrong", wrap)).rejects.toThrow();
    expect(derive).toHaveBeenCalledTimes(1);
  });
});
