import type { DecryptedRecord } from "@repo/schema";
import EditRecordSheet from "./EditRecordSheet";
import { LoginRecordFields } from "./login/LoginRecordFields";
import VersionsSheet from "./versions/VersionsSheet";
import { WifiQrCode } from "./wifi/WifiQrCode";

type RecordProps = {
  record: DecryptedRecord;
};

export default function Record({ record }: RecordProps) {
  return (
    <>
      <LoginRecordFields
        record={record}
        extra={record.type === "wifi" ? <WifiQrCode record={record} /> : undefined}
      />

      <EditRecordSheet record={record} />
      <VersionsSheet />
    </>
  );
}
