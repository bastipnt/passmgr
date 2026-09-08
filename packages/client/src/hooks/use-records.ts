import type { DecryptedRecord } from "@repo/schema";
import { useMemo } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";

export function useGetRecords(): {
  records: DecryptedRecord[];
  ready: boolean;
  recordsNumber: number;
} {
  const { records, ready } = useRecordsContext();
  const recordsNumber = useMemo(() => records.length, [records]);
  return { records, ready, recordsNumber };
}

export function useGetRecord(recordId: string): {
  record: DecryptedRecord | undefined;
  ready: boolean;
} {
  const { getRecord, ready } = useRecordsContext();
  return { record: getRecord(recordId), ready };
}

export function useRefreshRecord(): (id: string) => Promise<void> {
  return useRecordsContext().refreshRecord;
}
