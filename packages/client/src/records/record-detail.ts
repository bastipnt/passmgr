import type { DecryptedRecord, IdentityRecord, RecordData, RecordType } from "@repo/schema";
import { counted, isDefined, textStats } from "@repo/util";
import { CARD_BRAND_LABELS, cardDigits, detectCardBrand, isCardNumberLike } from "./card";
import { type FieldSpec, getRecordFieldSpecs, RECORD_TYPE_LABELS } from "./record-field-specs";
import {
  type FormFieldSpec,
  RECORD_FORM_FIELDS,
  RECORD_FORM_LAYOUT,
  RECORD_FORM_SECTION_LABELS,
  type RecordFormSection,
} from "./record-form-fields";

export type DetailTone = "neutral" | "warning" | "danger";

/** A `FieldSpec` with how the detail shows it, taken from the field's form input. */
export type DetailFieldSpec = FieldSpec & {
  mono?: boolean;
  /** Shares a phone row with its row's other fields, like the form (`phoneShare`). */
  phoneShare?: boolean;
  /** A key block: `code` shown, `blur` hidden until shown, keeping its shape. */
  block?: "code" | "blur";
  /** Shown while the value is hidden in place of plain dots. */
  maskedValue?: string;
  /** Muted text after the value ("35 years", "107 characters"). */
  hint?: string;
  /** A small tag after the label (the card network). */
  badge?: string;
  /** A chip before the field's actions (the card's time left). */
  status?: { label: string; tone: DetailTone };
  /** An extra field marked hidden in the form. */
  hiddenMark?: boolean;
};

export type DetailSectionLayout =
  | { kind: "fields"; id: "fields"; title: string; rows: DetailFieldSpec[][] }
  | { kind: "address"; id: RecordFormSection; title: string; lines: string[] };

export type RecordDetailLayout = {
  sections: DetailSectionLayout[];
  websites?: string[];
  note?: string;
  /** The note is the record (a secure note): it comes first. */
  noteFirst: boolean;
  /** Extra fields, two per row. */
  extraRows: DetailFieldSpec[][];
};

const ROW_CAPACITY = { half: 2, third: 3 } as const;

/** The form's rows: consecutive fields of one `width`, as many as fit. */
function formRows(specs: readonly FormFieldSpec[]): FormFieldSpec[][] {
  const rows: FormFieldSpec[][] = [];
  for (const spec of specs) {
    const last = rows.at(-1);
    const width = last?.[0]?.width;
    if (last && spec.width && width === spec.width && last.length < ROW_CAPACITY[spec.width]) {
      last.push(spec);
    } else rows.push([spec]);
  }
  return rows;
}

const SSH_KEY_TYPES: Record<string, string> = {
  "ssh-ed25519": "Ed25519",
  "ssh-rsa": "RSA",
  "ssh-dss": "DSA",
  "ecdsa-sha2-nistp256": "ECDSA P-256",
  "ecdsa-sha2-nistp384": "ECDSA P-384",
  "ecdsa-sha2-nistp521": "ECDSA P-521",
  "sk-ssh-ed25519@openssh.com": "Ed25519-SK",
  "sk-ecdsa-sha2-nistp256@openssh.com": "ECDSA-SK",
};

/** "Ed25519" for an `ssh-ed25519 …` line; the line's own type name when unknown. */
export function sshKeyTypeLabel(publicKey: string | undefined): string | undefined {
  const keyType = publicKey?.trim().split(/\s+/)[0];
  return keyType ? (SSH_KEY_TYPES[keyType] ?? keyType) : undefined;
}

/** The file name `ssh-keygen` gives a key of this type ("id_ed25519"), for a download. */
export function sshPrivateKeyFileName(publicKey: string | undefined): string {
  const keyType = publicKey?.trim().split(/\s+/)[0] ?? "";
  const security = keyType.startsWith("sk-") ? "_sk" : "";
  const algorithm = /ed25519|rsa|dss|ecdsa/.exec(keyType)?.[0];
  if (!algorithm) return "id_key";
  return `id_${algorithm === "dss" ? "dsa" : algorithm}${security}`;
}

/** "4111 •••• •••• 1111": a plain card number with its first and last four left showing. */
export function maskedCardNumber(number: string | undefined): string | undefined {
  if (!isCardNumberLike(number)) return undefined;
  const digits = cardDigits(number);
  if (digits.length < 12) return undefined;
  return `${digits.slice(0, 4)} •••• •••• ${digits.slice(-4)}`;
}

/**
 * The part of an API secret that names its kind, not its value (`sk_live_`,
 * `ghp_`, `xoxb-`): letters, then `_` or `-`, an optional environment word.
 * Left visible so keys tell apart; `undefined` unless enough secret follows.
 */
export function apiSecretPrefix(secret: string | undefined): string | undefined {
  const prefix = /^[A-Za-z]{2,8}[_-](?:(?:live|test|prod|dev|sandbox)[_-])?/.exec(
    secret ?? "",
  )?.[0];
  if (!prefix || !secret || secret.length - prefix.length < 16) return undefined;
  return prefix;
}

const EXPIRY_SOON_MONTHS = 3;

/**
 * Time left on a card's "MM/YY" expiry: it is valid through the end of that
 * month. Amber within `EXPIRY_SOON_MONTHS`, red once expired.
 */
export function cardExpiryStatus(
  expiry: string | undefined,
  now = new Date(),
): { label: string; tone: DetailTone } | undefined {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry ?? "");
  if (!match) return undefined;
  const expires = (2000 + Number(match[2])) * 12 + Number(match[1]) - 1;
  const months = expires - (now.getFullYear() * 12 + now.getMonth());
  if (months < 0) return { label: "Expired", tone: "danger" };
  if (months === 0) return { label: "Expires this month", tone: "warning" };
  return {
    label: `${months} mo left`,
    tone: months <= EXPIRY_SOON_MONTHS ? "warning" : "neutral",
  };
}

