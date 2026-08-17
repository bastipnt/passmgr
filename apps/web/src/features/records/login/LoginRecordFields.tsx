import TotpField from "@features/login-record/components/TotpField";
import { getStrengthFromString } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplay, ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import { Separator } from "@repo/ui/components/Separator";
import { isDefined, toLocalDateStr } from "@repo/util";
import {
  EarthIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  Pen,
  Rocket,
  TextIcon,
  Wand,
} from "lucide-react";
import { Fragment } from "react";

type LoginRecordFieldsProps = {
  record: DecryptedRecord;
  onCopy: (value: string | undefined, label: string) => void;
};

export function LoginRecordFields({ record, onCopy }: LoginRecordFieldsProps) {
  return (
    <>
      <ItemDisplayGroup>
        <ItemDisplay
          title="Username"
          value={record.username}
          onClick={() => onCopy(record.username, "Username")}
          icon={<MailIcon />}
        />

        <Separator />

        <ItemDisplay
          title="Password"
          value={record.password}
          onClick={({ type }) => type === "copy" && onCopy(record.password, "Password")}
          icon={<KeyIcon />}
          variant={record.password ? "password" : "noAction"}
          strength={record.password ? getStrengthFromString(record.password) : undefined}
        />

        {isDefined(record.totp) && (
          <>
            <Separator />

            <TotpField onCopy={onCopy} totpData={record.totp} />
          </>
        )}
      </ItemDisplayGroup>

      {isDefined(record.websites) && record.websites.length > 0 && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Websites"
            value={
              <ul>
                {record.websites.map(({ value }, i) => (
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
        </ItemDisplayGroup>
      )}

      {isDefined(record.note) && record.note !== "" && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Notes"
            value={<span className="wrap-break-word whitespace-pre-line">{record.note}</span>}
            onClick={() => {}}
            icon={<NotebookPenIcon />}
            variant="noAction"
          />
        </ItemDisplayGroup>
      )}

      {isDefined(record.extraFields) && record.extraFields.length > 0 && (
        <ItemDisplayGroup>
          {record.extraFields.map((extraField, i) => (
            <Fragment key={i}>
              <ItemDisplay
                title={extraField.title}
                value={extraField.value}
                onClick={({ type }) =>
                  type === "copy" && onCopy(extraField.value, extraField.title)
                }
                icon={extraField.type === "secret" ? <LockIcon /> : <TextIcon />}
                variant={extraField.type === "secret" ? "hidden" : "default"}
              />
              {i < record.extraFields!.length - 1 && <Separator />}
            </Fragment>
          ))}
        </ItemDisplayGroup>
      )}

      <ul className="flex flex-col gap-1">
        <li className="flex flex-row items-center gap-2 text-muted">
          <Wand size={20} />
          <p>Date last used: TBA</p>
        </li>
        <li className="flex flex-row items-center gap-2 text-muted">
          <Pen size={20} />
          <p>Date last changed: {toLocalDateStr(record.clientUpdatedAt)}</p>
        </li>
        <li className="flex flex-row items-center gap-2 text-muted">
          <Rocket size={20} />
          <p>Date created: {toLocalDateStr(record.firstCreatedAt)}</p>
        </li>
      </ul>
    </>
  );
}
