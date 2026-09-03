import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginRecord as FormValues, loginRecordSchema } from "@repo/schema";
import { FieldError, FieldGroup, FieldSeparator, FieldSet } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledTextarea } from "@repo/ui/components/form/ControlledTextarea";
import { normalizeWebsiteUrl } from "@repo/util";
import { LockIcon, MailIcon, NotebookPenIcon, TagIcon } from "lucide-react";
import { type Ref, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { PasswordField } from "@/features/password-generation";
import ExtraFormFields from "./ExtraFormFields";
import WebsiteFormFields from "./WebsiteFormFields";

export type LoginRecordFormHandle = {
  triggerSubmit: () => void;
};

type LoginRecordFormProps = {
  onSubmit: (data: FormValues) => void;
  action: string;
  serverError?: string;
  defaultValues?: Partial<FormValues>;
  onCancel: () => void;
  ref?: Ref<LoginRecordFormHandle>;
};

export default function LoginRecordForm({
  onSubmit,
  serverError,
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
    resolver: zodResolver(loginRecordSchema),
    defaultValues,
  });

  const formRef = useRef<HTMLFormElement>(null);

  function handleFormSubmit(data: FormValues) {
    onSubmit({
      ...data,
      websites: data.websites
        ?.map(({ value, ...rest }) => ({ ...rest, value: value.trim() }))
        .filter(({ value }) => value !== "")
        .map(({ value, ...rest }) => ({ ...rest, value: normalizeWebsiteUrl(value) })),
    });
  }

  useImperativeHandle(ref, () => ({
    triggerSubmit: () => formRef.current?.requestSubmit(),
  }));

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(handleFormSubmit)}
      autoComplete="off"
      className="p-4"
    >
      <FieldGroup className="*:pr-8">
        <FieldSet>
          <ControlledInput
            control={control}
            name="title"
            label="Title"
            autoComplete="off"
            icon={<TagIcon />}
          />

          <ControlledInput
            control={control}
            name="username"
            label="Username"
            autoComplete="off"
            icon={<MailIcon />}
          />

          <PasswordField control={control} setValue={setValue} />

          <ControlledInput
            control={control}
            name="totp"
            label="2FA token secret (TOTP)"
            autoComplete="off"
            icon={<LockIcon />}
          />
        </FieldSet>

        <FieldSeparator />

        <WebsiteFormFields
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
        />

        <FieldSeparator />

        <FieldSet>
          <ControlledTextarea
            control={control}
            name="note"
            label="Notes"
            autoComplete="off"
            icon={<NotebookPenIcon />}
          />
        </FieldSet>

        <FieldSeparator />

        <ExtraFormFields control={control} register={register} errors={errors} />

        {serverError && <FieldError>{serverError}</FieldError>}
      </FieldGroup>
    </form>
  );
}
