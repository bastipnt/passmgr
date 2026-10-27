import type { DecryptedRecord } from "@repo/schema";
import EditRecordSheet from "./EditRecordSheet";
import { RecordDetail } from "./RecordDetail";
import VersionsSheet from "./versions/VersionsSheet";

type RecordProps = {
  record: DecryptedRecord;
};

export default function Record({ record }: RecordProps) {
  return (
    <>
      <RecordDetail record={record} />

      <EditRecordSheet record={record} />
      <VersionsSheet />
    </>
  );
}
