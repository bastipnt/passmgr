import type { LoginFormValues, LoginRecord, RecordData } from "@repo/schema";

/**
 * Whether the record has an edit form. Only logins do so far: saving another
 * type through the login form would turn it into a login and drop its fields.
 */
export function hasEditForm(record: RecordData): boolean {
  return record.type === "login";
}

/**
 * The record data to save after an edit through the login form. The form only
 * holds some of a record's fields, so the ones it doesn't edit (favourite,
 * tags, attachments) are carried over from the current version. Refuses to
 * edit a record of another type (see `hasEditForm`).
 */
export function loginRecordFromForm(values: LoginFormValues, current?: RecordData): LoginRecord {
  if (current && !hasEditForm(current)) {
    throw new Error(`A ${current.type} record can't be saved through the login form`);
  }
  return {
    favorite: current?.favorite,
    tags: current?.tags,
    attachments: current?.attachments,
    ...values,
    type: "login",
  };
}

/** The login form's initial values for editing `record`. */
export function loginFormDefaults(record: RecordData): Partial<LoginFormValues> {
  const defaults: Partial<LoginFormValues> = {
    title: record.title,
    note: record.note,
    customFields: record.customFields,
  };
  if (record.type !== "login") return defaults;
  return {
    ...defaults,
    username: record.username,
    password: record.password,
    totp: record.totp,
    websites: record.websites,
  };
}
