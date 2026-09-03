import { getLoginFieldSpecs, LOGIN_FIELD_GROUPS } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { Separator } from "@repo/ui/components/Separator";
import { toLocalDateStr } from "@repo/util";
import { Pen, Rocket, Wand } from "lucide-react";
import { Fragment } from "react";
import { copyField } from "../record-utils";
import LoginFieldDisplay from "./LoginFieldDisplay";

type LoginRecordFieldsProps = {
  record: DecryptedRecord;
};

export function LoginRecordFields({ record }: LoginRecordFieldsProps) {
  const specs = getLoginFieldSpecs(record);

  return (
    <>
      {LOGIN_FIELD_GROUPS.map((group) => {
        const groupSpecs = specs.filter((spec) => spec.group === group);
        if (groupSpecs.length === 0) return null;

        return (
          <ItemDisplayGroup key={group}>
            {groupSpecs.map((spec, i) => (
              <Fragment key={spec.key}>
                {i > 0 && <Separator />}
                <LoginFieldDisplay spec={spec} onCopy={copyField} />
              </Fragment>
            ))}
          </ItemDisplayGroup>
        );
      })}

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
