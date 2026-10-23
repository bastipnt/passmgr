import { zodResolver } from "@hookform/resolvers/zod";
import {
  accountProfileEntry,
  RECOVERY_ERROR_MESSAGES,
  RECOVERY_OFFLINE_NOTE,
  SessionContext,
  useRecovery,
  useStore,
} from "@repo/client";
import { localRecoverFormSchema, type RecoverFormValues, recoverFormSchema } from "@repo/schema";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useContext, useImperativeHandle, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Text, View } from "react-native";
import { RecoveryKeyDialog } from "./RecoveryKeyDialog";

type RecoverSheetProps = {
  ref: Ref<BottomSheetRef>;
  /** Recover the active local vault on the device (ADR 0001 D10): no email, no server. */
  local?: boolean;
  /** Called after the user saves the new recovery key, to open the sign-in sheet. */
  onSwitchToSignIn: () => void;
};

/**
 * "Forgot password?": reset the master password with the recovery key. A
 * local vault's stays on the device; an account on this device resets here
 * too and the server follows once online; any other account needs the server.
 */
export function RecoverSheet({
  ref,
  local: localRequested = false,
  onSwitchToSignIn,
}: RecoverSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { profile, profiles } = useStore();
  const { networkOffline } = useContext(SessionContext);
  const local = localRequested && profile?.mode === "local";
  const { recover, recoverLocal, recoveryError } = useRecovery();
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);
  const [recoveredEmail, setRecoveredEmail] = useState("");

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control, reset } = useForm<RecoverFormValues>({
    resolver: zodResolver(local ? localRecoverFormSchema : recoverFormSchema),
    defaultValues: { email: "", recoveryKey: "", password: "", confirmPassword: "" },
  });
  const email = useWatch({ control, name: "email" });
  const offline = networkOffline && !local && !!accountProfileEntry(profiles, email ?? "");

  const onSubmit = async ({ email, recoveryKey, password }: RecoverFormValues) => {
    setLoading(true);
    let key: Uint8Array | undefined;
    try {
      key = local
        ? await recoverLocal(recoveryKey, password)
        : await recover(email, recoveryKey, password);
    } finally {
      setLoading(false);
    }
    if (!key) return;
    // Dismiss the form sheet, then present the new key over the welcome screen.
    sheetRef.current?.triggerShowHide(false);
    reset();
    setRecoveredEmail(local ? "" : email);
    setNewRecoveryKey(key);
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        email={recoveredEmail || undefined}
        description={
          local
            ? "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never leaves this device."
            : "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
        }
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
            {local
              ? "Use the recovery key you saved when you created this vault."
              : "Use the recovery key you saved when you signed up. You'll be signed out on all devices."}
          </Text>
        </View>

        <FormLock locked={loading} className="gap-5">
          {!local && (
            <ControlledInput
              control={control}
              name="email"
              label="Email"
              autoCapitalize="none"
              autoComplete="username"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          )}
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

        {recoveryError ? (
          <FieldError
            variant="box"
            errors={[{ message: RECOVERY_ERROR_MESSAGES[recoveryError] }]}
          />
        ) : (
          offline && (
            <Text className="text-muted-foreground text-sm">
              You&apos;re offline. {RECOVERY_OFFLINE_NOTE}
            </Text>
          )
        )}
      </BottomSheet>
    </>
  );
}
