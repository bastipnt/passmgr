import type { DecryptedRecord } from "@repo/schema";
import { RecordDetail } from "./RecordDetail";
import VersionsSheet from "./versions/VersionsSheet";

type RecordProps = {
  record: DecryptedRecord;
};

export default function Record({ record }: RecordProps) {
  return (
    <>
      <RecordDetail record={record} />
      <VersionsSheet />
    </>
  );
}
