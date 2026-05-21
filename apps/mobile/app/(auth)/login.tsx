import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useLogin, useUnlockSimple } from "@repo/client";
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
  Link,
  spacing,
  useForm,
} from "@repo/ui-native";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { loginUser, loginError } = useLogin();
  const { unlock, unlockError } = useUnlockSimple();
  const [loading, setLoading] = useState(false);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    const unlockInfo = await loginUser(email, password);
    if (!unlockInfo) {
      setLoading(false);
      return;
    }
    await unlock(unlockInfo);
    setLoading(false);
    router.replace("/(app)");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.inner}>
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
            <Button onPress={handleSubmit(onSubmit)} loading={loading}>
              Login
            </Button>
          </CardFooter>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
});
