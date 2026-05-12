import { Fragment } from "react";
import { EarthIcon, KeyIcon, LockIcon, MailIcon, NotebookPenIcon, TextIcon } from "lucide-react";
import { Separator } from "@repo/ui/components/Separator";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
import { getStrengthFromString } from "@repo/crypto";
import type { LoginItem } from "@repo/schema";
import TotpField from "@features/login-record/components/TotpField";

type LoginRecordFieldsProps = {
  data: LoginItem;
  onCopy: (value: string | undefined, label: string) => void;
};

export function LoginRecordFields({ data, onCopy }: LoginRecordFieldsProps) {
  return (
    <>
      <ItemDisplayGroup>
        <ItemDisplay
          title="Username"
          value={data.username}
          onClick={() => onCopy(data.username, "Username")}
          icon={<MailIcon />}
        />

        <Separator />

        <ItemDisplay
          title="Password"
          value={data.password}
          onClick={({ type }) => type === "copy" && onCopy(data.password, "Password")}
          icon={<KeyIcon />}
          variant={data.password ? "password" : "noAction"}
          strength={data.password ? getStrengthFromString(data.password) : undefined}
        />

        {isDefined(data.totp) && (
          <>
            <Separator />

            <TotpField onCopy={onCopy} totpData={data.totp} />
          </>
        )}
      </ItemDisplayGroup>

      {isDefined(data.websites) && data.websites.length > 0 && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Websites"
            value={
              <ul>
                {data.websites.map(({ value }, i) => (
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

      {isDefined(data.note) && data.note !== "" && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Notes"
            value={<span className="whitespace-pre-line wrap-break-word">{data.note}</span>}
            onClick={() => {}}
            icon={<NotebookPenIcon />}
            variant="noAction"
          />
        </ItemDisplayGroup>
      )}

      {isDefined(data.extraFields) && data.extraFields.length > 0 && (
        <ItemDisplayGroup>
          {data.extraFields.map((extraField, i) => (
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
              {i < data.extraFields!.length - 1 && <Separator />}
            </Fragment>
          ))}
        </ItemDisplayGroup>
      )}
    </>
  );
}
