import { describe, expect, it } from "vitest";
import {
  generatePassphrase,
  generatePassword,
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

describe("generatePassphrase", () => {
  it("returns the requested word count joined by the separator", async () => {
    const phrase = await generatePassphrase({
      wordCount: 6,
      separator: "_",
      capitalize: false,
      includeNumber: false,
    });
    expect(phrase.split("_").length).toBe(6);
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
      separator: "_",
      capitalize: false,
      includeNumber: false,
    });
    expect(phrase.split("_").length).toBe(1);
  });

  it("uses only words from the EFF large wordlist", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    const set = new Set(wordlist);
    const phrase = await generatePassphrase({
      wordCount: 8,
      separator: "_",
      capitalize: false,
      includeNumber: false,
    });
    for (const w of phrase.split("_")) {
      expect(set.has(w)).toBe(true);
    }
  });

  it("capitalizes every word when capitalize is true", async () => {
    const phrase = await generatePassphrase({
      wordCount: 5,
      separator: "_",
      capitalize: true,
      includeNumber: false,
    });
    for (const w of phrase.split("_")) {
      expect(w.charAt(0)).toBe(w.charAt(0).toUpperCase());
    }
  });

  it("appends a digit to exactly one word when includeNumber is true", async () => {
    const phrase = await generatePassphrase({
      wordCount: 6,
      separator: "_",
      capitalize: false,
      includeNumber: true,
    });
    const wordsWithDigit = phrase.split("_").filter((w) => /[0-9]$/.test(w));
    expect(wordsWithDigit.length).toBe(1);
  });
});

describe("EFF wordlist", () => {
  it("matches the actual wordlist length", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    expect(wordlist.length).toBe(7776);
  });

  it("contains only unique words", async () => {
    const { wordlist } = await import("../src/wordlist-eff-large");
    expect(new Set(wordlist).size).toBe(wordlist.length);
  });
});
