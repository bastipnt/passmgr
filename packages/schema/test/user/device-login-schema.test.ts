import { describe, expect, it } from "vitest";
import { COSE_ALG, SUPPORTED_COSE_ALGS } from "../../src/user/device-login-schema";

describe("COSE algorithms", () => {
  it("are the IANA ids of ES256, EdDSA and RS256", () => {
    expect(COSE_ALG).toEqual({ ES256: -7, EdDSA: -8, RS256: -257 });
  });

  it("lists every named algorithm once, ES256 first", () => {
    expect(SUPPORTED_COSE_ALGS).toEqual([-7, -8, -257]);
  });
});
