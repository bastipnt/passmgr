import { zodResolver } from "@hookform/resolvers/zod";
import { useRegistration } from "@repo/client";
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
import { TermsRow } from "@/components/TermsRow";
import { RecoveryKeyDialog } from "./RecoveryKeyDialog";

const credentialsSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof credentialsSchema>;

type SignUpSheetProps = {
  ref: Ref<BottomSheetRef>;
  /** Called after the user saves their recovery key, to open the sign-in sheet. */
  onSwitchToSignIn: () => void;
};

export function SignUpSheet({ ref, onSwitchToSignIn }: SignUpSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { registerNewUser, registrationError } = useRegistration();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });
  const strength = useMemo(() => (password ? getStrengthFromString(password) : null), [password]);

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    let key: Uint8Array | undefined;
    try {
      key = await registerNewUser(email, password);
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
          onSwitchToSignIn();
        }}
      />

      <BottomSheet
        ref={sheetRef}
        snapPoints={["full"]}
        className="gap-6 px-6 pt-7 pb-6"
        footer={
          <Button size="lg" disabled={!agreed} loading={loading} onPress={handleSubmit(onSubmit)}>
            Create account
          </Button>
        }
      >
        <View className="gap-1">
          <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
            Create account
          </Text>
          <Text className="text-muted-foreground text-sm">Set up your secure vault.</Text>
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
          <ControlledPasswordInput
            control={control}
            name="password"
            label="Password"
            textContentType="newPassword"
            note={strength && <StrengthMeter level={strength.level} label={strength.label} />}
          />
          <ControlledPasswordInput
            control={control}
            name="confirmPassword"
            label="Confirm password"
            textContentType="newPassword"
          />

          <TermsRow checked={agreed} onChange={setAgreed} />
        </FormLock>

        {registrationError && (
          <FieldError
            variant="box"
            errors={[{ message: "Error when trying to register a new account please try again" }]}
          />
        )}
      </BottomSheet>
    </>
  );
}
