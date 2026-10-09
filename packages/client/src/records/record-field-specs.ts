import { sshKeyFingerprint } from "@repo/crypto";
import type { RecordData, RecordOfType, RecordType, WifiRecord } from "@repo/schema";
import { isDefined } from "@repo/util";
import {
  CARD_BRAND_LABELS,
  cardDigits,
  detectCardBrand,
  formatCardNumber,
  isCardNumberLike,
} from "./card";

/** The visual groups a record's fields are bundled into, in render order. */
export const FIELD_GROUPS = ["title", "fields", "websites", "note", "custom"] as const;

export type FieldGroup = (typeof FIELD_GROUPS)[number];

/**
 * Which control renders this field. The spec list is shared across platforms,
 * so it names the kind of field rather than a component — each app maps the
 * kind to its own display component.
 */
export type FieldKind =
  | "title"
  | "username"
  | "password"
  | "totp"
  | "websites"
  | "note"
  | "text"
  | "secret";

/**
 * One field of a record, described as data so that the record view, the
 * version diff, and both platforms can address fields individually.
 *
 * `key` identifies the same field across two revisions (a payload field name,
 * or `custom:<title>:<n>`), `compare` is the normalised value the diff tests
 * for equality — never render `compare`, it is only a comparison token.
 */
export type FieldSpec = {
  key: string;
  group: FieldGroup;
  compare: string;
  kind: FieldKind;
  /** Visible field name: a fixed label, or a custom field's own title. */
  label: string;
  /** Single value. Absent for `kind: "websites"`. */
  value?: string;
  /** Only for `kind: "websites"`. */
  values?: string[];
  /** What a copy puts on the clipboard, when not `value` (a card number's plain digits). */
  copyValue?: string;
  /**
   * Worked out from other fields (a key's fingerprint), not stored: shown, but
   * never compared, since the field it comes from already is.
   */
  derived?: boolean;
};

/**
 * Display names per record type: the type itself, its plural (list titles,
 * the type filter), the same mid-sentence (`noun`, `nouns`: "New SSH key",
 * "No credit cards yet"), its `fields` group and what it is for (the type
 * picker). Also the order of the type picker.
 */
export const RECORD_TYPE_LABELS: Record<
  RecordType,
  { type: string; plural: string; noun: string; nouns: string; fields: string; hint: string }
> = {
  login: {
    noun: "login",
    nouns: "logins",
    type: "Login",
    plural: "Logins",
    fields: "Credentials",
    hint: "Username, password and websites",
  },
  card: {
    noun: "credit card",
    nouns: "credit cards",
    type: "Credit card",
    plural: "Credit cards",
    fields: "Card",
    hint: "Card number, expiry and security code",
  },
  identity: {
    noun: "identity",
    nouns: "identities",
    type: "Identity",
    plural: "Identities",
    fields: "Personal info",
    hint: "Name, address and contact details",
  },
  note: {
    noun: "secure note",
    nouns: "secure notes",
    type: "Secure note",
    plural: "Secure notes",
    fields: "Note",
    hint: "Free text, encrypted",
  },
  ssh_key: {
    noun: "SSH key",
    nouns: "SSH keys",
    type: "SSH key",
    plural: "SSH keys",
    fields: "Key",
    hint: "Generate or import a key",
  },
  api_key: {
    noun: "API key",
    nouns: "API keys",
    type: "API key",
    plural: "API keys",
    fields: "Credentials",
    hint: "Key, secret and host",
  },
  wifi: {
    noun: "Wi-Fi network",
    nouns: "Wi-Fi networks",
    type: "Wi-Fi",
    plural: "Wi-Fi networks",
    fields: "Network",
    hint: "Network name and password",
  },
};

/** One hue per type for its icon tile, so types tell apart at a glance in a mixed list. */
export const RECORD_TYPE_HUES: Record<RecordType, number> = {
  login: 265,
  card: 250,
  identity: 155,
  note: 75,
  ssh_key: 300,
  api_key: 200,
  wifi: 25,
};

/** A scalar type-specific field, rendered in the `fields` group. */
type TypeField<R> = {
  [K in keyof R & string]: {
    key: K;
    kind: FieldKind;
    label: string;
    /** Show the field even when it is empty (a login always has these slots). */
    always?: boolean;
    /** Display text for a non-string value; `undefined` leaves the field out. */
    format?: (value: NonNullable<R[K]>) => string | undefined;
    /** Clipboard text when it differs from the display text. */
    copy?: (value: NonNullable<R[K]>) => string;
  };
}[keyof R & string];

const WIFI_SECURITY_LABEL: Record<NonNullable<WifiRecord["security"]>, string> = {
  none: "None",
  wep: "WEP",
  wpa: "WPA",
  wpa2: "WPA2",
  wpa3: "WPA3",
};

