import {
  duplicateValues,
  RECORD_TYPE_LABELS,
  recordErrorMessage,
  recordFromForm,
  useCreateRecord,
  useDuplicateSource,
  useTargetVault,
} from "@repo/client";
import { RECORD_TYPES, type RecordFormValues, type RecordType } from "@repo/schema";
import { toast } from "@repo/ui";
import { SheetMediaHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ChevronLeftIcon, PlusIcon } from "lucide-react";
import { useRef } from "react";
import { useLocation, useSearchParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { VaultPicker } from "@/features/vaults";
import { RecordTypeTile } from "./RecordAvatar";
import RecordForm, { type RecordFormHandle } from "./RecordForm";
import RecordFormSheet from "./RecordFormSheet";
import { RecordTypePicker } from "./RecordTypePicker";
import { searchReturnState } from "./search-history";

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

/** Href that opens the create sheet as a copy of `recordId`. */
export function duplicateSheetSearch(recordId: string) {
  return `?${new URLSearchParams({ [recordPaths.createParam]: "", [recordPaths.createDuplicateParam]: recordId })}`;
}

function parseType(value: string | null): RecordType | undefined {
  return RECORD_TYPES.find((type) => type === value);
}

/** Imperative form of {@link createSheetSearch}, for entry points that also do other work. */
export function useOpenCreateSheet() {
  const [, navigate] = useLocation();
  return (title?: string) => navigate(createSheetSearch(title), { state: searchReturnState() });
}

export default function CreateRecordSheet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const formRef = useRef<RecordFormHandle>(null);

  // Presence opens the sheet; the value, if any, is the prefilled title.
  const initialTitle = searchParams.get(recordPaths.createParam) || undefined;
  const open = searchParams.has(recordPaths.createParam);
  const duplicateId = open ? searchParams.get(recordPaths.createDuplicateParam) : null;
  const source = useDuplicateSource(duplicateId, () => {
    toast.error("This item is no longer available");
    close();
  });
  const type = duplicateId
    ? source?.type
    : parseType(searchParams.get(recordPaths.createTypeParam));
  const typeLabel = type ? RECORD_TYPE_LABELS[type].noun : undefined;
  const { vaultId, setVaultId, canPick } = useTargetVault(open, source?.vaultId);

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete(recordPaths.createParam);
    next.delete(recordPaths.createTypeParam);
    next.delete(recordPaths.createDuplicateParam);
    setSearchParams(next, { replace: true });
  }

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: (recordId) => {
      // Straight to the new record — this also drops the `?new` param.
      navigate(recordPaths.record(recordId), { replace: true, state: searchReturnState() });
      toast.success("Record created");
    },
    onError: (error) => toast.error(recordErrorMessage(error, "The item couldn't be saved")),
  });

  function handleSubmit<T extends RecordType>(formType: T, formValues: RecordFormValues<T>) {
    createRecord(recordFromForm(formType, formValues), vaultId);
  }

  const title = typeLabel ? `${duplicateId ? "Duplicate" : "New"} ${typeLabel}` : "New item";
  const description = "Encrypted on this device before it's saved";

  // Back to the picker; what was typed so far is dropped with the form.
  const backToPicker = type && !duplicateId && (
    <Button
      variant="ghost"
      size="lg"
      type="button"
      disabled={createPending}
      onClick={() =>
        navigate(createSheetSearch(initialTitle), { replace: true, state: searchReturnState() })
      }
    >
      <ChevronLeftIcon />
      Type
    </Button>
  );

  return (
    <RecordFormSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      onCancel={close}
      title={title}
      description={type ? description : "What would you like to save?"}
      media={
        type ? (
          <RecordTypeTile type={type} size="header" />
        ) : (
          <span className="grid size-13 shrink-0 place-items-center rounded-[14px] bg-primary text-primary-foreground">
            <PlusIcon className="size-[1.625rem]" aria-hidden />
          </span>
        )
      }
      submit={
        type && {
          label: `Create ${typeLabel}`,
          phoneLabel: "Create",
          pending: createPending,
          onClick: () => formRef.current?.triggerSubmit(),
        }
      }
      leading={backToPicker}
    >
      {type ? (
        <RecordForm
          // Remount on a new type or prefill so the form starts over.
          key={`${type}:${initialTitle ?? ""}:${duplicateId ?? ""}`}
          type={type}
          onSubmit={(values) => handleSubmit(type, values)}
          serverError={createRecordError?.message}
          disabled={createPending}
          vaultField={
            canPick &&
            vaultId && (
              <VaultPicker value={vaultId} onChange={setVaultId} disabled={createPending} />
            )
          }
          defaultValues={
            source ? duplicateValues(source) : initialTitle ? { title: initialTitle } : undefined
          }
          header={
            isMobile && (
              <SheetMediaHeader
                media={<RecordTypeTile type={type} size="ml" />}
                description={description}
              >
                {backToPicker}
              </SheetMediaHeader>
            )
          }
          ref={formRef}
        />
      ) : duplicateId ? null : (
        <RecordTypePicker hrefFor={(pick) => createSheetSearch(initialTitle, pick)} />
      )}
    </RecordFormSheet>
  );
}
