import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { encryptItem, useCreateItem } from "@repo/client";
import { isDefined } from "@repo/util";
import { toast } from "@repo/ui";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import { entrySlug } from "@/data/routes";
import { useEditingContext } from "@/providers/EditingProvider";
import { useIsMobile } from "@/hooks/use-is-mobile";
import LoginRecordForm, {
  type LoginRecordFormHandle,
} from "@features/login-record/forms/LoginRecordForm";
import { Drawer, DrawerActions, DrawerContent, DrawerPopup } from "@repo/ui/components/Drawer";
import { Button } from "@repo/ui/components/Button";
import { XIcon } from "lucide-react";

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
  const isMobile = useIsMobile();
  const formRef = useRef<LoginRecordFormHandle>(null);

  const handleCreatingChange = useCallback(
    (open: boolean) => {
      setIsCreating(open);
      setIsEditing(open);
    },
    [setIsEditing],
  );

  const { createItem, createItemError } = useCreateItem({
    onSuccess: (itemId) => {
      handleCreatingChange(false);
      setInitialTitle(undefined);
      navigate(`/${entrySlug}/${itemId}`);
    },
  });

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

  const openCreateSheet = useCallback(
    (title?: string) => {
      setInitialTitle(title);
      handleCreatingChange(true);
    },
    [handleCreatingChange],
  );

  const value = useMemo(() => ({ openCreateSheet }), [openCreateSheet]);

  function LoginRecordFormWrapper() {
    return (
      <LoginRecordForm
        onSubmit={handleSubmit}
        onCancel={() => handleCreatingChange(false)}
        serverError={createItemError?.message}
        defaultValues={initialTitle ? { title: initialTitle } : undefined}
        action="Create"
        ref={formRef}
      />
    );
  }

  function FormActions() {
    return (
      <div className="flex flex-row gap-4 justify-between">
        {isMobile && (
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setIsCreating(false)}
          >
            <XIcon />
          </Button>
        )}

        <div className="flex flex-row gap-4">
          {!isMobile && (
            <Button variant="secondary" type="button" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          )}
          <Button onClick={() => formRef.current?.triggerSubmit()}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <CreateEntryContext value={value}>
      {children}
      {isMobile ? (
        <Drawer open={isCreating} onOpenChange={handleCreatingChange}>
          <DrawerPopup>
            <DrawerActions>
              <FormActions />
            </DrawerActions>
            <DrawerContent>
              <LoginRecordFormWrapper />
            </DrawerContent>
          </DrawerPopup>
        </Drawer>
      ) : (
        <Sheet open={isCreating} onOpenChange={handleCreatingChange}>
          <SheetContent side="right" className="sm:max-w-3xl!">
            <SheetHeader>
              <SheetTitle>New Login</SheetTitle>
            </SheetHeader>

            <div className="p-4">
              <LoginRecordFormWrapper />
            </div>

            <SheetFooter>
              <FormActions />
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </CreateEntryContext>
  );
}
