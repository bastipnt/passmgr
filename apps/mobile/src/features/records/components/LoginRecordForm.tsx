import { useForm } from "react-hook-form";
import type { Href } from "expo-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginRecordSchema, type LoginRecord as FormValues } from "@repo/schema";
import { useImperativeHandle, type Ref } from "react";
import {
  ControlledInput,
  ControlledTextarea,
  FieldError,
  FieldGroup,
  FieldSeparator,
  FieldSet,
} from "@repo/ui-native";
import { LockIcon, MailIcon, NotebookPenIcon, TagIcon } from "lucide-react-native";
import WebsiteFormFields from "@/features/records/components/WebsiteFormFields";
import ExtraFormFields from "@/features/records/components/ExtraFormFields";
import PasswordField from "@/features/records/components/PasswordField";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

export type LoginRecordFormHandle = {
  triggerSubmit: () => void;
};

type LoginRecordFormProps = {
  onSubmit: (data: FormValues) => void;
  action: string;
  /** Route of the generator sheet the password field opens. */
  generatorPath: Href;
  serverError?: string;
  defaultValues?: Partial<FormValues>;
  ref?: Ref<LoginRecordFormHandle>;
};

export default function LoginRecordForm({
  onSubmit,
  serverError,
  defaultValues,
  generatorPath,
  ref,
}: LoginRecordFormProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

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

  useImperativeHandle(
    ref,
    () => ({
      triggerSubmit: handleSubmit(onSubmit),
    }),
    [handleSubmit, onSubmit],
  );

  return (
    <View>
      <FieldGroup className="*:pr-8">
        <FieldSet>
          <ControlledInput
            control={control}
            name="title"
            label="Title"
            autoComplete="off"
            icon={<TagIcon size={18} color={iconColor} />}
          />

          <ControlledInput
            control={control}
            name="username"
            label="Username"
            autoComplete="off"
            icon={<MailIcon size={18} color={iconColor} />}
          />

          <PasswordField control={control} setValue={setValue} generatorPath={generatorPath} />

          <ControlledInput
            control={control}
            name="totp"
            label="2FA token secret (TOTP)"
            autoComplete="off"
            icon={<LockIcon size={18} color={iconColor} />}
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
            icon={<NotebookPenIcon size={18} color={iconColor} />}
          />
        </FieldSet>

        <FieldSeparator />

        <ExtraFormFields control={control} register={register} errors={errors} />

        {serverError && <FieldError>{serverError}</FieldError>}
      </FieldGroup>
    </View>
  );
}
