import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useUnlock } from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
} from "@repo/ui-native";
import { type Ref, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import z from "zod";

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
      className="gap-lg p-lg"
      footer={
        <Button
          size="lg"
          textClassName="font-bold"
          loading={loading}
          onPress={handleSubmit(onSubmit)}
        >
          Sign in
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="font-bold text-2xl text-foreground">Sign in</Text>
        <Text className="text-muted-foreground text-sm">Welcome back to Passmgr.</Text>
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
            <Text className="font-bold text-primary text-xs">Forgot password?</Text>
          </Pressable>
        }
      />

      {(loginError || unlockError) && (
        <FieldError errors={[{ message: "Login error please try again" }]} />
      )}
    </BottomSheet>
  );
}
