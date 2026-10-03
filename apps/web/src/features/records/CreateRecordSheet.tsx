import { loginRecordFromForm, ShortcutLayer, useCreateRecord } from "@repo/client";
import type { LoginFormValues } from "@repo/schema";
import { toast } from "@repo/ui";
import { ResponsiveSheet, SheetCloseAction } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { isDefined } from "@repo/util";
import { PlusIcon } from "lucide-react";
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

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: (recordId) => {
      // Straight to the new record — this also drops the `?new` param.
      navigate(recordPaths.record(recordId), { replace: true });
      toast.success("Record created");
    },
  });

  useEffect(() => {
    if (isDefined(createRecordError)) toast.error("Error saving");
  }, [createRecordError]);

  function handleSubmit(formValues: LoginFormValues) {
    createRecord(loginRecordFromForm(formValues));
  }

  const formActions = (
    <div className="flex flex-row justify-between gap-4">
      <SheetCloseAction />

      <div className="flex flex-row items-center gap-3 sm:w-full sm:justify-end">
        {!isMobile && (
          <Button variant="outline" size="lg" type="button" onClick={close}>
            Cancel
          </Button>
        )}
        <Button size="lg" disabled={createPending} onClick={() => formRef.current?.triggerSubmit()}>
          Create login
          {createPending && <Spinner data-icon="inline-end" />}
        </Button>
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
        title="New login"
        description="Encrypted on this device before it's saved"
        media={
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
            <PlusIcon className="size-5" aria-hidden />
          </span>
        }
        actions={formActions}
        sheetClassName="sm:max-w-3xl!"
      >
        <LoginRecordForm
          // Remount on title change so the form picks up a new prefill.
          key={initialTitle ?? ""}
          onSubmit={handleSubmit}
          onCancel={close}
          serverError={createRecordError?.message}
          disabled={createPending}
          defaultValues={initialTitle ? { title: initialTitle } : undefined}
          action="Create"
          ref={formRef}
        />
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
