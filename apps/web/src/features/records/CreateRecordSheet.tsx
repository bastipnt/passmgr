import { encryptRecord, ShortcutLayer, useCreateRecord } from "@repo/client";
import { CURRENT_CRYPTO_VERSION, type LoginRecord } from "@repo/schema";
import { toast } from "@repo/ui";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { isDefined } from "@repo/util";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import LoginRecordForm, { type LoginRecordFormHandle } from "./login/LoginRecordForm";

/**
 * Href that opens the create sheet over whatever is currently in view,
 * optionally prefilling the title. The sheet is a URL mode, so entry points are
 * links — which also makes ⌘-click and middle-click work.
 */
export function createSheetSearch(title?: string) {
  const trimmed = title?.trim();
  return `?${new URLSearchParams({ [recordPaths.createParam]: trimmed ?? "" })}`;
}

/** Imperative form of {@link createSheetSearch}, for entry points that also do other work. */
export function useOpenCreateSheet() {
  const [, navigate] = useLocation();
  return (title?: string) => navigate(createSheetSearch(title));
}

export default function CreateRecordSheet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const formRef = useRef<LoginRecordFormHandle>(null);

  // Presence opens the sheet; the value, if any, is the prefilled title.
  const initialTitle = searchParams.get(recordPaths.createParam) || undefined;
  const open = searchParams.has(recordPaths.createParam);

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete(recordPaths.createParam);
    setSearchParams(next, { replace: true });
  }

  const { createRecord, createRecordError } = useCreateRecord({
    onSuccess: (recordId) => {
      // Straight to the new record — this also drops the `?new` param.
      navigate(recordPaths.record(recordId), { replace: true });
      toast.success("Record created");
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

  const formActions = (
    <div className="flex flex-row justify-between gap-4">
      {isMobile && (
        <Button variant="outline" size="icon" className="rounded-full" onClick={close}>
          <XIcon />
        </Button>
      )}

      <div className="flex flex-row gap-4">
        {!isMobile && (
          <Button variant="secondary" type="button" onClick={close}>
            Cancel
          </Button>
        )}
        <Button onClick={() => formRef.current?.triggerSubmit()}>Save</Button>
      </div>
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
        title="New Login"
        actions={formActions}
        sheetClassName="sm:max-w-3xl!"
      >
        <LoginRecordForm
          // Remount on title change so the form picks up a new prefill.
          key={initialTitle ?? ""}
          onSubmit={handleSubmit}
          onCancel={close}
          serverError={createRecordError?.message}
          defaultValues={initialTitle ? { title: initialTitle } : undefined}
          action="Create"
          ref={formRef}
        />
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
