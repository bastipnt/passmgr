import { RECORD_TYPE_LABELS, recordFromForm, ShortcutLayer, useCreateRecord } from "@repo/client";
import { RECORD_TYPES, type RecordFormValues, type RecordType } from "@repo/schema";
import { toast } from "@repo/ui";
import { ResponsiveSheet, SheetCloseAction } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { isDefined } from "@repo/util";
import { ChevronLeftIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { RecordTypeTile } from "./RecordAvatar";
import RecordForm, { type RecordFormHandle } from "./RecordForm";
import { RecordTypePicker } from "./RecordTypePicker";

/**
 * Href that opens the create sheet over whatever is currently in view,
 * optionally prefilling the title. Without a `type` the sheet starts at the
 * type picker. The sheet is a URL mode, so entry points are links — which
 * also makes ⌘-click and middle-click work.
 */
export function createSheetSearch(title?: string, type?: RecordType) {
  const params = new URLSearchParams({ [recordPaths.createParam]: title?.trim() ?? "" });
  if (type) params.set(recordPaths.createTypeParam, type);
  return `?${params}`;
}

function parseType(value: string | null): RecordType | undefined {
  return RECORD_TYPES.find((type) => type === value);
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
  const formRef = useRef<RecordFormHandle>(null);

  // Presence opens the sheet; the value, if any, is the prefilled title.
  const initialTitle = searchParams.get(recordPaths.createParam) || undefined;
  const open = searchParams.has(recordPaths.createParam);
  const type = parseType(searchParams.get(recordPaths.createTypeParam));
  const typeLabel = type ? RECORD_TYPE_LABELS[type].noun : undefined;

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete(recordPaths.createParam);
    next.delete(recordPaths.createTypeParam);
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

  function handleSubmit<T extends RecordType>(formType: T, formValues: RecordFormValues<T>) {
    createRecord(recordFromForm(formType, formValues));
  }

  const formActions = (
    <div className="flex flex-row justify-between gap-4">
      <SheetCloseAction />

      <div className="flex flex-row items-center gap-3 sm:w-full sm:justify-end">
        {type && (
          // Back to the picker; what was typed so far is dropped with the form.
          <Button
            variant="ghost"
            size="lg"
            type="button"
            className="sm:mr-auto"
            onClick={() => navigate(createSheetSearch(initialTitle), { replace: true })}
          >
            <ChevronLeftIcon />
            Type
          </Button>
        )}
        {!isMobile && (
          <Button variant="outline" size="lg" type="button" onClick={close}>
            Cancel
          </Button>
        )}
        {type && (
          <Button
            size="lg"
            disabled={createPending}
            onClick={() => formRef.current?.triggerSubmit()}
          >
            Create {typeLabel}
            {createPending && <Spinner data-icon="inline-end" />}
          </Button>
        )}
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
        title={typeLabel ? `New ${typeLabel}` : "New item"}
        description={
          type ? "Encrypted on this device before it's saved" : "What would you like to save?"
        }
        media={
          type ? (
            <RecordTypeTile type={type} />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
              <PlusIcon className="size-5" aria-hidden />
            </span>
          )
        }
        actions={formActions}
        sheetClassName="sm:max-w-3xl!"
      >
        {type ? (
          <RecordForm
            // Remount on a new type or prefill so the form starts over.
            key={`${type}:${initialTitle ?? ""}`}
            type={type}
            onSubmit={(values) => handleSubmit(type, values)}
            serverError={createRecordError?.message}
            disabled={createPending}
            defaultValues={initialTitle ? { title: initialTitle } : undefined}
            ref={formRef}
          />
        ) : (
          <RecordTypePicker hrefFor={(pick) => createSheetSearch(initialTitle, pick)} />
        )}
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
