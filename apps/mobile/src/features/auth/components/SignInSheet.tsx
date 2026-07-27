import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Pressable, Text, View } from "react-native";
import { useLogin, useUnlock } from "@repo/client";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import {
  BottomSheet,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  Spinner,
  type BottomSheetRef,
} from "@repo/ui-native";
import { timed } from "@repo/client/src/util/perf";
import { useForm } from "react-hook-form";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

export function SignInSheet({ ref }: { ref: Ref<BottomSheetRef> }) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { loginUser, loginError } = useLogin();
  const { unlock, unlockError } = useUnlock();
  const [loading, setLoading] = useState(false);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    try {
      const unlockInfo = await timed("total login time", () => loginUser(email, password));
      if (!unlockInfo) return;
      // Close the sheet before unlocking. `unlock()` flips `loggedIn`, which makes the
      // root `!loggedIn` guard swap to `(app)`; dismissing the native sheet first keeps
      // its window-level gesture recogniser from lingering over the new screen.
      sheetRef.current?.triggerShowHide(false);
      await timed("total unlock time", () => unlock(unlockInfo));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      className="p-lg gap-lg"
      footer={
        <Button
          size="lg"
          textClassName="font-bold"
          disabled={loading}
          onPress={handleSubmit(onSubmit)}
          icon={loading ? <Spinner colorClassName="text-primary-foreground" /> : undefined}
        >
          Sign in
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="text-2xl font-bold text-foreground">Sign in</Text>
        <Text className="text-sm text-muted-foreground">Welcome back to Passmgr.</Text>
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
        textContentType="password"
        note={
          <Pressable className="mt-xs self-end" hitSlop={8} onPress={() => {}}>
            {/* TODO: wire a real password-reset flow */}
            <Text className="text-xs font-bold text-primary">Forgot password?</Text>
          </Pressable>
        }
      />

      {(loginError || unlockError) && (
        <FieldError errors={[{ message: "Login error please try again" }]} />
      )}
    </BottomSheet>
  );
}
