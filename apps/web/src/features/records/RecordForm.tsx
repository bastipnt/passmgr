import { zodResolver } from "@hookform/resolvers/zod";
import {
  type FormFieldSpec,
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
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { cn } from "@repo/ui/lib/utils";
import { FileTextIcon, type LucideIcon, MapPinIcon } from "lucide-react";
import { type ReactNode, type Ref, useImperativeHandle, useRef } from "react";
import { type Control, type UseFormSetValue, useForm } from "react-hook-form";
import ExtraFormFields from "./ExtraFormFields";
import { RECORD_TYPE_ICONS } from "./RecordAvatar";
import RecordFormField, { type AnyFormValues } from "./RecordFormField";
import { RecordTagsField } from "./RecordTagsField";
import { SshKeyActions } from "./ssh/SshKeyActions";
import WebsiteFormFields from "./WebsiteFormFields";

export type RecordFormHandle = {
  triggerSubmit: () => void;
};

type RecordFormProps<T extends RecordType> = {
  type: T;
  onSubmit: (data: RecordFormValues<T>) => void;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  /** The target vault's field next to the tags; a create offers it, an edit moves instead. */
  vaultField?: ReactNode;
  ref?: Ref<RecordFormHandle>;
};

const SECTION_ICONS: { [S in RecordFormSection]: ReactNode } = {
  address: <MapPinIcon />,
};

const WIDTH_CLASSES = { half: "sm:col-span-3", third: "sm:col-span-2" } as const;

const gridClassName = "grid gap-2.5 sm:grid-cols-6";

/** The create / edit form of every type; `RECORD_FORM_LAYOUT` places the common parts. */
export default function RecordForm<T extends RecordType>({
  type,
  onSubmit,
  serverError,
  disabled = false,
  defaultValues,
  vaultField,
  ref,
}: RecordFormProps<T>) {
  const { handleSubmit, control, setValue } = useForm<AnyFormValues>({
    resolver: zodResolver(recordFormSchemas[type] as never),
    defaultValues: defaultValues as Partial<AnyFormValues>,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const layout = RECORD_FORM_LAYOUT[type];
  const fields = RECORD_FORM_FIELDS[type] as readonly FormFieldSpec[];
  const sections = [...new Set(fields.flatMap((spec) => (spec.section ? [spec.section] : [])))];
  const TypeIcon: LucideIcon = RECORD_TYPE_ICONS[type];

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  const renderFields = (specs: readonly FormFieldSpec[]) =>
    specs.map((spec) => (
      <div key={spec.key} className={cn("sm:col-span-6", spec.width && WIDTH_CLASSES[spec.width])}>
        <RecordFormField spec={spec} control={control} setValue={setValue} />
      </div>
    ));

  const noteField = (
    <ControlledTextarea
      control={control}
      name="note"
      label="Note"
      hideLabel
      autoComplete="off"
      rows={layout.noteFirst ? 10 : undefined}
      capped
    />
  );

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit((data) => onSubmit(data as RecordFormValues<T>))}
      autoComplete="off"
      className="px-5 py-6 sm:px-7"
    >
      <FormLock locked={disabled}>
        <div className="flex flex-col gap-8">
          <DetailSection
            title={RECORD_TYPE_LABELS[type].fields}
            icon={<TypeIcon />}
            actions={
              layout.actions === "sshKey" && (
                <SshKeyActions
                  control={control as unknown as Control<RecordFormValues<"ssh_key">>}
                  setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"ssh_key">>}
                />
              )
            }
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
        </div>
      </FormLock>
    </form>
  );
}
