import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useContext, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import {
  SessionContext,
  useGetItemByIdOptions,
  decryptItem,
  encryptItem,
  useUpdateItem,
} from "@repo/client";
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

type EditItemListProps = {
  entryId: string;
};

function EditItemInner({ entryId }: EditItemListProps) {
  const { vaultReady } = useContext(SessionContext);
  const [_, navigate] = useLocation();

  const { data: encryptedItem } = useSuspenseQuery(useGetItemByIdOptions(entryId));

  if (!vaultReady) return <Fallback />;

  const data = {
    itemId: encryptedItem.itemId,
    version: encryptedItem.version,
    ...decryptItem(encryptedItem.encryptedData, encryptedItem.encryptionNonce),
  };

  const { updateItem, updateItemError } = useUpdateItem({
    onSuccess: () => {
      navigate(`/${entrySlug}/${entryId}`);
    },
  });

  useEffect(() => {
    if (isDefined(updateItemError)) toast("Error saving");
  }, [updateItemError]);

  function handleSubmit(formValues: LoginItem) {
    const { encryptedData, encryptionNonce } = encryptItem({
      schemaVersion: data.schemaVersion,
      ...formValues,
    });
    updateItem({
      itemId: entryId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      version: data.version,
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

  return (
    <Suspense fallback={<Fallback />}>
      <EditItemInner entryId={entryId} />
    </Suspense>
  );
}
