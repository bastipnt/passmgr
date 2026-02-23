import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { entrySlug } from "../data/routes";
import { useTRPC } from "@repo/client";
import LayoutOverlay from "../layout/LayoutOverlay";
import LoginItemForm from "../forms/LoginItemForm";
import { useEffect } from "react";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";

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

  useEffect(() => {
    if (isDefined(mutationError)) toast("Error saving");
  }, [mutationError]);

  return (
    <LayoutOverlay>
      <LoginItemForm
        onSubmit={mutate}
        serverError={mutationError?.message}
        title="New Login"
        action="Create"
      />
    </LayoutOverlay>
  );
}
