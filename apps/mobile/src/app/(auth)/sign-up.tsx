import { useMemo, useState } from "react";
import { Modal, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useRegistration } from "@repo/client";
import { getStrengthFromString, wipe } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Button, Text, View } from "tamagui";
import {
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  SheetScene,
  StrengthMeter,
  useForm,
  useWatch,
} from "@repo/ui-native";
import { TermsRow } from "@/components/TermsRow";

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

export default function SignUpScreen() {
  const router = useRouter();
  const { registerNewUser, registrationError } = useRegistration();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });
  const strength = useMemo(() => (password ? getStrengthFromString(password) : null), [password]);

  const recoveryKeyB64 = useMemo(() => (recoveryKey ? toBase64(recoveryKey) : ""), [recoveryKey]);

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    const key = await registerNewUser(email, password);
    setLoading(false);
    if (key) setRecoveryKey(key);
  };

  const onCopy = async () => {
    if (!recoveryKey) return;
    await Clipboard.setStringAsync(recoveryKeyB64);
    setCopied(true);
  };

  const onConfirm = () => {
    if (recoveryKey) wipe(recoveryKey);
    setRecoveryKey(null);
    setCopied(false);
    router.replace("/(auth)/sign-in");
  };

  return (
    <>
      <Modal visible={recoveryKey !== null} transparent animationType="fade">
        <View>
          <View>
            <Text>Save your recovery key</Text>
            <Text>
              Store this key in a safe place. It is the only way to recover your vault if you forget
              your password. It is shown once and never sent to the server.
            </Text>
            <Pressable onLongPress={onCopy}>
              <Text selectable>{recoveryKeyB64}</Text>
            </Pressable>
            <View>
              <Button variant="outlined" onPress={onCopy}>
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
              <Button onPress={onConfirm} disabled={!copied}>
                I saved it
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <SheetScene
        title="Create account"
        subtitle="Set up your secure vault."
        actionLabel="Create account"
        loading={loading}
        actionDisabled={!agreed}
        onAction={handleSubmit(onSubmit)}
      >
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
      </SheetScene>
    </>
  );
}
