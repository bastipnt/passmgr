import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginFormValues as FormValues, loginFormSchema } from "@repo/schema";
import { FieldError, FieldGroup, FieldSeparator, FieldSet } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { LockIcon, MailIcon, TagIcon } from "lucide-react";
import { type Ref, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { PasswordField } from "@/features/password-generation";
import type { RecordFormHandle } from "../RecordForm";
import ExtraFormFields from "./ExtraFormFields";
import WebsiteFormFields from "./WebsiteFormFields";

type LoginRecordFormProps = {
  onSubmit: (data: FormValues) => void;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  defaultValues?: Partial<FormValues>;
  ref?: Ref<RecordFormHandle>;
};

export default function LoginRecordForm({
  onSubmit,
  serverError,
  disabled = false,
  defaultValues,
  ref,
}: LoginRecordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues,
  });

  const formRef = useRef<HTMLFormElement>(null);

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(onSubmit)}
      autoComplete="off"
      className="px-5 py-6 sm:px-7"
    >
      <FormLock locked={disabled}>
        <FieldGroup className="gap-6">
          <FieldSet className="gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <ControlledInput
                control={control}
                name="title"
                label="Title"
                autoComplete="off"
                leadingIcon={<TagIcon />}
              />

              <ControlledInput
                control={control}
                name="username"
                label="Username"
                autoComplete="off"
                leadingIcon={<MailIcon />}
              />
            </div>

            <PasswordField control={control} setValue={setValue} />

            <ControlledInput
              control={control}
              name="totp"
              label="2FA token secret (TOTP)"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              leadingIcon={<LockIcon />}
            />
          </FieldSet>

          <FieldSeparator />

          <div className="grid items-start gap-6 sm:grid-cols-2">
            <WebsiteFormFields
              control={control}
              register={register}
              errors={errors}
              setValue={setValue}
            />
            <ExtraFormFields control={control} register={register} errors={errors} />
          </div>

          <ControlledTextarea control={control} name="note" label="Notes" autoComplete="off" />

          {serverError && <FieldError variant="box">{serverError}</FieldError>}
        </FieldGroup>
      </FormLock>
    </form>
  );
}
