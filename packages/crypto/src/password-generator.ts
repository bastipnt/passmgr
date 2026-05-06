import { randomBytes } from "@noble/hashes/utils.js";
import type { PasswordStrength } from "@repo/util";

export type PasswordOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
  minDigits: number;
  minSymbols: number;
};

export type PassphraseOptions = {
  wordCount: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
};

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
const AMBIGUOUS = new Set(["O", "0", "I", "l", "1"]);

function stripAmbiguous(charset: string): string {
  let out = "";
  for (const c of charset) if (!AMBIGUOUS.has(c)) out += c;
  return out;
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error("maxExclusive must be > 0");
  const max = Math.floor(maxExclusive);
  const limit = Math.floor(0x100000000 / max) * max;
  // Rejection sampling for unbiased uniform distribution.
  while (true) {
    const buf = randomBytes(4);
    const n = ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0;
    if (n < limit) return n % max;
  }
}

function pick<T>(arr: ArrayLike<T>): T {
  return arr[randomInt(arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export class PasswordGeneratorError extends Error {}

export function generatePassword(opts: PasswordOptions): string {
  const length = Math.max(1, Math.floor(opts.length));
  const sets: { name: string; chars: string; min: number }[] = [];

  if (opts.uppercase) {
    sets.push({
      name: "upper",
      chars: opts.avoidAmbiguous ? stripAmbiguous(UPPER) : UPPER,
      min: 0,
    });
  }

  if (opts.lowercase) {
    sets.push({
      name: "lower",
      chars: opts.avoidAmbiguous ? stripAmbiguous(LOWER) : LOWER,
      min: 0,
    });
  }

  if (opts.digits) {
    sets.push({
      name: "digit",
      chars: opts.avoidAmbiguous ? stripAmbiguous(DIGITS) : DIGITS,
      min: Math.max(0, Math.floor(opts.minDigits)),
    });
  }

  if (opts.symbols) {
    sets.push({ name: "symbol", chars: SYMBOLS, min: Math.max(0, Math.floor(opts.minSymbols)) });
  }

  if (sets.length === 0) {
    throw new PasswordGeneratorError("At least one character set must be enabled");
  }

  const totalMin = sets.reduce((acc, s) => acc + s.min, 0);
  if (totalMin > length) {
    throw new PasswordGeneratorError("Minimum requirements exceed password length");
  }

  const chars: string[] = [];
  for (const set of sets) {
    for (let i = 0; i < set.min; i++) chars.push(pick(set.chars));
  }

  const all = sets.map((s) => s.chars).join("");
  while (chars.length < length) chars.push(pick(all));

  return shuffle(chars).join("");
}

export function getCharsetSize(opts: PasswordOptions): number {
  let size = 0;
  if (opts.uppercase) size += (opts.avoidAmbiguous ? stripAmbiguous(UPPER) : UPPER).length;
  if (opts.lowercase) size += (opts.avoidAmbiguous ? stripAmbiguous(LOWER) : LOWER).length;
  if (opts.digits) size += (opts.avoidAmbiguous ? stripAmbiguous(DIGITS) : DIGITS).length;
  if (opts.symbols) size += SYMBOLS.length;
  return size;
}

export function estimateEntropy(length: number, charsetSize: number): number {
  if (length <= 0 || charsetSize <= 1) return 0;
  return length * Math.log2(charsetSize);
}

export function estimatePassphraseEntropy(wordCount: number, wordlistSize: number): number {
  if (wordCount <= 0 || wordlistSize <= 1) return 0;
  return wordCount * Math.log2(wordlistSize);
}

export function estimateEntropyFromString(password: string): number {
  if (!password) return 0;
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;
  return estimateEntropy(password.length, charsetSize);
}

export function getStrength(bits: number): PasswordStrength {
  if (bits < 40) return { level: "weak", label: "Weak", bits };
  if (bits < 60) return { level: "fair", label: "Fair", bits };
  if (bits < 80) return { level: "strong", label: "Strong", bits };
  return { level: "very-strong", label: "Very strong", bits };
}

export function getStrengthFromString(password: string): PasswordStrength {
  return getStrength(estimateEntropyFromString(password));
}

export async function generatePassphrase(opts: PassphraseOptions): Promise<string> {
  const { wordlist } = await import("./wordlist-eff-large");
  const count = Math.max(1, Math.floor(opts.wordCount));
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    let w = pick(wordlist);
    if (opts.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
    words.push(w);
  }

  if (opts.includeNumber) {
    const idx = randomInt(words.length);
    words[idx] = words[idx]! + String(randomInt(10));
  }
  return words.join(opts.separator);
}

export const EFF_WORDLIST_SIZE = 7776;
