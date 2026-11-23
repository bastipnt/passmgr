import { genKey, setPasswordKekParams } from "@repo/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { wrapGivenAccountKeyForPassword } from "../src/account/rekey-password-keys";
import { unwrapAccountKeyWithPassword } from "../src/util/derive-password-kek";

// "é" as one code point and as "e" + combining accent.
const COMPOSED = "caf\u{e9}";
const DECOMPOSED = "caf\u{65}\u{301}";

beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));

describe("password wraps", () => {
  it("open with the password typed composed or decomposed", async () => {
    const accountKey = genKey();
    const wrap = await wrapGivenAccountKeyForPassword(DECOMPOSED, accountKey);
    expect(await unwrapAccountKeyWithPassword(COMPOSED, wrap)).toEqual(accountKey);
    expect(await unwrapAccountKeyWithPassword(DECOMPOSED, wrap)).toEqual(accountKey);
  });

  it("don't open with a wrong password", async () => {
    const wrap = await wrapGivenAccountKeyForPassword("right", genKey());
    await expect(unwrapAccountKeyWithPassword("wrong", wrap)).rejects.toThrow();
  });
});
