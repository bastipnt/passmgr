import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { Toast } from "@repo/ui/toast";
import { useLocation, useParams } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import styles from "./EditEntry.module.css";
import PassItemForm from "../forms/PassItemForm";

function Fallback() {
  return (
    <div className={styles.fallback}>
      <h1>Loading...</h1>
    </div>
  );
}

type EditEntryListProps = {
  entryId: string;
};

function EditEntryChild({ entryId }: EditEntryListProps) {
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

  return (
    <LayoutOverlay title={`Edit ${initialData.title}`}>
      <PassItemForm
        onSubmit={mutate}
        serverError={mutationError?.message}
        defaultValues={defaultValues}
      />
      <Toast
        message={mutationError ? "Error saving" : ""}
        isOpen={!!mutationError}
        onClose={() => {}}
      />
    </LayoutOverlay>
  );
}

export default function EditEntry() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return (
    <Suspense fallback={<Fallback />}>
      <EditEntryChild entryId={entryId} />
    </Suspense>
  );
}
