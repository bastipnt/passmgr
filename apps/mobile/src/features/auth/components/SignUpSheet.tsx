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
    const key = await registerNewUser(email, password);
    setLoading(false);
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
        className="gap-lg p-lg"
        footer={
          <Button
            size="lg"
            textClassName="font-bold"
            disabled={!agreed}
            loading={loading}
            onPress={handleSubmit(onSubmit)}
          >
            Create account
          </Button>
        }
      >
        <View className="gap-1">
          <Text className="font-bold text-2xl text-foreground">Create account</Text>
          <Text className="text-muted-foreground text-sm">Set up your secure vault.</Text>
        </View>

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

        {registrationError && (
          <FieldError
            errors={[{ message: "Error when trying to register a new account please try again" }]}
          />
        )}
      </BottomSheet>
    </>
  );
}
