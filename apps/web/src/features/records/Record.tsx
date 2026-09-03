import type { DecryptedRecord } from "@repo/schema";
import VersionsSheet from "@/features/records/versions/VersionsSheet";
import EditRecordSheet from "./EditRecordSheet";
import { LoginRecordFields } from "./login/LoginRecordFields";

type RecordProps = {
  record: DecryptedRecord;
};

export default function Record({ record }: RecordProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <LoginRecordFields record={record} />

      {/* Sheets: */}
      <EditRecordSheet record={record} />
      <VersionsSheet />
    </div>
  );
}
