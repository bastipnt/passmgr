/** Payment card networks recognised from a card number's leading digits (IIN). */
export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "diners"
  | "jcb"
  | "unionpay"
  | "maestro";

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  maestro: "Maestro",
};

/** The digits of a card number, without the spaces or dashes it was typed with. */
export function cardDigits(number: string | undefined): string {
  return number?.replace(/\D/g, "") ?? "";
}

/**
 * Whether the text is a card number in any grouping: digits, spaces and
 * dashes only. Anything else ("see note", a masked "•••• 4242" from an
 * import) is someone's own text, kept and shown exactly as written.
 */
export function isCardNumberLike(text: string | undefined): boolean {
  return /^[\d\s-]*$/.test(text ?? "");
}

/**
 * The card number as stored: its digits, or, when it isn't a plain card
 * number (`isCardNumberLike`), the text as written. `undefined` when blank.
 */
export function normalizeCardNumber(number: string | undefined): string | undefined {
  const trimmed = number?.trim();
  if (!trimmed) return undefined;
  return isCardNumberLike(trimmed) ? cardDigits(trimmed) : trimmed;
}

/**
 * Where the caret goes in `formatted` so that it sits after the same number
 * of digits as before reformatting (keeps the caret in place while typing in
 * the middle of a number).
 */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) seen++;
    if (seen === digitCount) return i + 1;
  }
  return formatted.length;
}

function prefixIn(digits: string, length: number, from: number, to: number): boolean {
  if (digits.length < length) return false;
  const prefix = Number(digits.slice(0, length));
  return prefix >= from && prefix <= to;
}

/**
 * The card network, from the IIN ranges the networks publish. Only a hint for
 * display: a number matching no range is still saved as typed. Order matters
 * where ranges nest (Discover's 6011 / 65 before Maestro's other 6xxx).
 */
export function detectCardBrand(number: string | undefined): CardBrand | undefined {
  const digits = cardDigits(number);
  if (digits.startsWith("4")) return "visa";
  if (prefixIn(digits, 2, 34, 34) || prefixIn(digits, 2, 37, 37)) return "amex";
  if (prefixIn(digits, 2, 51, 55) || prefixIn(digits, 4, 2221, 2720)) return "mastercard";
  if (digits.startsWith("6011") || digits.startsWith("65") || prefixIn(digits, 3, 644, 649)) {
    return "discover";
  }
  if (prefixIn(digits, 4, 3528, 3589)) return "jcb";
  if (digits.startsWith("36") || prefixIn(digits, 3, 300, 305) || prefixIn(digits, 2, 38, 39)) {
    return "diners";
  }
  if (digits.startsWith("62")) return "unionpay";
  if (
    digits.startsWith("50") ||
    prefixIn(digits, 2, 56, 58) ||
    digits.startsWith("6304") ||
    digits.startsWith("6759") ||
    digits.startsWith("6767")
  ) {
    return "maestro";
  }
  return undefined;
}

/**
 * Whether the number passes the Luhn checksum every card number carries. A
 * failing number is almost always a typo; `false` for anything shorter than
 * the shortest card number (12 digits).
 */
export function isLuhnValid(number: string | undefined): boolean {
  const digits = cardDigits(number);
  if (digits.length < 12 || digits.length > 19) return false;

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Digit group sizes as printed on the card: 4-6-5 (Amex), 4-6-4 (Diners), else fours. */
function groupSizes(brand: CardBrand | undefined, length: number): number[] {
  if (brand === "amex") return [4, 6, 5];
  if (brand === "diners" && length === 14) return [4, 6, 4];
  return [4, 4, 4, 4, 3];
}

/**
 * A card number grouped as printed on the card ("4111 1111 1111 1111"). Only
 * for display and while typing; the record stores the digits alone. Text that
 * isn't a card number comes back unchanged.
 */
export function formatCardNumber(number: string | undefined): string {
  if (!isCardNumberLike(number)) return number ?? "";
  const digits = cardDigits(number);
  const groups: string[] = [];
  let offset = 0;
  for (const size of groupSizes(detectCardBrand(digits), digits.length)) {
    if (offset >= digits.length) break;
    groups.push(digits.slice(offset, offset + size));
    offset += size;
  }
  // Longer than the pattern (19-digit cards): the rest as one more group.
  if (offset < digits.length) groups.push(digits.slice(offset));
  return groups.join(" ");
}

/**
 * Typing help for the "MM/YY" expiry: inserts the slash after the month, and
 * reads a lone first digit above 1 as a month ("4" → "04/").
 */
export function formatCardExpiry(input: string, previous = ""): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  // Backspacing over the slash: drop it rather than add it straight back.
  if (input.length < previous.length && previous.endsWith("/") && digits.length === 2) {
    return digits.slice(0, 1);
  }
  if (digits.length === 1 && Number(digits) > 1) return `0${digits}/`;
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}
