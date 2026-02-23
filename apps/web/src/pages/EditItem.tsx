import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import styles from "./EditEntry.module.css";
import LoginItemForm from "../forms/LoginItemForm";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";

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
  const [_, navigate] = useLocation();
  const { data: initialData } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));

  const entryUrl = `/${entrySlug}/${entryId}`;

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: () => {
        navigate(entryUrl);
      },
    }),
  );

  const defaultValues = { ...initialData, id: entryId };

  useEffect(() => {
    if (isDefined(mutationError)) toast("Error saving");
  }, [mutationError]);

  return (
    // title={`Edit ${initialData.title}`}
    <LayoutOverlay>
      <LoginItemForm
        onSubmit={mutate}
        serverError={mutationError?.message}
        defaultValues={defaultValues}
        title="Edit Login"
        action="Save"
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
