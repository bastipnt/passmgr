import type { DecryptedRecord } from "@repo/schema";
import { useEffect, useEffectEvent } from "react";
import { useGetRecord } from "./use-records";

/** The record a create form copies (`recordId`); `onGone` once it isn't there (deleted, synced away). */
export function useDuplicateSource(
  recordId: string | null | undefined,
  onGone: () => void,
): DecryptedRecord | undefined {
  const { record, ready } = useGetRecord(recordId ?? "");
  const gone = Boolean(recordId) && ready && !record;
  const handleGone = useEffectEvent(onGone);
  useEffect(() => {
    if (gone) handleGone();
  }, [gone]);
  return record;
}
