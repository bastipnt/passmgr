import {
  type DetailFieldSpec,
  monitoredPassword,
  noteSummary,
  previousSecretsTitle,
  recordDetailLayout,
  sshPrivateKeyFileName,
  usePreviousSecrets,
} from "@repo/client";
import { type DecryptedRecord, isRecordType } from "@repo/schema";
import {
  DetailCodeBlock,
  DetailField,
  DetailFieldGroup,
  DetailFieldRow,
} from "@repo/ui/complex-components/DetailField";
import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { Button } from "@repo/ui/components/Button";
import { websiteLink } from "@repo/util";
import {
  CopyIcon,
  DownloadIcon,
  EarthIcon,
  FileTextIcon,
  ListPlusIcon,
  MapPinIcon,
} from "lucide-react";
import { Fragment, type ReactNode, useMemo } from "react";
import { downloadFile } from "@/lib/download";
import FieldDisplay, { OpenLink, WebsiteRow } from "./FieldDisplay";
import { HistorySection } from "./HistorySection";
import { PasswordHealthLine } from "./PasswordHealthLine";
import { PreviousSecretsRow } from "./PreviousSecretsRow";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";
import { useCopyField } from "./record-utils";
import { WifiQrCode } from "./wifi/WifiQrCode";

type RecordDetailProps = {
  record: DecryptedRecord;
};

const mapsLink = (lines: string[]) =>
  `https://www.openstreetmap.org/search?query=${encodeURIComponent(lines.join(", "))}`;

/** A record at rest: its form's sections and pairs (`recordDetailLayout`), then version history. */
export function RecordDetail({ record }: RecordDetailProps) {
  const layout = useMemo(() => recordDetailLayout(record), [record]);
  const { previous } = usePreviousSecrets(record);
  const copyField = useCopyField();
  const TypeIcon = RECORD_TYPE_ICONS[record.type];
  const hasHealthLine = !!monitoredPassword(record);

  const fieldActions = (spec: DetailFieldSpec): ReactNode => {
    if (isRecordType(record, "ssh_key") && spec.key === "privateKey" && spec.value) {
      const privateKey = spec.value;
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Download private key"
          onClick={() =>
            downloadFile(sshPrivateKeyFileName(record.publicKey), privateKey, "text/plain")
          }
        >
          <DownloadIcon />
        </Button>
      );
    }
    if (isRecordType(record, "api_key") && spec.key === "host" && spec.value) {
      const { text, href } = websiteLink(spec.value);
      return href && <OpenLink href={href} label={`Open ${text}`} />;
    }
    return undefined;
  };

  const renderField = (spec: DetailFieldSpec) => (
    <FieldDisplay
      key={spec.key}
      spec={spec}
      onCopy={copyField}
      showShortcuts
      actions={fieldActions(spec)}
      className={spec.kind === "password" && hasHealthLine ? "border-b-0 pb-1" : undefined}
    />
  );

  const renderRows = (rows: DetailFieldSpec[][]) =>
    rows.map((row) => {
      const [only] = row;
      if (row.length === 1 && only) {
        if (only.block) {
          return (
            <div key={only.key} className="border-foreground/8 border-b py-2.5 dark:border-white/8">
              {renderField(only)}
            </div>
          );
        }
        return only.kind === "password" && hasHealthLine ? (
          <Fragment key={only.key}>
            {renderField(only)}
            <PasswordHealthLine record={record} />
          </Fragment>
        ) : (
          renderField(only)
        );
      }
      return (
        <DetailFieldRow
          key={row.map((spec) => spec.key).join()}
          // Three fields with their reveal and copy buttons don't fit a phone's width.
          keepOnPhone={row.length === 2 && row.every((spec) => spec.phoneShare)}
        >
          {row.map(renderField)}
        </DetailFieldRow>
      );
    });

  const noteSection = layout.note && (
    <DetailSection title="Note" icon={<FileTextIcon />}>
      <DetailCodeBlock
        key={record.recordId}
        copyLabel="note"
        onCopy={() => copyField(layout.note, "Note")}
        summary={layout.noteFirst ? noteSummary(layout.note) : undefined}
        concealable={layout.noteFirst}
        defaultConcealed={false}
      >
        {layout.note}
      </DetailCodeBlock>
    </DetailSection>
  );

  const [firstSection] = layout.sections;
  const ofExtraFields = previous.filter((spec) => spec.key.startsWith("custom:"));
  const ofFields = previous.filter((spec) => !spec.key.startsWith("custom:"));
  const fieldsPrevious = (
    <PreviousSecretsRow previous={ofFields} title={previousSecretsTitle(record.type)} />
  );
  const extraPrevious = <PreviousSecretsRow previous={ofExtraFields} title="Previous secrets" />;
  const hasExtraFields = layout.extraRows.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {layout.noteFirst && noteSection}
      {layout.sections.map((section) =>
        section.kind === "fields" ? (
          <DetailSection key={section.id} title={section.title} icon={<TypeIcon />}>
            <DetailFieldGroup>
              {renderRows(section.rows)}
              {section === firstSection && fieldsPrevious}
            </DetailFieldGroup>
          </DetailSection>
        ) : (
          <DetailSection
            key={section.id}
            title={section.title}
            icon={<MapPinIcon />}
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => copyField(section.lines.join("\n"), "Address")}
              >
                <CopyIcon />
                Copy address
              </Button>
            }
          >
            <DetailFieldGroup>
              <DetailField
                value={section.lines.join("\n")}
                multiline
                actions={<OpenLink href={mapsLink(section.lines)} label="Open in maps" />}
              />
            </DetailFieldGroup>
          </DetailSection>
        ),
      )}
      {isRecordType(record, "wifi") && <WifiQrCode record={record} />}
      {layout.websites && (
        <DetailSection title="Websites" icon={<EarthIcon />} count={layout.websites.length}>
          <DetailFieldGroup>
            {layout.websites.map((value, i) => (
              <WebsiteRow key={i} value={value} onCopy={copyField} />
            ))}
          </DetailFieldGroup>
        </DetailSection>
      )}
      {hasExtraFields && (
        <DetailSection
          title="Extra fields"
          icon={<ListPlusIcon />}
          count={layout.extraRows.flat().length}
        >
          <DetailFieldGroup>
            {renderRows(layout.extraRows)}
            {extraPrevious}
          </DetailFieldGroup>
        </DetailSection>
      )}
      {(!firstSection || !hasExtraFields) && (
        <DetailFieldGroup className="empty:hidden">
          {!firstSection && fieldsPrevious}
          {!hasExtraFields && extraPrevious}
        </DetailFieldGroup>
      )}
      {!layout.noteFirst && noteSection}
      <HistorySection record={record} />
    </div>
  );
}
