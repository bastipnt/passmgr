import type { PassphraseOptions, PasswordOptions } from "@repo/crypto";

export type Mode = "password" | "passphrase";

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
