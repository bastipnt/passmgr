import { getLoginFieldSpecs, type LoginFieldGroup } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { useCopyField } from "../record-utils";
import { HistorySection } from "./HistorySection";
import LoginFieldDisplay from "./LoginFieldDisplay";
import { PasswordHealthPanel } from "./PasswordHealthPanel";

type LoginRecordFieldsProps = {
  record: DecryptedRecord;
};

// The title is the page heading, so it isn't repeated as a field.
const COLUMNS: { group: LoginFieldGroup; label: string }[][] = [
  [
    { group: "credentials", label: "Credentials" },
    { group: "extra", label: "Extra fields" },
  ],
  [
    { group: "websites", label: "Websites" },
    { group: "note", label: "Note" },
  ],
];

export function LoginRecordFields({ record }: LoginRecordFieldsProps) {
  const specs = getLoginFieldSpecs(record);
  const copyField = useCopyField();

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      {COLUMNS.map((column, i) => (
        <div key={i} className="flex flex-col gap-6">
          {column.map(({ group, label }) => {
            const groupSpecs = specs.filter((spec) => spec.group === group);
            if (groupSpecs.length === 0) return null;

            return (
              <section key={group} className="flex flex-col gap-2">
                <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                  {label}
                </h2>
                {/* Full-bleed rows on phones, like a native grouped list. */}
                <ItemDisplayGroup flushOnMobile>
                  {groupSpecs.map((spec) => (
                    <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
                  ))}
                </ItemDisplayGroup>
              </section>
            );
          })}
          {i === 1 && (
            <>
              <PasswordHealthPanel record={record} />
              <HistorySection record={record} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
