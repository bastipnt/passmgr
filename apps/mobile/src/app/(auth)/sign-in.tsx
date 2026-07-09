import { useState } from "react";
import { useRouter } from "expo-router";
import { useLogin, useUnlock } from "@repo/client";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Text, View } from "tamagui";
import {
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  SheetScene,
  useForm,
} from "@repo/ui-native";
import { timed } from "@repo/client/src/util/perf";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

export default function SignInScreen() {
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
    <SheetScene
      title="Sign in"
      subtitle="Welcome back to Passmgr."
      actionLabel="Sign in"
      loading={loading}
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
        textContentType="password"
        note={
          <View self="flex-end" mt="$xs" hitSlop={8} onPress={() => {}}>
            {/* TODO: wire a real password-reset flow */}
            <Text fontSize="$xs" fontWeight="$bold" lineHeight="$sm" color="$primary">
              Forgot password?
            </Text>
          </View>
        }
      />

      {(loginError || unlockError) && (
        <FieldError errors={[{ message: "Login error please try again" }]} />
      )}
    </SheetScene>
  );
}
