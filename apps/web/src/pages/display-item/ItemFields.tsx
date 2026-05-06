import { Fragment } from "react";
import { EarthIcon, KeyIcon, LockIcon, MailIcon, NotebookPenIcon, TextIcon } from "lucide-react";
import { Separator } from "@repo/ui/components/Separator";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
import { getStrengthFromString } from "@repo/crypto";
import type { LoginItem } from "@repo/schema";

type Totp = {
  token: string | undefined;
  progress: number | undefined;
  seconds: number | undefined;
};

type ItemFieldsProps = {
  data: LoginItem;
  totp: Totp;
  onCopy: (value: string | undefined, label: string) => void;
};

export function ItemFields({ data, totp, onCopy }: ItemFieldsProps) {
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

        {isDefined(data.totp) && totp.token && (
          <>
            <Separator />

            <ItemDisplay
              title="2FA token (TOTP)"
              value={totp.token}
              onClick={() => onCopy(totp.token, "2FA token")}
              icon={<LockIcon />}
              actions={
                <CircleProgress progress={totp.progress ?? 0}>{totp.seconds}</CircleProgress>
              }
            />
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
