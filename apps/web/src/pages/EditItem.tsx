import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useContext, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC, SessionContext } from "@repo/client";
import { useLocalEntryByIdOptions } from "@/store/use-local-entries";
import { useLocalStore } from "@/store/store-provider";
import LayoutOverlay from "../layout/LayoutOverlay";
import styles from "./EditEntry.module.css";
import LoginItemForm from "../forms/LoginItemForm";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { decryptPayload, encryptPayload } from "@/utils/vault";
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
  const trpc = useTRPC();
  const { vaultReady } = useContext(SessionContext);
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const store = useLocalStore();

  const { data: encryptedItem } = useSuspenseQuery(useLocalEntryByIdOptions(entryId));

  if (!vaultReady) return <Fallback />;

  const data = {
    itemId: encryptedItem.itemId,
    version: encryptedItem.version,
    ...decryptPayload(encryptedItem.encryptedData, encryptedItem.encryptionNonce),
  };

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: async (result) => {
        await store?.localStore.upsertItems([result]);
        void queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
        navigate(`/${entrySlug}/${entryId}`);
      },
    }),
  );

  useEffect(() => {
    if (isDefined(mutationError)) toast("Error saving");
  }, [mutationError]);

  function handleSubmit(formValues: LoginItem) {
    const { encryptedData, encryptionNonce } = encryptPayload({
      schemaVersion: data.schemaVersion,
      ...formValues,
    });
    mutate({
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
        serverError={mutationError?.message}
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
