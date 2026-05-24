import { useState } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useLogin, useUnlock } from "@repo/client";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Button, Form, View } from "tamagui";
import {
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
import { timed } from "@repo/client/src/util/perf";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { loginUser, loginError } = useLogin();
  const { unlock, unlockError } = useUnlock();
  const [loading, setLoading] = useState(false);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    try {
      const unlockInfo = await timed("total login time", () => loginUser(email, password));
      if (!unlockInfo) return;
      await timed("total unlock time", () => unlock(unlockInfo));
      router.replace("/(app)");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} flex={1}>
      <View flex={1} justify="center" content="center" p="$4">
        <Form>
          <Card>
            <CardHeader>
              <CardTitle>Login</CardTitle>
              <CardAction>
                <Link href="/(auth)/register">Sign Up</Link>
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
                  textContentType="password"
                />
              </FieldGroup>

              {(loginError || unlockError) && (
                <FieldError errors={[{ message: "Login error please try again" }]} />
              )}
            </CardContent>

            <CardFooter>
              <Form.Trigger asChild>
                <Button onPress={handleSubmit(onSubmit)}>
                  Login
                  {loading && <Spinner />}
                </Button>
              </Form.Trigger>
            </CardFooter>
          </Card>
        </Form>
      </View>
    </KeyboardAvoidingView>
  );
}
