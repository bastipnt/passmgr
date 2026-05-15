import { useRecordsContext } from "../providers/RecordsProvider";
import type { DecryptedRecord } from "@repo/schema";

export function useGetRecords(): { records: DecryptedRecord[]; ready: boolean } {
  const { records, ready } = useRecordsContext();
  return { records, ready };
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
