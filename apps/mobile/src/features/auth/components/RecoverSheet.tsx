import { zodResolver } from "@hookform/resolvers/zod";
import { RECOVERY_ERROR_MESSAGES, useRecovery } from "@repo/client";
import { type RecoverFormValues, recoverFormSchema } from "@repo/schema";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";
import { RecoveryKeyDialog } from "./RecoveryKeyDialog";

type RecoverSheetProps = {
  ref: Ref<BottomSheetRef>;
  /** Called after the user saves the new recovery key, to open the sign-in sheet. */
  onSwitchToSignIn: () => void;
};

/** "Forgot password?": reset the master password with the recovery key. */
export function RecoverSheet({ ref, onSwitchToSignIn }: RecoverSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { recover, recoveryError } = useRecovery();
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control, reset } = useForm<RecoverFormValues>({
    resolver: zodResolver(recoverFormSchema),
    defaultValues: { email: "", recoveryKey: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ email, recoveryKey, password }: RecoverFormValues) => {
    setLoading(true);
    let key: Uint8Array | undefined;
    try {
      key = await recover(email, recoveryKey, password);
    } finally {
      setLoading(false);
    }
    if (!key) return;
    // Dismiss the form sheet, then present the new key over the welcome screen.
    sheetRef.current?.triggerShowHide(false);
    reset();
    setNewRecoveryKey(key);
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        description="Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
        onDone={() => {
          setNewRecoveryKey(null);
          onSwitchToSignIn();
        }}
      />

      <BottomSheet
        ref={sheetRef}
        snapPoints={["full"]}
        className="gap-6 px-6 pt-7 pb-6"
        footer={
          <Button size="lg" loading={loading} onPress={handleSubmit(onSubmit)}>
            Reset password
          </Button>
        }
      >
        <View className="gap-1">
          <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
            Reset password
          </Text>
          <Text className="text-muted-foreground text-sm">
            Use the recovery key you saved when you signed up. You'll be signed out on all devices.
          </Text>
        </View>

        <FormLock locked={loading} className="gap-5">
          <ControlledInput
            control={control}
            name="email"
            label="Email"
            autoCapitalize="none"
            autoComplete="username"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <ControlledInput
            control={control}
            name="recoveryKey"
            label="Recovery key"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            spellCheck={false}
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

        {recoveryError && (
          <FieldError
            variant="box"
            errors={[{ message: RECOVERY_ERROR_MESSAGES[recoveryError] }]}
          />
        )}
      </BottomSheet>
    </>
  );
}
