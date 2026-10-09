import { describe, expect, it } from "vitest";
import {
  caretAfterDigits,
  detectCardBrand,
  formatCardExpiry,
  formatCardNumber,
  isLuhnValid,
  normalizeCardNumber,
} from "../src/records/card";

describe("detectCardBrand", () => {
  it.each([
    ["4111 1111 1111 1111", "visa"],
    ["5555555555554444", "mastercard"],
    ["2223003122003222", "mastercard"],
    ["378282246310005", "amex"],
    ["6011111111111117", "discover"],
    ["3530111333300000", "jcb"],
    ["30569309025904", "diners"],
    ["6200000000000005", "unionpay"],
    ["6759649826438453", "maestro"],
    ["9999", undefined],
    ["", undefined],
  ])("%s → %s", (number, brand) => {
    expect(detectCardBrand(number)).toBe(brand);
  });
});

describe("isLuhnValid", () => {
  it("accepts valid numbers, with or without spaces", () => {
    expect(isLuhnValid("4111 1111 1111 1111")).toBe(true);
    expect(isLuhnValid("378282246310005")).toBe(true);
  });

  it("rejects a typo and too-short numbers", () => {
    expect(isLuhnValid("4111 1111 1111 1112")).toBe(false);
    expect(isLuhnValid("0")).toBe(false);
  });
});

describe("formatCardNumber", () => {
  it("groups by the network's pattern", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
    expect(formatCardNumber("30569309025904")).toBe("3056 930902 5904");
    expect(formatCardNumber("41111")).toBe("4111 1");
    expect(formatCardNumber("6759649826438453123")).toBe("6759 6498 2643 8453 123");
  });
});

describe("formatCardExpiry", () => {
  it.each([
    ["1", "", "1"],
    ["4", "", "04/"],
    ["12", "1", "12/"],
    ["1229", "12/2", "12/29"],
    ["12/", "12/2", "12/"],
    ["12", "12/", "1"],
  ])("%s (was %s) → %s", (input, previous, expected) => {
    expect(formatCardExpiry(input, previous)).toBe(expected);
  });
});

describe("normalizeCardNumber", () => {
  it("stores a card number as digits", () => {
    expect(normalizeCardNumber(" 4111 1111-1111 1111 ")).toBe("4111111111111111");
  });

  it("keeps text that isn't a card number as written", () => {
    expect(normalizeCardNumber("see note")).toBe("see note");
    expect(normalizeCardNumber("•••• 4242")).toBe("•••• 4242");
    expect(formatCardNumber("•••• 4242")).toBe("•••• 4242");
  });

  it("drops a blank number", () => {
    expect(normalizeCardNumber("  ")).toBeUndefined();
    expect(normalizeCardNumber(undefined)).toBeUndefined();
  });
});

describe("caretAfterDigits", () => {
  it("puts the caret after the same number of digits", () => {
    expect(caretAfterDigits("4111 1111 1111", 4)).toBe(4);
    expect(caretAfterDigits("4111 1111 1111", 5)).toBe(6);
    expect(caretAfterDigits("4111 1", 0)).toBe(0);
    expect(caretAfterDigits("4111 1", 9)).toBe(6);
  });
});