/** A "YYYY-MM-DD" birth date as "14 March 1991" and the age it makes; `undefined` for free text. */
export function birthDateDisplay(
  birthDate: string | undefined,
  now = new Date(),
  locale?: string,
): { date: string; age?: string } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? "");
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) return undefined;
  const hadBirthday =
    now.getMonth() > month - 1 || (now.getMonth() === month - 1 && now.getDate() >= day);
  const age = now.getFullYear() - year - (hadBirthday ? 0 : 1);
  return {
    date: date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
    age: age >= 0 ? counted(age, "year", "years") : undefined,
  };
}

/** The address as printed on an envelope: street, postal code and city, country. */
export function addressLines(record: IdentityRecord): string[] {
  const cityLine = [record.postalCode, record.city].filter(Boolean).join(" ");
  return [record.street, cityLine, record.country].filter((line): line is string => !!line);
}

function detailField(
  field: FieldSpec,
  form: FormFieldSpec | undefined,
  record: RecordData,
  now: Date,
): DetailFieldSpec {
  const spec: DetailFieldSpec = { ...field, mono: form?.mono, phoneShare: !!form?.phoneShare };

  switch (form?.kind) {
    case "multiline":
      spec.block = "code";
      break;
    case "secretMultiline":
      if (form.mask === "blur") spec.block = "blur";
      break;
    case "cardNumber": {
      spec.mono = true;
      spec.maskedValue = maskedCardNumber(field.copyValue ?? field.value);
      const brand = detectCardBrand(field.copyValue ?? field.value ?? "");
      spec.badge = brand && CARD_BRAND_LABELS[brand];
      break;
    }
    case "cardExpiry":
      spec.mono = true;
      spec.status = cardExpiryStatus(field.value, now);
      break;
  }

  if (record.type === "identity" && field.key === "birthDate") {
    const birth = birthDateDisplay(field.value, now);
    if (birth) Object.assign(spec, { value: birth.date, copyValue: field.value, hint: birth.age });
  }
  if (record.type === "api_key" && field.key === "secret" && field.value) {
    const prefix = apiSecretPrefix(field.value);
    spec.maskedValue = prefix && `${prefix}••••••••••••`;
    spec.hint = counted(textStats(field.value).characters, "character", "characters");
  }
  return spec;
}

/** The rows of a type's own section: the form's rows, empty fields left out. */
function fieldRows(record: RecordData, fields: Map<string, FieldSpec>, now: Date) {
  // A hidden network is a hint on its security or name, a row of its own only without either.
  const hiddenHintOn = ["security", "ssid"].find((key) => fields.has(key) && fields.has("hidden"));
  const forms = (RECORD_FORM_FIELDS[record.type] as readonly FormFieldSpec[]).filter(
    (spec) => !spec.section && !(spec.kind === "toggle" && hiddenHintOn),
  );
  const rows = formRows(forms).map((row) =>
    row.flatMap((form) => {
      const field = fields.get(form.key);
      if (!field) return [];
      const spec = detailField(field, form, record, now);
      if (form.key === hiddenHintOn) spec.hint = "hidden network";
      return [spec];
    }),
  );

  // Worked out from the public key, so above the key blocks as a summary.
  if (record.type === "ssh_key") {
    const type = sshKeyTypeLabel(record.publicKey);
    const fingerprint = fields.get("fingerprint");
    const summary: DetailFieldSpec[] = [];
    if (type) {
      summary.push({
        key: "keyType",
        group: "fields",
        compare: type,
        kind: "text",
        label: "Type",
        value: type,
        derived: true,
      });
    }
    if (fingerprint) summary.push({ ...fingerprint, mono: true });
    rows.unshift(summary);
  }
  return rows.filter((row) => row.length > 0);
}

function extraFieldRows(custom: FieldSpec[]): DetailFieldSpec[][] {
  const rows: DetailFieldSpec[][] = [];
  custom.forEach((field, i) => {
    const spec: DetailFieldSpec = { ...field, hiddenMark: field.kind === "secret" };
    if (i % 2 === 0) rows.push([spec]);
    else rows.at(-1)?.push(spec);
  });
  return rows;
}

/**
 * A record's detail as its form at rest: the same sections in the same order,
 * fields paired where the form pairs them, then websites, extra fields and the
 * note (first for a secure note, whose body it is). Empty fields are left out.
 */
export function recordDetailLayout(record: DecryptedRecord, now = new Date()): RecordDetailLayout {
  const specs = getRecordFieldSpecs(record, { includeDerived: true });
  const fields = new Map(
    specs.filter((spec) => spec.group === "fields").map((spec) => [spec.key, spec]),
  );
  const type: RecordType = record.type;

  const sections: DetailSectionLayout[] = [];
  const rows = fieldRows(record, fields, now);
  if (rows.length > 0) {
    sections.push({ kind: "fields", id: "fields", title: RECORD_TYPE_LABELS[type].fields, rows });
  }

  if (type === "identity") {
    const lines = addressLines(record as IdentityRecord);
    if (lines.length > 0) {
      sections.push({
        kind: "address",
        id: "address",
        title: RECORD_FORM_SECTION_LABELS.address,
        lines,
      });
    }
  }

  const websites = specs.find((spec) => spec.group === "websites")?.values;
  const note = specs.find((spec) => spec.group === "note")?.value;

  return {
    sections,
    websites: isDefined(websites) && websites.length > 0 ? websites : undefined,
    note,
    noteFirst: !!RECORD_FORM_LAYOUT[type].noteFirst,
    extraRows: extraFieldRows(specs.filter((spec) => spec.group === "custom")),
  };
}
