import { zodResolver } from "@hookform/resolvers/zod";
import { type FormFieldSpec, RECORD_FORM_FIELDS } from "@repo/client";
import {
  type CustomField,
  type RecordFormValues,
  type RecordType,
  recordFormSchemas,
} from "@repo/schema";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { FormLock } from "@repo/ui/components/form/FormLock";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Switch } from "@repo/ui/components/Switch";
import { cn } from "@repo/ui/lib/utils";
import { LockIcon, TagIcon } from "lucide-react";
import { type Ref, useId, useImperativeHandle, useRef } from "react";
import { type Control, Controller, type UseFormSetValue, useForm } from "react-hook-form";
import { PasswordField } from "@/features/password-generation";
import { CardExpiryField, CardNumberField } from "./card/CardFields";
import ExtraFormFields from "./login/ExtraFormFields";
import type { RecordFormHandle } from "./RecordForm";
import { SshFingerprintHint, SshKeyActions } from "./ssh/SshKeyActions";

export type OtherRecordType = Exclude<RecordType, "login">;

/** Masks a text input until focused, without `type="password"` (no save-password prompt). */
const MASKED = "[-webkit-text-security:disc] focus:[-webkit-text-security:none]";

/**
 * One form for six shapes: typed loosely by key, validated by the type's own
 * schema. The common fields keep their types for the shared inputs.
 */
type AnyFormValues = Record<string, unknown> & {
  title: string;
  note?: string;
  password?: string;
  customFields?: CustomField[];
};
type FieldProps = {
  spec: FormFieldSpec;
  control: Control<AnyFormValues>;
  setValue: UseFormSetValue<AnyFormValues>;
};

const INPUT_TYPES = { email: "email", phone: "tel", numeric: "text", date: "date" } as const;

function SelectField({ spec, control }: FieldProps) {
  const id = useId();
  const options = spec.options ?? [];

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
          <Select
            items={options}
            value={(field.value as string | undefined) ?? null}
            onValueChange={(value) => field.onChange(value ?? undefined)}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

function ToggleField({ spec, control }: FieldProps) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field }) => (
        <Field orientation="horizontal" className="items-center justify-between">
          <FieldLabel htmlFor={id}>{spec.label}</FieldLabel>
          <Switch
            id={id}
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(checked)}
          />
        </Field>
      )}
    />
  );
}

/** One input, by its kind; the card's and the key's need their own controls. */
function FormField(props: FieldProps) {
  const { spec, control, setValue } = props;
  const name = spec.key;

  switch (spec.kind) {
    case "text":
    case "secret":
      return (
        <ControlledInput
          control={control}
          name={name}
          label={spec.label}
          type={spec.input ? INPUT_TYPES[spec.input] : "text"}
          inputMode={spec.input === "numeric" ? "numeric" : undefined}
          placeholder={spec.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            (spec.mono || spec.kind === "secret") && "font-mono",
            spec.kind === "secret" && MASKED,
          )}
          leadingIcon={spec.kind === "secret" ? <LockIcon /> : undefined}
        />
      );

    case "password":
      return <PasswordField control={control} setValue={setValue} />;

    case "multiline":
    case "secretMultiline":
      return (
        <div className="flex flex-col gap-2">
          <ControlledTextarea
            control={control}
            name={name}
            label={spec.label}
            autoComplete="off"
            spellCheck={false}
            rows={spec.kind === "secretMultiline" ? 6 : 3}
            className={cn("font-mono text-xs", spec.kind === "secretMultiline" && MASKED)}
          />
          {spec.key === "publicKey" && (
            <SshFingerprintHint
              control={control as unknown as Control<RecordFormValues<"ssh_key">>}
            />
          )}
        </div>
      );

    case "cardNumber":
      return (
        <CardNumberField
          control={control as unknown as Control<RecordFormValues<"card">>}
          setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"card">>}
          label={spec.label}
        />
      );

    case "cardExpiry":
      return (
        <CardExpiryField
          control={control as unknown as Control<RecordFormValues<"card">>}
          setValue={setValue as unknown as UseFormSetValue<RecordFormValues<"card">>}
          label={spec.label}
        />
      );

    case "select":
      return <SelectField {...props} />;

    case "toggle":
      return <ToggleField {...props} />;
  }
}

type TypedRecordFormProps<T extends OtherRecordType> = {
  type: T;
  onSubmit: (data: RecordFormValues<T>) => void;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  ref?: Ref<RecordFormHandle>;
};

/**
 * The form of every type but the login: title, the type's inputs (from the
 * shared `RECORD_FORM_FIELDS`), then extra fields and the note. A secure note
 * is all note, so its body comes straight after the title.
 */
export default function TypedRecordForm<T extends OtherRecordType>({
  type,
  onSubmit,
  serverError,
  disabled = false,
  defaultValues,
  ref,
}: TypedRecordFormProps<T>) {
  const { register, handleSubmit, formState, control, setValue } = useForm<AnyFormValues>({
    resolver: zodResolver(recordFormSchemas[type] as never),
    defaultValues: defaultValues as Partial<AnyFormValues>,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const isNote = type === "note";
  const fields = RECORD_FORM_FIELDS[type] as readonly FormFieldSpec[];

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  const noteField = (
    <ControlledTextarea
      control={control}
      name="note"
      label={isNote ? "Note" : "Notes"}
      autoComplete="off"
      rows={isNote ? 10 : undefined}
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
        <FieldGroup className="gap-6">
          <ControlledInput
            control={control}
            name="title"
            label="Title"
            autoComplete="off"
            leadingIcon={<TagIcon />}
          />

          {isNote && noteField}

          {fields.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((spec) => (
                <div key={spec.key} className={spec.half ? undefined : "sm:col-span-2"}>
                  <FormField spec={spec} control={control} setValue={setValue} />
                </div>
              ))}
              {type === "ssh_key" && (
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
            <ExtraFormFields control={control} register={register} errors={formState.errors} />
            {!isNote && noteField}
          </div>

          {serverError && <FieldError variant="box">{serverError}</FieldError>}
        </FieldGroup>
      </FormLock>
    </form>
  );
}
