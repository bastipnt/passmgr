import { getStrengthFromString } from "@repo/crypto";
import type { DecryptedRecord, LoginRecord } from "@repo/schema";
import { ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
import {
  EarthIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  TagIcon,
  TextIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import TotpField from "./TotpField";

export type OnCopy = (value: string | undefined, label: string) => void;

/** The visual groups a login record's fields are bundled into, in render order. */
export const LOGIN_FIELD_GROUPS = ["title", "credentials", "websites", "note", "extra"] as const;

export type LoginFieldGroup = (typeof LOGIN_FIELD_GROUPS)[number];

export type LoginFieldKey = Exclude<keyof LoginRecord, "extra"> | `extra:${string}:${number}`;

/**
 * One rendered field of a login record, split from its layout so that both the
 * record view and the version diff can address fields individually.
 *
 * `key` identifies the same field across two revisions, `compare` is the
 * normalised value the diff tests for equality — never render `compare`, it is
 * only a comparison token.
 */
export type LoginFieldSpec = {
  key: LoginFieldKey;
  group: LoginFieldGroup;
  compare: string;
  render: (onCopy: OnCopy) => ReactNode;
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
      render: () => (
        <ItemDisplay title="Title" value={record.title} onClick={() => {}} icon={<TagIcon />} />
      ),
    });
  }

  specs.push({
    key: "username",
    group: "credentials",
    compare: record.username ?? "",
    render: (onCopy) => (
      <ItemDisplay
        title="Username"
        value={record.username}
        onClick={() => onCopy(record.username, "Username")}
        icon={<MailIcon />}
      />
    ),
  });

  specs.push({
    key: "password",
    group: "credentials",
    compare: record.password ?? "",
    render: (onCopy) => (
      <ItemDisplay
        title="Password"
        value={record.password}
        onClick={({ type }) => type === "copy" && onCopy(record.password, "Password")}
        icon={<KeyIcon />}
        variant={record.password ? "password" : "noAction"}
        strength={record.password ? getStrengthFromString(record.password) : undefined}
      />
    ),
  });

  if (isDefined(record.totp)) {
    const totp = record.totp;
    specs.push({
      key: "totp",
      group: "credentials",
      compare: totp,
      render: (onCopy) => <TotpField onCopy={onCopy} totpData={totp} />,
    });
  }

  if (isDefined(record.websites) && record.websites.length > 0) {
    const websites = record.websites;
    specs.push({
      key: "websites",
      group: "websites",
      compare: JSON.stringify(websites.map(({ value }) => value)),
      render: () => (
        <ItemDisplay
          title="Websites"
          value={
            <ul>
              {websites.map(({ value }, i) => (
                <li key={i}>
                  <Link target="_blank" href={value} className="p-0">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          }
          onClick={() => {}}
          icon={<EarthIcon />}
          variant="noAction"
        />
      ),
    });
  }

  if (isDefined(record.note) && record.note !== "") {
    const note = record.note;
    specs.push({
      key: "note",
      group: "note",
      compare: note,
      render: () => (
        <ItemDisplay
          title="Notes"
          value={<span className="wrap-break-word whitespace-pre-line">{note}</span>}
          onClick={() => {}}
          icon={<NotebookPenIcon />}
          variant="noAction"
        />
      ),
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
        render: (onCopy) => (
          <ItemDisplay
            title={extraField.title}
            value={extraField.value}
            onClick={({ type }) => type === "copy" && onCopy(extraField.value, extraField.title)}
            icon={extraField.type === "secret" ? <LockIcon /> : <TextIcon />}
            variant={extraField.type === "secret" ? "hidden" : "default"}
          />
        ),
      });
    }
  }

  return specs;
}
