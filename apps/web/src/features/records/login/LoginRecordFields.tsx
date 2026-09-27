import { getLoginFieldSpecs, type LoginFieldGroup } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import { toLocalDateStr } from "@repo/util";
import { CalendarPlusIcon, HistoryIcon, PenLineIcon } from "lucide-react";
import { recordPaths } from "@/app/route-paths";
import { useCopyField } from "../record-utils";
import LoginFieldDisplay from "./LoginFieldDisplay";

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
    <div className="flex flex-col gap-6">
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
                  <ItemDisplayGroup>
                    {groupSpecs.map((spec) => (
                      <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
                    ))}
                  </ItemDisplayGroup>
                </section>
              );
            })}
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-foreground/8 border-t pt-4 text-muted-foreground text-sm dark:border-white/8">
        <span className="flex items-center gap-1.5">
          <PenLineIcon className="size-4" aria-hidden />
          Last changed {toLocalDateStr(record.clientUpdatedAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarPlusIcon className="size-4" aria-hidden />
          Created {toLocalDateStr(record.firstCreatedAt)}
        </span>
        <Link
          variant="outline"
          size="sm"
          className="ml-auto"
          href={recordPaths.recordVersions(record.recordId)}
        >
          <HistoryIcon />
          Version history
        </Link>
      </footer>
    </div>
  );
}
