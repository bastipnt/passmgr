import { describe, expect, it } from "vitest";
import {
  EFF_WORDLIST_SIZE,
  estimateEntropy,
  estimateEntropyFromString,
  estimatePassphraseEntropy,
  generatePassphrase,
  generatePassword,
  getCharsetSize,
  getStrength,
  getStrengthFromString,
  PasswordGeneratorError,
  type PasswordOptions,
} from "../src/password-generator";

const baseOpts: PasswordOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
  minDigits: 0,
  minSymbols: 0,
};

describe("generatePassword", () => {
  it("returns exactly the requested length", () => {
    const pwd = generatePassword({ ...baseOpts, length: 24 });
    expect(pwd.length).toBe(24);
  });

  it("floors a fractional length", () => {
    const pwd = generatePassword({ ...baseOpts, length: 12.9 });
    expect(pwd.length).toBe(12);
  });

  it("treats length<=0 as length 1 (minimum)", () => {
    const pwd = generatePassword({ ...baseOpts, length: 0 });
    expect(pwd.length).toBe(1);
  });

  it("uses only the enabled charsets (lowercase only)", () => {
    const pwd = generatePassword({
      ...baseOpts,
      length: 64,
      uppercase: false,
      digits: false,
      symbols: false,
    });
    expect(/^[a-z]+$/.test(pwd)).toBe(true);
  });

  it("uses only the enabled charsets (digits only)", () => {
    const pwd = generatePassword({
      ...baseOpts,
      length: 32,
      uppercase: false,
      lowercase: false,
      symbols: false,
    });
    expect(/^[0-9]+$/.test(pwd)).toBe(true);
  });

  it("strips ambiguous chars when avoidAmbiguous is set", () => {
    const pwd = generatePassword({ ...baseOpts, length: 1024, avoidAmbiguous: true });
    expect(/[O0Il1]/.test(pwd)).toBe(false);
  });

  it("includes ambiguous chars when avoidAmbiguous is false (probabilistic)", () => {
    // Across a long sample the ambiguous set should appear at least once.
    const pwd = generatePassword({ ...baseOpts, length: 4096 });
    expect(/[O0Il1]/.test(pwd)).toBe(true);
  });

  it("honors minDigits", () => {
    const pwd = generatePassword({ ...baseOpts, length: 16, minDigits: 8 });
    const digits = pwd.match(/[0-9]/g)?.length ?? 0;
    expect(digits).toBeGreaterThanOrEqual(8);
  });

  it("honors minSymbols", () => {
    const pwd = generatePassword({ ...baseOpts, length: 16, minSymbols: 6 });
    const symbols = pwd.match(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/g)?.length ?? 0;
    expect(symbols).toBeGreaterThanOrEqual(6);
  });

  it("throws when no charset is enabled", () => {
    expect(() =>
      generatePassword({
        ...baseOpts,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow(PasswordGeneratorError);
  });

  it("throws when minDigits + minSymbols exceed length", () => {
    expect(() => generatePassword({ ...baseOpts, length: 4, minDigits: 3, minSymbols: 3 })).toThrow(
      PasswordGeneratorError,
    );
  });
});

describe("getCharsetSize", () => {
  it("sums all enabled charsets", () => {
    expect(getCharsetSize(baseOpts)).toBe(26 + 26 + 10 + 26); // upper+lower+digits+symbols(26)
  });

  it("subtracts ambiguous characters when avoidAmbiguous is true", () => {
    // ambiguous in upper: {O,I} (2), lower: {l} (1), digits: {0,1} (2). Symbols unaffected.
    expect(getCharsetSize({ ...baseOpts, avoidAmbiguous: true })).toBe(24 + 25 + 8 + 26);
  });

  it("returns 0 when nothing is enabled", () => {
    expect(
      getCharsetSize({
        ...baseOpts,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      }),
    ).toBe(0);
  });
});

describe("entropy helpers", () => {
  it("estimateEntropy: length * log2(charsetSize)", () => {
    expect(estimateEntropy(16, 64)).toBeCloseTo(96, 10);
    expect(estimateEntropy(20, 26)).toBeCloseTo(20 * Math.log2(26), 10);
  });

  it("estimateEntropy: returns 0 for trivial inputs", () => {
    expect(estimateEntropy(0, 64)).toBe(0);
    expect(estimateEntropy(16, 1)).toBe(0);
    expect(estimateEntropy(16, 0)).toBe(0);
    expect(estimateEntropy(-1, 64)).toBe(0);
  });

  it("estimatePassphraseEntropy: wordCount * log2(wordlistSize)", () => {
    expect(estimatePassphraseEntropy(6, EFF_WORDLIST_SIZE)).toBeCloseTo(
      6 * Math.log2(EFF_WORDLIST_SIZE),
      10,
    );
  });

  it("estimatePassphraseEntropy: returns 0 for trivial inputs", () => {
    expect(estimatePassphraseEntropy(0, 7776)).toBe(0);
    expect(estimatePassphraseEntropy(6, 1)).toBe(0);
  });

  it("estimateEntropyFromString: empty string -> 0", () => {
    expect(estimateEntropyFromString("")).toBe(0);
  });

  it("estimateEntropyFromString: detects each charset class", () => {
    expect(estimateEntropyFromString("aaaa")).toBeCloseTo(4 * Math.log2(26), 10);
    expect(estimateEntropyFromString("aaaaAAAA")).toBeCloseTo(8 * Math.log2(52), 10);
    expect(estimateEntropyFromString("aaaa1111")).toBeCloseTo(8 * Math.log2(36), 10);
    expect(estimateEntropyFromString("aA1!")).toBeCloseTo(4 * Math.log2(94), 10);
  });
});

describe("strength tiers", () => {
  it("classifies entropy ranges", () => {
    expect(getStrength(20).level).toBe("weak");
    expect(getStrength(39.9).level).toBe("weak");
    expect(getStrength(40).level).toBe("fair");
    expect(getStrength(59.9).level).toBe("fair");
    expect(getStrength(60).level).toBe("strong");
    expect(getStrength(79.9).level).toBe("strong");
    expect(getStrength(80).level).toBe("very-strong");
    expect(getStrength(200).level).toBe("very-strong");
  });

  it("returns bits in the result", () => {
    expect(getStrength(72).bits).toBe(72);
  });

  it("getStrengthFromString aligns with estimateEntropyFromString", () => {
    const s = getStrengthFromString("aA1!aA1!aA1!aA1!");
    expect(s.bits).toBeCloseTo(estimateEntropyFromString("aA1!aA1!aA1!aA1!"), 10);
  });
});

describe("generatePassphrase", () => {
  it("returns the requested word count joined by the separator", async () => {
    const phrase = await generatePassphrase({
      wordCount: 6,
      separator: "-",
      capitalize: false,
      includeNumber: false,
    });
    expect(phrase.split("-").length).toBe(6);
  });

  it("floors a fractional wordCount", async () => {
    const phrase = await generatePassphrase({
      wordCount: 4.9,
      separator: " ",
      capitalize: false,
      includeNumber: false,
    });
    expect(phrase.split(" ").length).toBe(4);
  });

  it("treats wordCount<=0 as 1", async () => {
    const phrase = await generatePassphrase({
      wordCount: 0,
      separator: "-",
      capitalize: false,
      includeNumber: false,
    });
    expect(phrase.split("-").length).toBe(1);
  });

  it("uses only words from the EFF large wordlist", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    const set = new Set(wordlist);
    const phrase = await generatePassphrase({
      wordCount: 8,
      separator: "-",
      capitalize: false,
      includeNumber: false,
    });
    for (const w of phrase.split("-")) {
      expect(set.has(w)).toBe(true);
    }
  });

  it("capitalizes every word when capitalize is true", async () => {
    const phrase = await generatePassphrase({
      wordCount: 5,
      separator: "-",
      capitalize: true,
      includeNumber: false,
    });
    for (const w of phrase.split("-")) {
      expect(w.charAt(0)).toBe(w.charAt(0).toUpperCase());
    }
  });

  it("appends a digit to exactly one word when includeNumber is true", async () => {
    const phrase = await generatePassphrase({
      wordCount: 6,
      separator: "-",
      capitalize: false,
      includeNumber: true,
    });
    const wordsWithDigit = phrase.split("-").filter((w) => /[0-9]$/.test(w));
    expect(wordsWithDigit.length).toBe(1);
  });
});

describe("EFF_WORDLIST_SIZE", () => {
  it("matches the actual wordlist length", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    expect(wordlist.length).toBe(EFF_WORDLIST_SIZE);
    expect(EFF_WORDLIST_SIZE).toBe(7776);
  });

  it("contains only unique words", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    expect(new Set(wordlist).size).toBe(wordlist.length);
  });
});
