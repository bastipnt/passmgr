import { z } from "zod";

/**
 * The decrypted record payload (ADR 0001 D4): a discriminated union on `type`.
 * `type` and every field live inside the ciphertext, so the server never
 * learns what kind of record it stores.
 */

const customFieldSchema = z.object({
  type: z.enum(["text", "secret"]),
  title: z.string().min(1, "Title is required"),
  value: z.string().min(1, "Value is required"),
});

export type CustomField = z.infer<typeof customFieldSchema>;

/** Fields every record type shares. */
const baseRecordShape = {
  title: z.string().min(1, "Title is required"),
  note: z.string().optional(),
  favorite: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
  customFields: z.array(customFieldSchema).optional(),
  // Placeholder for encrypted file attachments: reserves the key, holds nothing yet.
  attachments: z.array(z.never()).optional(),
};

const websitesSchema = z.array(
  z.object({
    value: z.union([z.literal(""), z.url("Must be a valid URL")]),
  }),
);

/** Type-specific fields, without `type` and the base fields. */
const loginFields = {
  username: z.string().optional(),
  password: z.string().optional(),
  websites: websitesSchema.optional(),
  totp: z.string().optional(),
};

const cardFields = {
  cardholderName: z.string().optional(),
  number: z.string().optional(),
  // "MM/YY", as printed on the card.
  expiry: z.string().optional(),
  securityCode: z.string().optional(),
  pin: z.string().optional(),
};

const identityFields = {
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
};

// A secure note is the base fields only: its body is `note`.
const noteFields = {};

const sshKeyFields = {
  privateKey: z.string().optional(),
  publicKey: z.string().optional(),
  passphrase: z.string().optional(),
};

const apiKeyFields = {
  keyId: z.string().optional(),
  secret: z.string().optional(),
  host: z.string().optional(),
};

const wifiFields = {
  ssid: z.string().optional(),
  password: z.string().optional(),
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

/**
 * What the login form edits: the login fields without `type`, which the
 * caller adds when it builds the payload, and without the base fields no form
 * edits yet (`loginRecordFromForm` carries those over), so a form can't
 * overwrite them.
 */
export const loginFormSchema = loginRecordSchema.omit({
  type: true,
  favorite: true,
  tags: true,
  attachments: true,
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;
