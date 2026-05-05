import {
  SessionContext,
  useGetItem,
  useShortcut,
  useDeleteItem,
  useUpdateItem,
  encryptItem,
} from "@repo/client";
import { useContext, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useTotp } from "@/hooks/totp-hook";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";
import { useEditingContext } from "@/providers/EditingProvider";
import { Fallback } from "./display-item/Fallback";
import { HeaderActions } from "./display-item/HeaderActions";
import { ItemFields } from "./display-item/ItemFields";
import { EditSheet } from "./display-item/EditSheet";

type DisplayItemProps = {
  entryId: string;
};

// TODO: rename entryId
function DisplayItemInner({ entryId }: DisplayItemProps) {
  const { isOffline } = useContext(SessionContext);
  const { item: data, ready } = useGetItem(entryId);
  const [, navigate] = useLocation();
  const { progress, seconds, token } = useTotp(data?.totp);
  const { isEditing, setIsEditing } = useEditingContext();
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  function handleEditSheetChange(open: boolean) {
    setIsEditSheetOpen(open);
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

  if (!ready || !data) return <Fallback />;

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

  const defaultValues: Partial<LoginItem> = {
    title: data.title,
    username: data.username,
    password: data.password,
    totp: data.totp,
    websites: data.websites,
    note: data.note,
    extraFields: data.extraFields,
  };

  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <HeaderActions
        title={data.title}
        isOffline={isOffline}
        onEdit={() => handleEditSheetChange(true)}
        onDelete={() => deleteItem(entryId)}
      />

      <ItemFields data={data} totp={{ token, progress, seconds }} onCopy={copyField} />

      <EditSheet
        open={isEditSheetOpen}
        onOpenChange={handleEditSheetChange}
        defaultValues={defaultValues}
        serverError={updateItemError?.message}
        onSubmit={handleSubmit}
        onDelete={() => deleteItem(entryId)}
      />
    </div>
  );
}

export default function DisplayItem() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return <DisplayItemInner entryId={entryId} />;
}
