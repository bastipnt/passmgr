import { sshKeyFingerprint, sshPrivateKeyFormat } from "@repo/crypto";
import type { RecordFormValues, RecordType, WifiRecord } from "@repo/schema";
import { counted, textStats } from "@repo/util";

/**
 * Which control edits the field. Like `FieldKind`, the list is shared across
 * platforms and names the kind of input; each app maps it to its own control.
 */
export type FormFieldKind =
  /** One line of text. */
  | "text"
  /** A masked line, with a reveal toggle. */
  | "secret"
  /** The password input with the generator (as on a login). */
  | "password"
  /** Several lines, monospaced (keys). */
  | "multiline"
  /** Several lines, masked until revealed (private keys). */
  | "secretMultiline"
  /** Grouped digits with brand detection and a Luhn hint. */
  | "cardNumber"
  /** "MM/YY" with the slash typed for you. */
  | "cardExpiry"
  /** A fixed list of options. */
  | "select"
  /** On / off. */
  | "toggle"
  /** A login's TOTP secret or `otpauth://` URI, monospaced. */
  | "totp";

export type FormFieldOption = { value: string; label: string };

/**
 * One input of a type's form. `key` is the form value (and payload field) it
 * edits: one of the type's own, or any field name for a spec of no one type.
 */
export type FormFieldSpec<T extends RecordType = RecordType> = {
  key: [RecordType] extends [T] ? string : keyof RecordFormValues<T> & string;
  kind: FormFieldKind;
  label: string;
  /** Typing hints for the platform keyboard / autofill. */
  input?: "email" | "phone" | "numeric" | "date";
  placeholder?: string;
  /** Only for `kind: "select"`. */
  options?: readonly FormFieldOption[];
  /** Shares a row with the next fields of the same width on wide screens. */
  width?: "half" | "third";
  /** Monospaced input (secrets, ids). */
  mono?: boolean;
  /** A `secret` the password generator can fill, with the password's defaults. */
  generator?: boolean;
  /** A line under the label (a toggle's meaning). */
  description?: string;
  /** Starts or continues a section of its own after the type's first one. */
  section?: RecordFormSection;
  /** A `multiline` block's status line; its character count without one. */
  summary?: "sshKeyFormat" | "sshFingerprint";
};

export type RecordFormSection = "address";

export const RECORD_FORM_SECTION_LABELS: { [S in RecordFormSection]: string } = {
  address: "Address",
};

export const WIFI_SECURITY_OPTIONS: readonly {
  value: NonNullable<WifiRecord["security"]>;
  label: string;
}[] = [
  { value: "wpa2", label: "WPA2" },
  { value: "wpa3", label: "WPA3" },
  { value: "wpa", label: "WPA" },
  { value: "wep", label: "WEP" },
  { value: "none", label: "None" },
];

/**
 * The type-specific inputs of every form. Title, note, extra fields and tags
 * are common to every form and not listed. A secure note has no inputs of its
 * own: its body is the note.
 */
export const RECORD_FORM_FIELDS: {
  [T in RecordType]: readonly FormFieldSpec<T>[];
} = {
  login: [
    { key: "username", kind: "text", label: "Username", width: "half" },
    { key: "email", kind: "text", label: "Email", input: "email", width: "half" },
    { key: "password", kind: "password", label: "Password" },
    {
      key: "totp",
      kind: "totp",
      label: "One-time code",
      placeholder: "Paste a secret or otpauth:// link",
    },
  ],
  card: [
    { key: "cardholderName", kind: "text", label: "Cardholder name", width: "half" },
    {
      key: "number",
      kind: "cardNumber",
      label: "Card number",
      input: "numeric",
      mono: true,
      width: "half",
    },
    {
      key: "expiry",
      kind: "cardExpiry",
      label: "Expiry date",
      placeholder: "MM/YY",
      width: "third",
    },
    {
      key: "securityCode",
      kind: "secret",
      label: "Security code",
      input: "numeric",
      width: "third",
    },
    { key: "pin", kind: "secret", label: "PIN", input: "numeric", width: "third" },
  ],
  identity: [
    { key: "firstName", kind: "text", label: "First name", width: "half" },
    { key: "lastName", kind: "text", label: "Last name", width: "half" },
    { key: "email", kind: "text", label: "Email", input: "email", width: "half" },
    { key: "phone", kind: "text", label: "Phone", input: "phone", width: "half" },
    { key: "birthDate", kind: "text", label: "Date of birth", input: "date", width: "half" },
    { key: "street", kind: "text", label: "Street", section: "address" },
    { key: "postalCode", kind: "text", label: "Postal code", width: "half", section: "address" },
    { key: "city", kind: "text", label: "City", width: "half", section: "address" },
    { key: "country", kind: "text", label: "Country", width: "half", section: "address" },
  ],
  note: [],
  ssh_key: [
    {
      key: "privateKey",
      kind: "secretMultiline",
      label: "Private key",
      mono: true,
      summary: "sshKeyFormat",
    },
    {
      key: "publicKey",
      kind: "multiline",
      label: "Public key",
      mono: true,
      summary: "sshFingerprint",
    },
    { key: "passphrase", kind: "secret", label: "Passphrase", generator: true },
  ],
  api_key: [
    { key: "keyId", kind: "text", label: "Key ID", mono: true, width: "half" },
    { key: "host", kind: "text", label: "Host", placeholder: "api.example.com", width: "half" },
    { key: "secret", kind: "secretMultiline", label: "Secret", mono: true },
  ],
  wifi: [
    { key: "ssid", kind: "text", label: "Network name (SSID)", width: "half" },
    {
      key: "security",
      kind: "select",
      label: "Security",
      options: WIFI_SECURITY_OPTIONS,
      width: "half",
    },
    { key: "password", kind: "password", label: "Password" },
    {
      key: "hidden",
      kind: "toggle",
      label: "Hidden network",
      description: "The network doesn't broadcast its name",
    },
  ],
};

/** Where a type's form puts the common parts around its inputs. */
export type RecordFormLayout = {
  /** The note is the record's body: in the first section, under the tags, taller. */
  noteFirst?: boolean;
  /** A websites list next to the extra fields. */
  websites?: boolean;
  /** Controls in the first section's header that fill its inputs in. */
  actions?: "sshKey";
};

export const RECORD_FORM_LAYOUT: { [T in RecordType]: RecordFormLayout } = {
  login: { websites: true },
  card: {},
  identity: {},
  note: { noteFirst: true },
  ssh_key: { actions: "sshKey" },
  api_key: {},
  wifi: {},
};

/** The note's status line: "N words · M characters", or "0 words" when empty. */
export function noteSummary(text: string): string {
  const { words, characters } = textStats(text);
  const wordCount = counted(words, "word", "words");
  return characters
    ? `${wordCount} · ${counted(characters, "character", "characters")}`
    : wordCount;
}

/**
 * A multiline field's status line: the key's format or fingerprint once recognised, else
 * its character count, left out while `masked` (the length of a secret is a hint).
 */
export function multilineSummary(spec: FormFieldSpec, value: string, masked = false): string {
  const described =
    spec.summary === "sshKeyFormat"
      ? sshPrivateKeyFormat(value)
      : spec.summary === "sshFingerprint"
        ? sshKeyFingerprint(value)
        : undefined;
  if (described) return described;
  return masked ? "" : counted(textStats(value).characters, "character", "characters");
}
