import { useEditingContext } from "@/providers/EditingProvider";
import {
  encryptItem,
  SessionContext,
  useDeleteItem,
  useGetItem,
  useShortcut,
  useUpdateItem,
} from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";
import { toast } from "@repo/ui";
import { isDefined } from "@repo/util";
import { useContext, useEffect } from "react";
import { useLocation } from "wouter";

export function useRecordActions({ entryId }: { entryId: string }) {
  const { isOffline } = useContext(SessionContext);
  const { item: data, ready } = useGetItem(entryId);
  const [, navigate] = useLocation();
  const { isEditing, setIsEditing } = useEditingContext();

  function handleEditSheetChange(open: boolean) {
    setIsEditing(open);
  }

  const { deleteItem } = useDeleteItem({
    onSuccess: () => {
      toast.success("Item deleted");
      navigate("/");
    },
  });

  const { updateItem, updateItemError } = useUpdateItem({
    onSuccess: () => {
      handleEditSheetChange(false);
      toast.success("Item saved");
    },
  });

  useEffect(() => {
    if (isDefined(updateItemError)) toast.error("Error saving");
  }, [updateItemError]);

  function copyField(value: string | undefined, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

  function handleSubmit(formValues: LoginItem) {
    const { encryptedData, encryptionNonce } = encryptItem({
      schemaVersion: data!.schemaVersion,
      ...formValues,
    });
    updateItem({
      itemId: entryId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      version: data!.version,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  useShortcut("$mod+Shift+c", () => copyField(data?.password, "Password"), {
    description: "Copy password",
    enabled: ready && !!data?.password && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+Shift+u", () => copyField(data?.username, "Username"), {
    description: "Copy username",
    enabled: ready && !!data?.username && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+e", () => handleEditSheetChange(true), {
    description: "Edit item",
    enabled: ready && !!data?.username && !isOffline && !isEditing,
    allowInInput: true,
  });

  return {
    handleEditSheetChange,
    deleteItem,
    copyField,
    handleSubmit,
    data,
    ready,
    isEditing,
    updateItemError,
  };
}
