import { parseWebsite } from "@repo/util";
import { z } from "zod";
import {
  MAX_CUSTOM_FIELDS,
  MAX_FIELD_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_URL_LENGTH,
  MAX_WEBSITES,
} from "./record-limits";
import { MAX_TAG_LENGTH, MAX_TAGS, tagsFormSchema } from "./tags";

/**
 * The decrypted record payload (ADR 0001 D4): a discriminated union on `type`.
 * `type` and every field live inside the ciphertext, so the server never
 * learns what kind of record it stores.
 */

function tooLong(max: number) {
  return `At most ${max.toLocaleString("en-US")} characters`;
}

const title = z
  .string()
  .min(1, "Title is required")
  .max(MAX_TITLE_LENGTH, tooLong(MAX_TITLE_LENGTH));
const text = z.string().max(MAX_FIELD_LENGTH, tooLong(MAX_FIELD_LENGTH)).optional();
const longText = z.string().max(MAX_LONG_TEXT_LENGTH, tooLong(MAX_LONG_TEXT_LENGTH)).optional();

const customFieldSchema = z.object({
  type: z.enum(["text", "secret"]),
  title,
  value: z
    .string()
    .min(1, "Value is required")
    .max(MAX_LONG_TEXT_LENGTH, tooLong(MAX_LONG_TEXT_LENGTH)),
});

export type CustomField = z.infer<typeof customFieldSchema>;

/** Fields every record type shares. */
const baseRecordShape = {
  title,
  note: z.string().max(MAX_NOTE_LENGTH, tooLong(MAX_NOTE_LENGTH)).optional(),
  favorite: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS).optional(),
  customFields: z
    .array(customFieldSchema)
    .max(MAX_CUSTOM_FIELDS, `At most ${MAX_CUSTOM_FIELDS} custom fields`)
    .optional(),
  // Placeholder for encrypted file attachments: reserves the key, holds nothing yet.
  attachments: z.array(z.never()).optional(),
};

const websitesSchema = z
  .array(
    z.object({
      value: z.union([
        z.literal(""),
        z
          .string()
          .max(MAX_URL_LENGTH, tooLong(MAX_URL_LENGTH))
          .refine((value) => parseWebsite(value) !== undefined, "Must be a URL, domain or app id"),
      ]),
    }),
  )
  .max(MAX_WEBSITES, `At most ${MAX_WEBSITES} websites`);

// When the password last changed (ISO), stamped by `RecordRepository`, never by a form.
const passwordChangedAt = z.string().optional();

/** Type-specific fields, without `type` and the base fields. */
const loginFields = {
  username: text,
  password: text,
  passwordChangedAt,
  websites: websitesSchema.optional(),
  totp: text,
};

const cardFields = {
  cardholderName: text,
  number: text,
  // "MM/YY", as printed on the card.
  expiry: text,
  securityCode: text,
  pin: text,
};

const identityFields = {
  firstName: text,
  lastName: text,
  email: text,
  phone: text,
  birthDate: text,
  street: text,
  postalCode: text,
  city: text,
  country: text,
};

// A secure note is the base fields only: its body is `note`.
const noteFields = {};

const sshKeyFields = {
  privateKey: longText,
  publicKey: longText,
  passphrase: text,
};

const apiKeyFields = {
  keyId: text,
  secret: longText,
  host: text,
};

const wifiFields = {
  ssid: text,
  password: text,
  passwordChangedAt,
  security: z.enum(["none", "wep", "wpa", "wpa2", "wpa3"]).optional(),
  hidden: z.boolean().optional(),
};

function recordTypeSchema<const T extends string, S extends z.ZodRawShape>(type: T, fields: S) {
  return z.object({ type: z.literal(type), ...baseRecordShape, ...fields });
}

export const loginRecordSchema = recordTypeSchema("login", loginFields);
export const cardRecordSchema = recordTypeSchema("card", cardFields);
export const identityRecordSchema = recordTypeSchema("identity", identityFields);
export const noteRecordSchema = recordTypeSchema("note", noteFields);
export const sshKeyRecordSchema = recordTypeSchema("ssh_key", sshKeyFields);
export const apiKeyRecordSchema = recordTypeSchema("api_key", apiKeyFields);
export const wifiRecordSchema = recordTypeSchema("wifi", wifiFields);

export const recordDataSchema = z.discriminatedUnion("type", [
  loginRecordSchema,
  cardRecordSchema,
  identityRecordSchema,
  noteRecordSchema,
  sshKeyRecordSchema,
  apiKeyRecordSchema,
  wifiRecordSchema,
]);

/** A record's content, without the payload envelope (`schemaVersion`). */
export type RecordData = z.infer<typeof recordDataSchema>;
export type RecordType = RecordData["type"];
export type RecordOfType<T extends RecordType> = Extract<RecordData, { type: T }>;

export type LoginRecord = RecordOfType<"login">;
export type CardRecord = RecordOfType<"card">;
export type IdentityRecord = RecordOfType<"identity">;
export type NoteRecord = RecordOfType<"note">;
export type SshKeyRecord = RecordOfType<"ssh_key">;
export type ApiKeyRecord = RecordOfType<"api_key">;
export type WifiRecord = RecordOfType<"wifi">;

export const RECORD_TYPES: readonly RecordType[] = recordDataSchema.options.map(
  (option) => option.shape.type.value,
);

/** Narrow a record (or anything carrying its payload) to one type. */
export function isRecordType<R extends { type: RecordType }, T extends RecordType>(
  record: R,
  type: T,
): record is Extract<R, { type: T }> {
  return record.type === type;
}

/** Base fields no form edits; `recordFromForm` carries them over from the current version. */
const FORM_OMIT = { type: true, favorite: true, attachments: true } as const;
/** Not carried over by `recordFromForm`: `RecordRepository.update` takes it from the stored version. */
const PASSWORD_FORM_OMIT = { ...FORM_OMIT, passwordChangedAt: true } as const;

const formTags = { tags: tagsFormSchema.optional() };

/** "YYYY-MM-DD": what web's date input writes, so both apps store one format. */
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "MM/YY", as printed on the card. */
const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/\d{2}$/;

/**
 * What each type's form edits: the type's fields without `type`, which the
 * caller adds when it builds the payload, and without the base fields no form
 * edits yet, so a form can't overwrite them. Stricter than the stored schema
 * where a form can help (a card's expiry, a birth date): stored payloads stay
 * loose, any client may have written them.
 */
export const recordFormSchemas = {
  login: loginRecordSchema.omit(PASSWORD_FORM_OMIT).extend(formTags),
  card: cardRecordSchema.omit(FORM_OMIT).extend({
    ...formTags,
    expiry: z.union([z.literal(""), z.string().regex(EXPIRY_PATTERN, "Use MM/YY")]).optional(),
  }),
  identity: identityRecordSchema.omit(FORM_OMIT).extend({
    ...formTags,
    birthDate: z
      .union([z.literal(""), z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD")])
      .optional(),
  }),
  note: noteRecordSchema.omit(FORM_OMIT).extend(formTags),
  ssh_key: sshKeyRecordSchema.omit(FORM_OMIT).extend(formTags),
  api_key: apiKeyRecordSchema.omit(FORM_OMIT).extend(formTags),
  wifi: wifiRecordSchema.omit(PASSWORD_FORM_OMIT).extend(formTags),
} satisfies { [T in RecordType]: z.ZodType };

export type RecordFormValues<T extends RecordType = RecordType> = z.infer<
  (typeof recordFormSchemas)[T]
>;

export const loginFormSchema = recordFormSchemas.login;
export type LoginFormValues = RecordFormValues<"login">;
