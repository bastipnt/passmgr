import { useMemo, useState } from "react";
import { Modal, Platform, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useRegistration } from "@repo/client";
import { wipe } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FieldGroup,
  KeyboardAvoidingView,
  Link,
  Spinner,
  useForm,
} from "@repo/ui-native";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Text, View } from "tamagui";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const { registerNewUser, registrationError } = useRegistration();
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

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
    router.replace("/(auth)/login");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

      <View flex={1} justify="center" content="center" p="$lg">
        <Card>
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardAction>
              <Link href="/(auth)/login">Login</Link>
            </CardAction>
          </CardHeader>

          <CardContent>
            <FieldGroup>
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
              />
            </FieldGroup>

            {registrationError && (
              <FieldError
                errors={[
                  { message: "Error when trying to register a new account please try again" },
                ]}
              />
            )}
          </CardContent>

          <CardFooter>
            <Button onPress={handleSubmit(onSubmit)}>
              Sign Up
              {loading && <Spinner />}
            </Button>
          </CardFooter>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
