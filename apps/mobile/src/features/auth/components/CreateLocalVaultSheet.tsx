import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateLocalVault } from "@repo/client";
import { getStrengthFromString } from "@repo/crypto";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
  StrengthMeter,
} from "@repo/ui-native";
import { type Ref, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Text, View } from "react-native";
import z from "zod";
import { RecoveryKeyDialog } from "./RecoveryKeyDialog";

const localVaultSchema = z
  .object({
    name: z.string().max(60),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof localVaultSchema>;

type CreateLocalVaultSheetProps = {
  ref: Ref<BottomSheetRef>;
};

/**
 * A vault on this device only: no server, no account, no email (ADR 0001 D2),
 * added next to the profiles already on the device.
 */
export function CreateLocalVaultSheet({ ref }: CreateLocalVaultSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { createLocalVault, finishLocalVault, createError } = useCreateLocalVault();
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(localVaultSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });
  const strength = useMemo(() => (password ? getStrengthFromString(password) : null), [password]);

  const onSubmit = async ({ name, password }: FormValues) => {
    setLoading(true);
    let key: Uint8Array | undefined;
    try {
      key = await createLocalVault(password, name);
    } finally {
      setLoading(false);
    }
    if (!key) return;
    // Dismiss the form sheet, then present the recovery key over the welcome screen.
    sheetRef.current?.triggerShowHide(false);
    setRecoveryKey(key);
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={recoveryKey}
        onDone={() => {
          setRecoveryKey(null);
          // Unlocking swaps the root guard over to the app. If it fails, the
          // welcome screen offers the password unlock (the vault exists).
          void finishLocalVault().then((unlocked) => {
            if (!unlocked) sheetRef.current?.triggerShowHide(true);
          });
        }}
      />

      <BottomSheet
        ref={sheetRef}
        snapPoints={["full"]}
        className="gap-6 px-6 pt-7 pb-6"
        footer={
          <Button size="lg" loading={loading} onPress={handleSubmit(onSubmit)}>
            Create vault
          </Button>
        }
      >
        <View className="gap-1">
          <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
            Vault on this device
          </Text>
          <Text className="text-muted-foreground text-sm">
            No account, nothing leaves this device. You can add an account to sync later.
          </Text>
        </View>

        <FormLock locked={loading} className="gap-5">
          <ControlledInput
            control={control}
            name="name"
            label="Name (optional)"
            placeholder="e.g. Personal"
            autoCapitalize="words"
          />
          <ControlledPasswordInput
            control={control}
            name="password"
            label="Master password"
            textContentType="newPassword"
            note={strength && <StrengthMeter level={strength.level} label={strength.label} />}
          />
          <ControlledPasswordInput
            control={control}
            name="confirmPassword"
            label="Confirm password"
            textContentType="newPassword"
          />
        </FormLock>

        {createError && (
          <FieldError
            variant="box"
            errors={[
              {
                message:
                  createError === "unlock_failed"
                    ? "Your vault was created, but it couldn't be opened. Close this and unlock it with your password."
                    : "Creating the vault failed. Please try again.",
              },
            ]}
          />
        )}
      </BottomSheet>
    </>
  );
}
