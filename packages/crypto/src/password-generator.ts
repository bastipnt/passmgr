import { randomBytes } from "@noble/hashes/utils.js";

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

/** Which generator the UI is currently driving. */
export type GeneratorMode = "password" | "passphrase";

export const PASSWORD_DEFAULTS: PasswordOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
  minDigits: 1,
  minSymbols: 1,
};

export const PASSPHRASE_DEFAULTS: PassphraseOptions = {
  wordCount: 4,
  separator: "-",
  capitalize: false,
  includeNumber: false,
};

export const SEPARATORS: { label: string; value: string }[] = [
  { label: "-", value: "-" },
  { label: "_", value: "_" },
  { label: ".", value: "." },
  { label: ",", value: "," },
  { label: "space", value: " " },
];

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
