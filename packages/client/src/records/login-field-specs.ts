import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import { isDefined } from "@repo/util";

/** The visual groups a login record's fields are bundled into, in render order. */
export const LOGIN_FIELD_GROUPS = ["title", "credentials", "websites", "note", "extra"] as const;

export type LoginFieldGroup = (typeof LOGIN_FIELD_GROUPS)[number];

export type LoginFieldKey =
  | Exclude<keyof LoginRecord, "extraFields" | "category">
  | `extra:${string}:${number}`;

/**
 * Which control renders this field. The spec list is shared across platforms,
 * so it names the kind of field rather than a component — each app maps the
 * kind to its own display component.
 */
export type LoginFieldKind =
  | "title"
  | "username"
  | "password"
  | "totp"
  | "websites"
  | "note"
  | "extra-text"
  | "extra-secret";

/**
 * One field of a login record, described as data so that the record view, the
 * version diff, and both platforms can address fields individually.
 *
 * `key` identifies the same field across two revisions, `compare` is the
 * normalised value the diff tests for equality — never render `compare`, it is
 * only a comparison token.
 */
export type LoginFieldSpec = {
  key: LoginFieldKey;
  group: LoginFieldGroup;
  compare: string;
  kind: LoginFieldKind;
  /** Visible field name: a fixed label, or an extra field's own title. */
  label: string;
  /** Single value. Absent for `kind: "websites"`. */
  value?: string;
  /** Only for `kind: "websites"`. */
  values?: string[];
};

type GetLoginFieldSpecsOptions = {
  /**
   * Prepend the record's title. The record view keeps it out (the title is
   * already the page heading); the diff wants it so renames stay visible.
   */
  includeTitle?: boolean;
};

export function getLoginFieldSpecs(
  record: DecryptedRecord,
  { includeTitle = false }: GetLoginFieldSpecsOptions = {},
): LoginFieldSpec[] {
  const specs: LoginFieldSpec[] = [];

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

  specs.push({
    key: "username",
    group: "credentials",
    compare: record.username ?? "",
    kind: "username",
    label: "Username",
    value: record.username,
  });

  specs.push({
    key: "password",
    group: "credentials",
    compare: record.password ?? "",
    kind: "password",
    label: "Password",
    value: record.password,
  });

  if (isDefined(record.totp)) {
    specs.push({
      key: "totp",
      group: "credentials",
      compare: record.totp,
      kind: "totp",
      label: "2FA token (TOTP)",
      value: record.totp,
    });
  }

  if (isDefined(record.websites) && record.websites.length > 0) {
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

  if (isDefined(record.extraFields) && record.extraFields.length > 0) {
    // Titles are the natural identity of an extra field, but they are not
    // unique — count occurrences so duplicates still pair up positionally.
    const seen = new Map<string, number>();

    for (const extraField of record.extraFields) {
      const occurrence = seen.get(extraField.title) ?? 0;
      seen.set(extraField.title, occurrence + 1);

      specs.push({
        key: `extra:${extraField.title}:${occurrence}`,
        group: "extra",
        compare: `${extraField.type} ${extraField.value}`,
        kind: extraField.type === "secret" ? "extra-secret" : "extra-text",
        label: extraField.title,
        value: extraField.value,
      });
    }
  }

  return specs;
}
