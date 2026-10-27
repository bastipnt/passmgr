import { zodResolver } from "@hookform/resolvers/zod";
import { type FormFieldSpec, RECORD_FORM_FIELDS, RECORD_FORM_LAYOUT } from "@repo/client";
import { type RecordFormValues, type RecordType, recordFormSchemas } from "@repo/schema";
import { FieldError, FieldGroup, FieldSeparator } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { TagIcon } from "lucide-react";
import { type Ref, useImperativeHandle, useRef } from "react";
import { type Control, type UseFormSetValue, useForm } from "react-hook-form";
import ExtraFormFields from "./ExtraFormFields";
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
  ref?: Ref<RecordFormHandle>;
};

/** The create / edit form of every type; `RECORD_FORM_LAYOUT` places the common parts. */
export default function RecordForm<T extends RecordType>({
  type,
  onSubmit,
  serverError,
  disabled = false,
  defaultValues,
  ref,
}: RecordFormProps<T>) {
  const { register, handleSubmit, formState, control, setValue } = useForm<AnyFormValues>({
    resolver: zodResolver(recordFormSchemas[type] as never),
    defaultValues: defaultValues as Partial<AnyFormValues>,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const layout = RECORD_FORM_LAYOUT[type];
  const fields = RECORD_FORM_FIELDS[type] as readonly FormFieldSpec[];

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  const noteField = (
    <ControlledTextarea
      control={control}
      name="note"
      label={layout.noteFirst ? "Note" : "Notes"}
      autoComplete="off"
      rows={layout.noteFirst ? 10 : undefined}
      capped
    />
  );
  const extraFields = (
    <ExtraFormFields control={control} register={register} errors={formState.errors} />
  );

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit((data) => onSubmit(data as RecordFormValues<T>))}
      autoComplete="off"
      className="px-5 py-6 sm:px-7"
    >
      <FormLock locked={disabled}>
        <FieldGroup className="gap-6">
          <ControlledInput
            control={control}
            name="title"
            label="Title"
            autoComplete="off"
            leadingIcon={<TagIcon />}
          />

          {layout.noteFirst && noteField}

          {fields.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((spec) => (
                <div key={spec.key} className={spec.half ? undefined : "sm:col-span-2"}>
                  <RecordFormField spec={spec} control={control} setValue={setValue} />
                </div>
              ))}
              {layout.actions === "sshKey" && (
                <div className="sm:col-span-2">
                  <SshKeyActions
                    control={control as unknown as Control<RecordFormValues<"ssh_key">>}
                    setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"ssh_key">>}
                  />
                </div>
              )}
            </div>
          )}

          <FieldSeparator />

          <div className="grid items-start gap-6 sm:grid-cols-2">
            {layout.websites ? (
              <>
                <WebsiteFormFields control={control} setValue={setValue} />
                {extraFields}
              </>
            ) : (
              <>
                {extraFields}
                {!layout.noteFirst && noteField}
              </>
            )}
          </div>

          {layout.websites && noteField}

          <RecordTagsField control={control} />

          {serverError && <FieldError variant="box">{serverError}</FieldError>}
        </FieldGroup>
      </FormLock>
    </form>
  );
}
