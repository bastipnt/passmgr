import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { entrySlug } from "../data/routes";
import { encryptItem, useStore, useTRPC } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import LoginItemForm from "../forms/LoginItemForm";
import { useEffect } from "react";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";

export default function NewItem() {
  const trpc = useTRPC();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const store = useStore();

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.create.mutationOptions({
      onSuccess: async (result) => {
        await store.vault.upsertItems([result]);
        await queryClient.invalidateQueries({ queryKey: ["entry"], exact: false });
        navigate(`/${entrySlug}/${result.itemId}`);
      },
    }),
  );

  useEffect(() => {
    if (isDefined(mutationError)) toast("Error saving");
  }, [mutationError]);

  function handleSubmit(formValues: LoginItem) {
    const itemId = crypto.randomUUID();
    const { encryptedData, encryptionNonce } = encryptItem({ schemaVersion: 1, ...formValues });
    mutate({
      itemId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  return (
    <LayoutOverlay>
      <LoginItemForm
        onSubmit={handleSubmit}
        serverError={mutationError?.message}
        title="New Login"
        action="Create"
      />
    </LayoutOverlay>
  );
}
