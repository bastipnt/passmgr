import {
  duplicateValues,
  RECORD_TYPE_LABELS,
  recordErrorMessage,
  recordFromForm,
  useCreateRecord,
  useDuplicateSource,
  userMessage,
  useTargetVault,
} from "@repo/client";
import { RECORD_TYPES, type RecordFormValues, type RecordType } from "@repo/schema";
import { toast } from "@repo/ui";
import { SheetMediaHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ChevronLeftIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { VaultPicker } from "@/features/vaults";
import { RecordTypeTile } from "./RecordAvatar";
import { RecordFormFields, type RecordFormHandle, useRecordForm } from "./RecordForm";
import RecordFormSheet from "./RecordFormSheet";
import { RecordTypePicker } from "./RecordTypePicker";
import { searchReturnState } from "./search-history";
import { useDiscardGuard } from "./use-discard-guard";

/**
 * Href that opens the create sheet over whatever is currently in view. Without
 * a `type` the sheet starts at the type picker. The sheet is a URL mode, so
 * entry points are links — which also makes ⌘-click and middle-click work.
 */
export function createSheetSearch(type?: RecordType) {
  const params = new URLSearchParams({ [recordPaths.createParam]: "" });
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

/**
 * The title the create sheet opens with (e.g. the search text). Kept in memory, never in the URL:
 * there it would stay in the browser history after the vault locks.
 */
let prefilledTitle: string | undefined;

export function prefillCreateSheet(title?: string) {
  prefilledTitle = title?.trim() || undefined;
}

/** Imperative form of {@link createSheetSearch}, for entry points that also do other work. */
export function useOpenCreateSheet() {
  const [, navigate] = useLocation();
  return (title?: string) => {
    prefillCreateSheet(title);
    navigate(createSheetSearch(), { state: searchReturnState() });
  };
}

export default function CreateRecordSheet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const formRef = useRef<RecordFormHandle>(null);

  // Presence opens the sheet. Its last params are kept, so the sheet keeps its content while
  // Back's "Discard changes?" holds it open.
  const routeOpen = searchParams.has(recordPaths.createParam);
  const lastParams = useRef(searchParams);
  if (routeOpen) lastParams.current = searchParams;
  const sheetParams = routeOpen ? searchParams : lastParams.current;
  const guard = useDiscardGuard({
    routeOpen,
    isDirty: () => isDirty,
    reopenState: searchReturnState,
  });
  const { open } = guard;
  // The prefilled title lasts while it's open (type picker → form).
  const initialTitle = open ? prefilledTitle : undefined;
  useEffect(() => {
    if (!open) prefillCreateSheet(undefined);
  }, [open]);
  // Also when the sheet goes away open, e.g. the vault locks: the title mustn't outlive it.
  useEffect(() => () => prefillCreateSheet(undefined), []);
  const duplicateId = open ? sheetParams.get(recordPaths.createDuplicateParam) : null;
  const source = useDuplicateSource(duplicateId, () => {
    toast.error("This item is no longer available");
    // Nothing left to keep editing a copy of.
    guard.allowClose();
    close();
  });
  const type = duplicateId ? source?.type : parseType(sheetParams.get(recordPaths.createTypeParam));
  const typeLabel = type ? RECORD_TYPE_LABELS[type].noun : undefined;
  const { vaultId, setVaultId, canPick } = useTargetVault(open, source?.vaultId);

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete(recordPaths.createParam);
    next.delete(recordPaths.createTypeParam);
    next.delete(recordPaths.createDuplicateParam);
    setSearchParams(next, { replace: true });
  }

  const { form, isDirty } = useRecordForm(
    type,
    source ? duplicateValues(source) : initialTitle ? { title: initialTitle } : undefined,
    // A new type or copy starts the form over.
    { open, key: `${type}:${duplicateId ?? ""}` },
  );

  const { createRecord, createRecordError, createPending } = useCreateRecord({
    onSuccess: (recordId) => {
      guard.allowClose();
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

  // Back to the picker drops the form, so it asks first.
  const backToPicker = type && !duplicateId && (
    <Button
      variant="ghost"
      size="lg"
      type="button"
      disabled={createPending}
      onClick={() =>
        guard.requestDiscard(() =>
          navigate(createSheetSearch(), { replace: true, state: searchReturnState() }),
        )
      }
    >
      <ChevronLeftIcon />
      Type
    </Button>
  );

  return (
    <RecordFormSheet
      guard={guard}
      onClose={close}
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
        <RecordFormFields
          type={type}
          form={form}
          onSubmit={(values) => handleSubmit(type, values)}
          serverError={createRecordError ? userMessage(createRecordError) : undefined}
          disabled={createPending}
          vaultField={
            canPick &&
            vaultId && (
              <VaultPicker value={vaultId} onChange={setVaultId} disabled={createPending} />
            )
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
        <RecordTypePicker hrefFor={(pick) => createSheetSearch(pick)} />
      )}
    </RecordFormSheet>
  );
}
