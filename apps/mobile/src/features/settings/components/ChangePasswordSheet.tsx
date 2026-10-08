import { zodResolver } from "@hookform/resolvers/zod";
import { CHANGE_PASSWORD_ERROR_MESSAGES, useChangePassword } from "@repo/client";
import { type ChangePasswordFormValues, changePasswordFormSchema } from "@repo/schema";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";

type ChangePasswordSheetProps = {
  ref: Ref<BottomSheetRef>;
  linked: boolean;
};

/**
 * Change the master password (ADR 0001 D10). A local vault changes it on this
 * device; an online account needs the server and signs out every other device.
 * The recovery key stays valid either way.
 */
export function ChangePasswordSheet({ ref, linked }: ChangePasswordSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { changePassword, changeError, clearChangeError, changing, blocked } = useChangePassword();

  const { handleSubmit, control, reset } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => {
      if (show) clearChangeError();
      else reset();
      sheetRef.current?.triggerShowHide(show);
    },
  }));

  const onSubmit = async ({ currentPassword, password }: ChangePasswordFormValues) => {
    if (await changePassword(currentPassword, password)) {
      reset();
      sheetRef.current?.triggerShowHide(false);
    }
  };

  const error = changeError ?? (blocked ? "offline" : undefined);

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={["full"]}
      // The typed passwords don't outlive the sheet.
      onDismiss={() => reset()}
      className="gap-6 px-6 pt-7 pb-6"
      footer={
        <Button size="lg" loading={changing} disabled={blocked} onPress={handleSubmit(onSubmit)}>
          Change password
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
          Change password
        </Text>
        <Text className="text-muted-foreground text-sm">
          {linked
            ? "Your other devices are signed out and unlock with the new password. Your recovery key stays the same."
            : "Only this device holds the vault, so the change stays here. Your recovery key stays the same."}
        </Text>
      </View>

      <FormLock locked={changing} className="gap-5">
        <ControlledPasswordInput
          control={control}
          name="currentPassword"
          label="Current password"
          textContentType="password"
        />
        <ControlledPasswordInput
          control={control}
          name="password"
          label="New password"
          textContentType="newPassword"
        />
        <ControlledPasswordInput
          control={control}
          name="confirmPassword"
          label="Confirm new password"
          textContentType="newPassword"
        />
      </FormLock>

      {error && (
        <FieldError variant="box" errors={[{ message: CHANGE_PASSWORD_ERROR_MESSAGES[error] }]} />
      )}
    </BottomSheet>
  );
}
