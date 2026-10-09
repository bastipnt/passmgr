import { zodResolver } from "@hookform/resolvers/zod";
import { LINK_ACCOUNT_ERROR_MESSAGES, useAppConfig, useLinkAccount } from "@repo/client";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useImperativeHandle, useRef } from "react";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";
import z from "zod";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
  invite: z.string().max(128),
});

type FormValues = z.infer<typeof schema>;

/**
 * Create an online account from this local vault (ADR 0001 D9): same master
 * password, same recovery key. The vault then syncs with the account.
 */
export function CreateAccountSheet({ ref }: { ref: Ref<BottomSheetRef> }) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { registrationEnabled } = useAppConfig();
  const { linkAccount, linkError, clearLinkError, linking } = useLinkAccount();

  const { handleSubmit, control, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", invite: "" },
  });

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => {
      if (show) clearLinkError();
      else reset();
      sheetRef.current?.triggerShowHide(show);
    },
  }));

  const onSubmit = async ({ email, password, invite }: FormValues) => {
    if (await linkAccount(email, password, invite)) {
      reset();
      sheetRef.current?.triggerShowHide(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={["full"]}
      // The typed password doesn't outlive the sheet.
      onDismiss={() => reset()}
      className="gap-6 px-6 pt-7 pb-6"
      footer={
        <Button size="lg" loading={linking} onPress={handleSubmit(onSubmit)}>
          Create account
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
          Create online account
        </Text>
        <Text className="text-muted-foreground text-sm">
          Your vault keeps its master password and recovery key. Once the account exists, everything
          in it syncs, end-to-end encrypted.
        </Text>
      </View>

      <FormLock locked={linking} className="gap-5">
        <ControlledInput
          control={control}
          name="email"
          label="Email"
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <ControlledPasswordInput
          control={control}
          name="password"
          label="Master password"
          textContentType="password"
        />
        {!registrationEnabled && (
          <ControlledInput
            control={control}
            name="invite"
            label="Invite code"
            autoCapitalize="none"
            autoComplete="off"
          />
        )}
      </FormLock>

      {linkError && (
        <FieldError variant="box" errors={[{ message: LINK_ACCOUNT_ERROR_MESSAGES[linkError] }]} />
      )}
    </BottomSheet>
  );
}
