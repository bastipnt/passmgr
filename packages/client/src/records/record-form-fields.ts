import type { RecordFormValues, RecordType, WifiRecord } from "@repo/schema";

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
  | "toggle";

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
  /** May share a row with the next half-width field on wide screens. */
  half?: boolean;
  /** Monospaced input (secrets, ids). */
  mono?: boolean;
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
 * The type-specific inputs of every form but the login's, which has its own
 * (websites, TOTP). Title, note and extra fields are common to every form and
 * not listed. A secure note has no inputs of its own: its body is the note.
 */
export const RECORD_FORM_FIELDS: {
  [T in Exclude<RecordType, "login">]: readonly FormFieldSpec<T>[];
} = {
  card: [
    { key: "cardholderName", kind: "text", label: "Cardholder name" },
    { key: "number", kind: "cardNumber", label: "Card number", input: "numeric", mono: true },
    { key: "expiry", kind: "cardExpiry", label: "Expiry date", placeholder: "MM/YY", half: true },
    { key: "securityCode", kind: "secret", label: "Security code", input: "numeric", half: true },
    { key: "pin", kind: "secret", label: "PIN", input: "numeric", half: true },
  ],
  identity: [
    { key: "firstName", kind: "text", label: "First name", half: true },
    { key: "lastName", kind: "text", label: "Last name", half: true },
    { key: "email", kind: "text", label: "Email", input: "email", half: true },
    { key: "phone", kind: "text", label: "Phone", input: "phone", half: true },
    { key: "birthDate", kind: "text", label: "Date of birth", input: "date", half: true },
    { key: "street", kind: "text", label: "Street" },
    { key: "postalCode", kind: "text", label: "Postal code", half: true },
    { key: "city", kind: "text", label: "City", half: true },
    { key: "country", kind: "text", label: "Country" },
  ],
  note: [],
  ssh_key: [
    { key: "publicKey", kind: "multiline", label: "Public key", mono: true },
    { key: "privateKey", kind: "secretMultiline", label: "Private key", mono: true },
    { key: "passphrase", kind: "secret", label: "Passphrase" },
  ],
  api_key: [
    { key: "keyId", kind: "text", label: "Key ID", mono: true },
    { key: "secret", kind: "secret", label: "Secret", mono: true },
    { key: "host", kind: "text", label: "Host", placeholder: "api.example.com" },
  ],
  wifi: [
    { key: "ssid", kind: "text", label: "Network name (SSID)" },
    { key: "password", kind: "password", label: "Password" },
    { key: "security", kind: "select", label: "Security", options: WIFI_SECURITY_OPTIONS },
    { key: "hidden", kind: "toggle", label: "Hidden network" },
  ],
};
