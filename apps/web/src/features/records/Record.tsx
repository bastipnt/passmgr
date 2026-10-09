import type { DecryptedRecord } from "@repo/schema";
import VersionsSheet from "@/features/records/versions/VersionsSheet";
import EditRecordSheet from "./EditRecordSheet";
import { LoginRecordFields } from "./login/LoginRecordFields";
import { WifiQrCode } from "./wifi/WifiQrCode";

type RecordProps = {
  record: DecryptedRecord;
};

export default function Record({ record }: RecordProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4">
      <LoginRecordFields
        record={record}
        extra={record.type === "wifi" ? <WifiQrCode record={record} /> : undefined}
      />

      {/* Sheets: */}
      <EditRecordSheet record={record} />
      <VersionsSheet />
    </div>
  );
}
