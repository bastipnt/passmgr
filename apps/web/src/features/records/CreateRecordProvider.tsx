import { encryptRecord, useCreateRecord } from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginRecord } from "@repo/schema";
import { toast } from "@repo/ui";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { isDefined } from "@repo/util";
import { XIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { useEditingContext } from "./EditingProvider";
import LoginRecordForm, { type LoginRecordFormHandle } from "./login/LoginRecordForm";

type CreateRecordContextValue = {
  openCreateSheet: (title?: string) => void;
};

const CreateRecordContext = createContext<CreateRecordContextValue | null>(null);

export function useCreateRecordContext() {
  const ctx = useContext(CreateRecordContext);
  if (!ctx) throw new Error("useCreateRecordContext must be used within CreateRecordProvider");
  return ctx;
}

export default function CreateRecordProvider({ children }: { children: ReactNode }) {
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

  const { createRecord, createRecordError } = useCreateRecord({
    onSuccess: (recordId) => {
      handleCreatingChange(false);
      setInitialTitle(undefined);
      navigate(recordPaths.record(recordId));
    },
  });

  useEffect(() => {
    if (isDefined(createRecordError)) toast.error("Error saving");
  }, [createRecordError]);

  function handleSubmit(formValues: LoginRecord) {
    const recordId = crypto.randomUUID();
    const { encryptedData, encryptionNonce } = encryptRecord({ schemaVersion: 1, ...formValues });
    createRecord({
      recordId,
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

  function FormActions() {
    return (
      <div className="flex flex-row justify-between gap-4">
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
    <CreateRecordContext value={value}>
      {children}
      <ResponsiveSheet
        open={isCreating}
        onOpenChange={handleCreatingChange}
        title="New Login"
        actions={<FormActions />}
        sheetClassName="sm:max-w-3xl!"
      >
        <LoginRecordForm
          onSubmit={handleSubmit}
          onCancel={() => handleCreatingChange(false)}
          serverError={createRecordError?.message}
          defaultValues={initialTitle ? { title: initialTitle } : undefined}
          action="Create"
          ref={formRef}
        />
      </ResponsiveSheet>
    </CreateRecordContext>
  );
}
