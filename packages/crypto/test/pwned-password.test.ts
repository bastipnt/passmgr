import { describe, expect, it } from "vitest";
import { pwnedPasswordHash } from "../src/pwned-password";

describe("pwnedPasswordHash", () => {
  it("splits the uppercase SHA-1 into a 5-character prefix and the rest", () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    expect(pwnedPasswordHash("password")).toEqual({
      prefix: "5BAA6",
      suffix: "1E4C9B93F3F0682250B6CF8331B7EE68FD8",
    });
  });

  it("hashes the UTF-8 bytes", () => {
    expect(pwnedPasswordHash("pässwörd")).toEqual({
      prefix: "F517D",
      suffix: "DF1D32A112FF1AD55C66D1B12CB38E7E8F7",
    });
  });
});
