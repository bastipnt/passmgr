import { type FieldGroup, getRecordFieldSpecs, RECORD_TYPE_LABELS } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { DetailCodeBlock, DetailFieldGroup } from "@repo/ui/complex-components/DetailField";
import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { EarthIcon, FileTextIcon, ListPlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { RECORD_TYPE_ICONS } from "../RecordAvatar";
import { useCopyField } from "../record-utils";
import { HistorySection } from "./HistorySection";
import LoginFieldDisplay, { WebsiteRow } from "./LoginFieldDisplay";
import { PasswordHealthPanel } from "./PasswordHealthPanel";
import { PreviousSecretsSection } from "./PreviousSecretsSection";

type LoginRecordFieldsProps = {
  record: DecryptedRecord;
  /** Type-specific extras above the previous secrets (a Wi-Fi's QR code). */
  extra?: ReactNode;
};

export function LoginRecordFields({ record, extra }: LoginRecordFieldsProps) {
  const specs = getRecordFieldSpecs(record, { includeDerived: true });
  const copyField = useCopyField();
  const TypeIcon = RECORD_TYPE_ICONS[record.type];
  const inGroup = (group: FieldGroup) => specs.filter((spec) => spec.group === group);

  const fields = inGroup("fields");
  const [websites] = inGroup("websites");
  const [note] = inGroup("note");
  const custom = inGroup("custom");

  return (
    <div className="flex flex-col gap-8">
      {fields.length > 0 && (
        <DetailSection title={RECORD_TYPE_LABELS[record.type].fields} icon={<TypeIcon />}>
          <DetailFieldGroup>
            {fields.map((spec) => (
              <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} showShortcuts />
            ))}
          </DetailFieldGroup>
        </DetailSection>
      )}
      <PasswordHealthPanel record={record} />
      {websites?.values && (
        <DetailSection title="Websites" icon={<EarthIcon />} count={websites.values.length}>
          <DetailFieldGroup>
            {websites.values.map((value, i) => (
              <WebsiteRow key={i} value={value} onCopy={copyField} />
            ))}
          </DetailFieldGroup>
        </DetailSection>
      )}
      {note?.value && (
        <DetailSection title="Note" icon={<FileTextIcon />}>
          <DetailCodeBlock copyLabel="note" onCopy={() => copyField(note.value, "Note")}>
            {note.value}
          </DetailCodeBlock>
        </DetailSection>
      )}
      {custom.length > 0 && (
        <DetailSection title="Extra fields" icon={<ListPlusIcon />} count={custom.length}>
          <DetailFieldGroup>
            {custom.map((spec) => (
              <LoginFieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
            ))}
          </DetailFieldGroup>
        </DetailSection>
      )}
      {extra}
      <PreviousSecretsSection record={record} />
      <HistorySection record={record} />
    </div>
  );
}
