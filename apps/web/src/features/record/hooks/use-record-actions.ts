import { useEditingContext } from "@features/record/providers/EditingProvider";
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
import { useLocation } from "wouter";

export function useRecordActions({ recordId }: { recordId: string }) {
  const { isOffline } = useContext(SessionContext);
  const { record, ready } = useGetRecord(recordId);
  const [, navigate] = useLocation();
  const { isEditing, setIsEditing, isEditSheetOpen, setIsEditSheetOpen } = useEditingContext();

  function handleEditSheetChange(open: boolean) {
    setIsEditSheetOpen(open);
    setIsEditing(open);
  }

  const { deleteRecord } = useDeleteRecord({
    onSuccess: () => {
      toast.success("Record deleted");
      navigate("/");
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

  function copyField(value: string | undefined, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

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

  useShortcut("$mod+Shift+c", () => copyField(record?.password, "Password"), {
    description: "Copy password",
    enabled: ready && !!record?.password && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+Shift+u", () => copyField(record?.username, "Username"), {
    description: "Copy username",
    enabled: ready && !!record?.username && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+e", () => handleEditSheetChange(true), {
    description: "Edit record",
    enabled: ready && !!record?.username && !isOffline && !isEditing,
    allowInInput: true,
  });

  return {
    handleEditSheetChange,
    deleteRecord,
    copyField,
    handleSubmit,
    record,
    ready,
    isEditing,
    isEditSheetOpen,
    updateRecordError,
  };
}
