import { useMutation } from "@tanstack/react-query";
import { Toast } from "@repo/ui/toast";
import { useLocation } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import PassItemForm from "../forms/PassItemForm";

export default function NewItem() {
  const trpc = useTRPC();
  const [_, navigate] = useLocation();

  // TODO: get entry id from server
  const entryUrl = `/${entrySlug}/111`;

  const { mutate, error: mutationError } = useMutation(
    trpc.entry.update.mutationOptions({
      onSuccess: () => {
        navigate(entryUrl);
      },
    }),
  );

  return (
    <LayoutOverlay title={`New Item`}>
      <PassItemForm onSubmit={mutate} serverError={mutationError?.message} />
      <Toast
        message={mutationError ? "Error saving" : ""}
        isOpen={!!mutationError}
        onClose={() => {}}
      />
    </LayoutOverlay>
  );
}
