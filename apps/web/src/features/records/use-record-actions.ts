import {
  encryptRecord,
  SessionContext,
  useDeleteRecord,
  useGetRecord,
  useShortcut,
  useUpdateRecord,
} from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginRecord } from "@repo/schema";
import { toast } from "@repo/ui";
import { isDefined } from "@repo/util";
import { useContext, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";

function copyField(value: string | undefined, label: string) {
  if (!value) return;
  void navigator.clipboard.writeText(value);
  toast.success(`${label} copied to clipboard`);
}

export function useRecordActions({ recordId }: { recordId: string }) {
  const { record, ready } = useGetRecord(recordId);
  const [, navigate] = useLocation();
  // The URL is the source of truth for whether the edit sheet is open, so
  // opening and closing it is navigation.
  const [isEditSheetOpen] = useRoute(recordPaths.edit);

  function handleEditSheetChange(open: boolean) {
    navigate(open ? recordPaths.editRecord(recordId) : recordPaths.record(recordId), {
      replace: true,
    });
  }

  const { deleteRecord } = useDeleteRecord({
    onSuccess: () => {
      toast.success("Record deleted");
      navigate(recordPaths.index);
    },
  });

  const { updateRecord, updateRecordError } = useUpdateRecord({
    onSuccess: () => {
      handleEditSheetChange(false);
      toast.success("Record saved");
    },
  });

  useEffect(() => {
    if (isDefined(updateRecordError)) toast.error("Error saving");
  }, [updateRecordError]);

  function handleSubmit(formValues: LoginRecord) {
    const { encryptedData, encryptionNonce } = encryptRecord({
      schemaVersion: record!.schemaVersion,
      ...formValues,
    });
    updateRecord({
      recordId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      version: record!.version,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  return {
    handleEditSheetChange,
    deleteRecord,
    copyField,
    handleSubmit,
    record,
    ready,
    isEditSheetOpen,
    updateRecordError,
  };
}

/**
 * Record-scoped shortcuts. Register these **once per screen** — `useRecordActions`
 * runs in several components at once, and registering there would mean the same
 * keys are claimed repeatedly with "last mounted wins" semantics.
 *
 * Suppression while a sheet is open is handled by `ShortcutLayer`, not by
 * `enabled` — `enabled` here only means "this action is impossible right now".
 */
export function useRecordShortcuts({ recordId }: { recordId: string }) {
  const { isOffline } = useContext(SessionContext);
  const { record, ready } = useGetRecord(recordId);
  const [, navigate] = useLocation();

  useShortcut("$mod+Shift+c", () => copyField(record?.password, "Password"), {
    description: "Copy password",
    enabled: ready && !!record?.password,
    allowInInput: true,
  });

  useShortcut("$mod+Shift+u", () => copyField(record?.username, "Username"), {
    description: "Copy username",
    enabled: ready && !!record?.username,
    allowInInput: true,
  });

  useShortcut("$mod+e", () => navigate(recordPaths.editRecord(recordId), { replace: true }), {
    description: "Edit record",
    enabled: ready && !!record?.username && !isOffline,
    allowInInput: true,
  });
}
