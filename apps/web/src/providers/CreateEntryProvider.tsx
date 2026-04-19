import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { encryptItem, useCreateItem } from "@repo/client";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@repo/ui/components/Sheet";
import LoginItemForm from "@/forms/LoginItemForm";
import { entrySlug } from "@/data/routes";
import { useEditingContext } from "@/providers/EditingProvider";

type CreateEntryContextValue = {
  openCreateSheet: (title?: string) => void;
};

const CreateEntryContext = createContext<CreateEntryContextValue | null>(null);

export function useCreateEntryContext() {
  const ctx = useContext(CreateEntryContext);
  if (!ctx) throw new Error("useCreateEntryContext must be used within CreateEntryProvider");
  return ctx;
}

export default function CreateEntryProvider({ children }: { children: ReactNode }) {
  const [isCreating, setIsCreating] = useState(false);
  const [initialTitle, setInitialTitle] = useState<string | undefined>();
  const { setIsEditing } = useEditingContext();
  const [, navigate] = useLocation();

  const { createItem, createItemError } = useCreateItem({
    onSuccess: (itemId) => {
      handleCreatingChange(false);
      setInitialTitle(undefined);
      navigate(`/${entrySlug}/${itemId}`);
    },
  });

  function handleCreatingChange(open: boolean) {
    setIsCreating(open);
    setIsEditing(open);
  }

  useEffect(() => {
    if (isDefined(createItemError)) toast.error("Error saving");
  }, [createItemError]);

  function handleSubmit(formValues: LoginItem) {
    const itemId = crypto.randomUUID();
    const { encryptedData, encryptionNonce } = encryptItem({ schemaVersion: 1, ...formValues });
    createItem({
      itemId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  function openCreateSheet(title?: string) {
    setInitialTitle(title);
    handleCreatingChange(true);
  }

  return (
    <CreateEntryContext value={{ openCreateSheet }}>
      {children}
      <Sheet open={isCreating} onOpenChange={handleCreatingChange}>
        <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New Login</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <LoginItemForm
              onSubmit={handleSubmit}
              onCancel={() => handleCreatingChange(false)}
              serverError={createItemError?.message}
              defaultValues={initialTitle ? { title: initialTitle } : undefined}
              action="Create"
            />
          </div>
        </SheetContent>
      </Sheet>
    </CreateEntryContext>
  );
}
