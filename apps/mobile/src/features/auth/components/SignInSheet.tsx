import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useStore, useUnlock } from "@repo/client";
import { timed } from "@repo/client/src/util/perf";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import z from "zod";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

// A local vault opens with the password alone: the email isn't checked.
const localUnlockSchema = z.object({
  email: z.string(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof credentialsSchema>;

type SignInSheetProps = {
  ref: Ref<BottomSheetRef>;
  /** Opens the recovery-key flow. */
  onForgotPassword: () => void;
};

export function SignInSheet({ ref, onForgotPassword }: SignInSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { loginUser, clearLoginError, loginError, loginThrottled } = useLogin();
  const { unlock, unlockLocal, unlockError, clearUnlockError } = useUnlock();
  const [loading, setLoading] = useState(false);
  const { profile, accountKeyMaterial } = useStore();
  // This device's vault opens with the password alone (ADR 0001 D2). A vault
  // without an account has nothing else to sign in to: signing in to an
  // account would replace it. May flip once the profile loads: the resolver is
  // read on every render.
  const localVault = profile?.mode === "local" && accountKeyMaterial !== null;
  const storedEmail = profile?.mode === "linked" && accountKeyMaterial ? profile.email : undefined;
  const [otherAccount, setOtherAccount] = useState(false);
  const unlocking = localVault || (storedEmail !== undefined && !otherAccount);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(localVault ? localUnlockSchema : credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  // The hidden email field carries the stored account while unlocking.
  useEffect(() => {
    setValue("email", unlocking ? (storedEmail ?? "") : "");
  }, [unlocking, storedEmail, setValue]);

  // Editing the credentials makes a shown error stale. The throttle warning stays:
  // an edit alone does not lift the server's lock.
  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type !== "change") return;
      clearLoginError();
      clearUnlockError();
    });
    return () => subscription.unsubscribe();
  }, [watch, clearLoginError, clearUnlockError]);

  const onSubmit = async ({ email, password }: FormValues) => {
    setLoading(true);
    try {
      if (unlocking) {
        // Unlocks without the server; the session follows in the background.
        // Same sheet-first dismissal as below.
        sheetRef.current?.triggerShowHide(false);
        const unlocked = await timed("total unlock time", () => unlockLocal(password));
        if (!unlocked) sheetRef.current?.triggerShowHide(true);
        return;
      }

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
      className="gap-6 px-6 pt-7 pb-6"
      footer={
        <Button size="lg" loading={loading} onPress={handleSubmit(onSubmit)}>
          {unlocking ? "Unlock" : "Sign in"}
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
          {unlocking ? "Unlock" : "Sign in"}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {localVault
            ? "Vault on this device · no account"
            : unlocking
              ? storedEmail
              : "Welcome back to Passmgr."}
        </Text>
      </View>

      <FormLock locked={loading} className="gap-5">
        {!unlocking && (
          <ControlledInput
            control={control}
            name="email"
            label="Email"
            autoCapitalize="none"
            autoComplete="username"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        )}

        <ControlledPasswordInput
          control={control}
          name="password"
          label="Password"
          textContentType="password"
          note={
            // TODO(offline-first): local recovery with the recovery key (ADR 0001 D10).
            !localVault && (
              <Pressable
                className="mt-1 self-end"
                hitSlop={8}
                onPress={() => {
                  sheetRef.current?.triggerShowHide(false);
                  onForgotPassword();
                }}
              >
                <Text className="text-muted-foreground text-xs underline">Forgot password?</Text>
              </Pressable>
            )
          }
        />
      </FormLock>

      {storedEmail !== undefined && (
        <Pressable
          className="self-center"
          hitSlop={8}
          onPress={() => {
            clearLoginError();
            clearUnlockError();
            setOtherAccount((other) => !other);
          }}
        >
          <Text className="text-muted-foreground text-xs underline">
            {unlocking ? "Use another account" : `Unlock ${storedEmail} instead`}
          </Text>
        </Pressable>
      )}

      {loginThrottled ? (
        <FieldError
          variant="box"
          errors={[{ message: "Too many login attempts. Please wait and try again." }]}
        />
      ) : (
        (loginError || unlockError) && (
          <FieldError
            variant="box"
            errors={[
              {
                message:
                  unlockError === "local_vault"
                    ? "This device holds a vault without an account. Signing in here would replace it."
                    : unlockError === "unsynced_changes"
                      ? "This device has changes that haven't synced yet. Sign in to their account and let them sync, or remove the vault from this device first."
                      : unlockError === "account_changed"
                        ? "This email now belongs to another account. Remove the vault on this device to sign in to it."
                        : localVault
                          ? "Wrong password, please try again"
                          : "Login error please try again",
              },
            ]}
          />
        )
      )}
    </BottomSheet>
  );
}
