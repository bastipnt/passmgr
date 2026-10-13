import { previousSecretsTitle, usePreviousSecrets } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemDisplayGroup } from "@repo/ui/complex-components/ItemDisplay";
import { useCopyField } from "../record-utils";
import LoginFieldDisplay from "./LoginFieldDisplay";

export function PreviousSecretsSection({ record }: { record: DecryptedRecord }) {
  const { previous } = usePreviousSecrets(record);
  const copyField = useCopyField();
  if (previous.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        {previousSecretsTitle(record.type)}
      </h2>
      <ItemDisplayGroup flushOnMobile>
        {previous.map((spec) => (
          <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
        ))}
      </ItemDisplayGroup>
    </section>
  );
}
