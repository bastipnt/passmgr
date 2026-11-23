import { zodResolver } from "@hookform/resolvers/zod";
import {
  type FormFieldSpec,
  noteSummary,
  phoneRows,
  RECORD_FORM_FIELDS,
  RECORD_FORM_LAYOUT,
  RECORD_FORM_SECTION_LABELS,
  RECORD_TYPE_LABELS,
  type RecordFormSection,
} from "@repo/client";
import { type RecordFormValues, type RecordType, recordFormSchemas } from "@repo/schema";
import { DetailSection } from "@repo/ui/complex-components/DetailSection";
import { FieldError } from "@repo/ui/components/Field";
import { ControlledBoxedInput } from "@repo/ui/components/form/ControlledBoxedInput";
import { ControlledCodeBlock } from "@repo/ui/components/form/ControlledCodeBlock";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { FileTextIcon, type LucideIcon, MapPinIcon } from "lucide-react";
import { type ReactNode, type Ref, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { type Control, type UseFormReturn, type UseFormSetValue, useForm } from "react-hook-form";
import ExtraFormFields from "./ExtraFormFields";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";
import RecordFormField, { type AnyFormValues } from "./RecordFormField";
import { RecordTagsField } from "./RecordTagsField";
import { SshKeyActions } from "./ssh/SshKeyActions";
import WebsiteFormFields from "./WebsiteFormFields";

export type RecordFormHandle = {
  triggerSubmit: () => void;
};

export type RecordFormInstance = UseFormReturn<AnyFormValues>;

type RecordFormFieldsProps<T extends RecordType> = {
  type: T;
  form: RecordFormInstance;
  onSubmit: (data: RecordFormValues<T>) => void;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  /** The target vault's field next to the tags; a create offers it, an edit moves instead. */
  vaultField?: ReactNode;
  /** Above the first section (the phone drawer's record header). */
  header?: ReactNode;
  /** After the last section (the phone drawer's Delete). */
  footer?: ReactNode;
  openGenerator?: boolean;
  ref?: Ref<RecordFormHandle>;
};

type RecordFormProps<T extends RecordType> = Omit<RecordFormFieldsProps<T>, "form"> & {
  defaultValues?: Partial<RecordFormValues<T>>;
};

const SECTION_ICONS: { [S in RecordFormSection]: ReactNode } = {
  address: <MapPinIcon />,
};

const WIDTH_CLASSES = { half: "sm:col-span-3", third: "sm:col-span-2" } as const;

const gridClassName = "grid gap-2 sm:grid-cols-6 sm:gap-2.5";

/**
 * The record form's state. A sheet holds it above its phone / desktop swap, so the input survives
 * crossing 640px. With `session`, each opening and each new `session.key` start over from `defaultValues`.
 */
export function useRecordForm(
  type: RecordType | undefined,
  defaultValues?: Partial<AnyFormValues>,
  session?: { open: boolean; key?: string },
) {
  const form = useForm<AnyFormValues>({
    resolver: type ? zodResolver(recordFormSchemas[type] as never) : undefined,
    defaultValues,
  });
  // Read while rendering: RHF tracks `isDirty` only once a render has read it.
  const { isDirty } = form.formState;

  const latestDefaults = useRef(defaultValues);
  latestDefaults.current = defaultValues;
  const sessionId = session && (session.open ? (session.key ?? "") : null);
  const lastSessionId = useRef(sessionId);
  useLayoutEffect(() => {
    if (sessionId === lastSessionId.current) return;
    lastSessionId.current = sessionId;
    if (sessionId !== null) form.reset(latestDefaults.current ?? {});
  }, [sessionId, form]);

  return { form, isDirty };
}

/** The create / edit form of every type, with its own state. */
export default function RecordForm<T extends RecordType>({
  defaultValues,
  ...props
}: RecordFormProps<T>) {
  const { form } = useRecordForm(props.type, defaultValues as Partial<AnyFormValues>);
  return <RecordFormFields {...props} form={form} />;
}

/** The create / edit form of every type on a held `form`; `RECORD_FORM_LAYOUT` places the common parts. */
export function RecordFormFields<T extends RecordType>({
  type,
  form,
  onSubmit,
  serverError,
  disabled = false,
  vaultField,
  header,
  footer,
  openGenerator,
  ref,
}: RecordFormFieldsProps<T>) {
  const isMobile = useIsMobile();
  const { handleSubmit, control, setValue } = form;
  const formRef = useRef<HTMLFormElement>(null);
  const layout = RECORD_FORM_LAYOUT[type];
  const fields = RECORD_FORM_FIELDS[type] as readonly FormFieldSpec[];
  const sections = [...new Set(fields.flatMap((spec) => (spec.section ? [spec.section] : [])))];
  const TypeIcon: LucideIcon = RECORD_TYPE_ICONS[type];

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  const renderField = (spec: FormFieldSpec) => (
    <div key={spec.key} className={cn("sm:col-span-6", spec.width && WIDTH_CLASSES[spec.width])}>
      <RecordFormField
        spec={spec}
        control={control}
        setValue={setValue}
        compact={isMobile}
        openGenerator={openGenerator}
      />
    </div>
  );

  // A phone row dissolves into the six-column grid on wider screens.
  const renderFields = (specs: readonly FormFieldSpec[]) =>
    phoneRows(specs).map((row) =>
      row.length === 1 ? (
        renderField(row[0] as FormFieldSpec)
      ) : (
        <div
          key={row.map((spec) => spec.key).join()}
          className="grid gap-2 sm:contents"
          style={{
            gridTemplateColumns: row.map((spec) => `minmax(0, ${spec.phoneShare}fr)`).join(" "),
          }}
        >
          {row.map(renderField)}
        </div>
      ),
    );

  const sshKeyActions = layout.actions === "sshKey" && (
    <SshKeyActions
      control={control as unknown as Control<RecordFormValues<"ssh_key">>}
      setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"ssh_key">>}
      block={isMobile}
    />
  );

  const noteField = (
    <ControlledCodeBlock
      control={control}
      name="note"
      label="Note"
      hideLabel
      placeholder="Add a note…"
      autoComplete="off"
      size={layout.noteFirst ? "tall" : "default"}
      summary={noteSummary}
    />
  );

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit((data) => onSubmit(data as RecordFormValues<T>))}
      autoComplete="off"
      className="px-4 pb-6 sm:px-7 sm:pt-6"
    >
      <FormLock locked={disabled}>
        <div className="flex flex-col gap-8">
          {header}
          <DetailSection
            title={RECORD_TYPE_LABELS[type].fields}
            icon={<TypeIcon />}
            actions={!isMobile && sshKeyActions}
          >
            <div className={gridClassName}>
              <ControlledBoxedInput
                control={control}
                name="title"
                label="Title"
                autoComplete="off"
                className="sm:col-span-6"
              />
              {vaultField && <div className="sm:col-span-3">{vaultField}</div>}
              <RecordTagsField
                control={control}
                className={vaultField ? "sm:col-span-3" : "sm:col-span-6"}
              />
              {layout.noteFirst && <div className="sm:col-span-6">{noteField}</div>}
              {isMobile && sshKeyActions}
              {renderFields(fields.filter((spec) => !spec.section))}
            </div>
          </DetailSection>

          {sections.map((section) => (
            <DetailSection
              key={section}
              title={RECORD_FORM_SECTION_LABELS[section]}
              icon={SECTION_ICONS[section]}
            >
              <div className={gridClassName}>
                {renderFields(fields.filter((spec) => spec.section === section))}
              </div>
            </DetailSection>
          ))}

          {layout.websites ? (
            <div className="grid items-start gap-8 sm:grid-cols-2 sm:gap-x-10">
              <WebsiteFormFields control={control} setValue={setValue} />
              <ExtraFormFields control={control} setValue={setValue} />
            </div>
          ) : (
            <ExtraFormFields control={control} setValue={setValue} wide />
          )}

          {!layout.noteFirst && (
            <DetailSection title="Note" icon={<FileTextIcon />}>
              {noteField}
            </DetailSection>
          )}

          {serverError && <FieldError variant="box">{serverError}</FieldError>}
          {footer}
        </div>
      </FormLock>
    </form>
  );
}
