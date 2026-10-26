import { previousSecretsTitle, usePreviousSecrets } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { DetailFieldGroup } from "@repo/ui/complex-components/DetailField";
import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { KeyRoundIcon } from "lucide-react";
import { useCopyField } from "../record-utils";
import LoginFieldDisplay from "./LoginFieldDisplay";

export function PreviousSecretsSection({ record }: { record: DecryptedRecord }) {
  const { previous } = usePreviousSecrets(record);
  const copyField = useCopyField();
  if (previous.length === 0) return null;

  return (
    <DetailSection
      title={previousSecretsTitle(record.type)}
      icon={<KeyRoundIcon />}
      count={previous.length}
    >
      <DetailFieldGroup>
        {previous.map((spec) => (
          <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
        ))}
      </DetailFieldGroup>
    </DetailSection>
  );
}