/** The `fields` group of each type, in render order. */
const TYPE_FIELDS: { [T in RecordType]: TypeField<RecordOfType<T>>[] } = {
  login: [
    { key: "username", kind: "username", label: "Username", always: true },
    { key: "password", kind: "password", label: "Password", always: true },
    { key: "totp", kind: "totp", label: "2FA token (TOTP)" },
  ],
  card: [
    { key: "cardholderName", kind: "text", label: "Cardholder name" },
    {
      key: "number",
      kind: "secret",
      label: "Card number",
      format: formatCardNumber,
      // Payment forms take the digits; not all of them take the spaces.
      copy: (number) => (isCardNumberLike(number) ? cardDigits(number) : number),
    },
    { key: "expiry", kind: "text", label: "Expiry date" },
    { key: "securityCode", kind: "secret", label: "Security code" },
    { key: "pin", kind: "secret", label: "PIN" },
  ],
  identity: [
    { key: "firstName", kind: "text", label: "First name" },
    { key: "lastName", kind: "text", label: "Last name" },
    { key: "email", kind: "text", label: "Email" },
    { key: "phone", kind: "text", label: "Phone" },
    { key: "birthDate", kind: "text", label: "Date of birth" },
    { key: "street", kind: "text", label: "Street" },
    { key: "postalCode", kind: "text", label: "Postal code" },
    { key: "city", kind: "text", label: "City" },
    { key: "country", kind: "text", label: "Country" },
  ],
  note: [],
  ssh_key: [
    { key: "publicKey", kind: "text", label: "Public key" },
    { key: "privateKey", kind: "secret", label: "Private key" },
    { key: "passphrase", kind: "secret", label: "Passphrase" },
  ],
  api_key: [
    { key: "keyId", kind: "text", label: "Key ID" },
    { key: "secret", kind: "secret", label: "Secret" },
    { key: "host", kind: "text", label: "Host" },
  ],
  wifi: [
    { key: "ssid", kind: "text", label: "Network name (SSID)" },
    { key: "password", kind: "password", label: "Password" },
    {
      key: "security",
      kind: "text",
      label: "Security",
      format: (security) => WIFI_SECURITY_LABEL[security],
    },
    {
      key: "hidden",
      kind: "text",
      label: "Hidden network",
      // Only worth a row when it is: a visible network is the default.
      format: (hidden) => (hidden ? "Yes" : undefined),
    },
  ],
};

function typeFieldSpecs(record: RecordData): FieldSpec[] {
  // Each record is only ever paired with its own type's fields.
  const fields = TYPE_FIELDS[record.type] as TypeField<Record<string, unknown>>[];
  const values = record as unknown as Record<string, unknown>;

  return fields.flatMap(({ key, kind, label, always, format, copy }): FieldSpec[] => {
    const raw = values[key];
    if (!isDefined(raw) || raw === "") {
      return always ? [{ key, group: "fields", compare: "", kind, label, value: undefined }] : [];
    }
    const value = format ? format(raw as NonNullable<unknown>) : String(raw);
    if (value === undefined) return [];
    const copyValue = copy ? copy(raw as NonNullable<unknown>) : undefined;
    return [{ key, group: "fields", compare: value, kind, label, value, copyValue }];
  });
}

/** Rows worked out from the stored fields, appended to the `fields` group. */
function derivedFieldSpecs(record: RecordData): FieldSpec[] {
  const derived = (key: string, label: string, value: string): FieldSpec => ({
    key,
    group: "fields",
    compare: value,
    kind: "text",
    label,
    value,
    derived: true,
  });

  switch (record.type) {
    case "card": {
      const brand = detectCardBrand(record.number);
      return brand ? [derived("brand", "Card type", CARD_BRAND_LABELS[brand])] : [];
    }
    case "ssh_key": {
      const fingerprint = record.publicKey ? sshKeyFingerprint(record.publicKey) : undefined;
      return fingerprint ? [derived("fingerprint", "Fingerprint", fingerprint)] : [];
    }
    default:
      return [];
  }
}

type GetRecordFieldSpecsOptions = {
  /**
   * Prepend the record's title. The record view keeps it out (the title is
   * already the page heading); the diff wants it so renames stay visible.
   */
  includeTitle?: boolean;
  /**
   * Add the rows worked out from other fields (card type, key fingerprint).
   * The record view wants them; the diff doesn't: they change exactly when
   * their source field does, which it already shows.
   */
  includeDerived?: boolean;
};

/** A record's fields in render order: title, type fields, websites, note, custom fields. */
export function getRecordFieldSpecs(
  record: RecordData,
  { includeTitle = false, includeDerived = false }: GetRecordFieldSpecsOptions = {},
): FieldSpec[] {
  const specs: FieldSpec[] = [];

  if (includeTitle) {
    specs.push({
      key: "title",
      group: "title",
      compare: record.title ?? "",
      kind: "title",
      label: "Title",
      value: record.title,
    });
  }

  specs.push(...typeFieldSpecs(record));
  if (includeDerived) specs.push(...derivedFieldSpecs(record));

  if (record.type === "login" && isDefined(record.websites) && record.websites.length > 0) {
    const values = record.websites.map(({ value }) => value);
    specs.push({
      key: "websites",
      group: "websites",
      compare: JSON.stringify(values),
      kind: "websites",
      label: "Websites",
      values,
    });
  }

  if (isDefined(record.note) && record.note !== "") {
    specs.push({
      key: "note",
      group: "note",
      compare: record.note,
      kind: "note",
      label: "Notes",
      value: record.note,
    });
  }

  if (isDefined(record.customFields) && record.customFields.length > 0) {
    // Titles are the natural identity of a custom field, but they are not
    // unique — count occurrences so duplicates still pair up positionally.
    const seen = new Map<string, number>();

    for (const customField of record.customFields) {
      const occurrence = seen.get(customField.title) ?? 0;
      seen.set(customField.title, occurrence + 1);

      specs.push({
        key: `custom:${customField.title}:${occurrence}`,
        group: "custom",
        compare: `${customField.type} ${customField.value}`,
        kind: customField.type,
        label: customField.title,
        value: customField.value,
      });
    }
  }

  return specs;
}
