import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import { useGetItem, encryptItem, useUpdateItem } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import styles from "./EditEntry.module.css";
import LoginItemForm from "../forms/LoginItemForm";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";

function Fallback() {
  return (
    <div className={styles.fallback}>
      <h1>Loading...</h1>
    </div>
  );
}

type EditItemInnerProps = {
  entryId: string;
};

function EditItemInner({ entryId }: EditItemInnerProps) {
  const [_, navigate] = useLocation();
  const { item: data, ready } = useGetItem(entryId);

  const { updateItem, updateItemError } = useUpdateItem({
    onSuccess: () => {
      navigate(`/${entrySlug}/${entryId}`);
    },
  });

  useEffect(() => {
    if (isDefined(updateItemError)) toast("Error saving");
  }, [updateItemError]);

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
    <LayoutOverlay>
      <LoginItemForm
        onSubmit={handleSubmit}
        serverError={updateItemError?.message}
        defaultValues={defaultValues}
        title="Edit Login"
        action="Save"
        cancelHref={`/${entrySlug}/${entryId}`}
      />
    </LayoutOverlay>
  );
}

export default function EditItem() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return <EditItemInner entryId={entryId} />;
}
