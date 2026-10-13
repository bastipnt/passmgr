import { type DecryptedRecord, isRecordType } from "@repo/schema";
import { websiteHost } from "@repo/util";

/** The hosts of a login's websites (`websiteHost`); none for other record types. */
export function loginHosts(record: DecryptedRecord): string[] {
  if (!isRecordType(record, "login")) return [];
  return (record.websites ?? []).flatMap(({ value }) => websiteHost(value) ?? []);
}
