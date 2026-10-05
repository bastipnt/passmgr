import { zodResolver } from "@hookform/resolvers/zod";
import { type ConnectResult, useConnectServer, useStore } from "@repo/client";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledPasswordInput,
  FieldError,
  FormLock,
} from "@repo/ui-native";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";
import z from "zod";

const passwordSchema = z.object({ password: z.string().min(8) });

type FormValues = z.infer<typeof passwordSchema>;

const FAILURE_MESSAGES: Record<Exclude<ConnectResult, "online" | "cancelled">, string> = {
  rejected: "The server didn't accept this password for your account.",
  throttled: "Too many login attempts. Please wait and try again.",
  unreachable: "Couldn't reach the server. Check your connection and try again.",
};

type ReconnectSheetProps = {
  ref: Ref<BottomSheetRef>;
};

/**
 * Sign in again while the vault is unlocked `offline` (ADR 0001 D2): the
 * server session expired, and a restored mobile session has no password in
 * memory to reconnect with. Only attaches server auth; the vault stays as it is.
 */
export function ReconnectSheet({ ref }: ReconnectSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { profile } = useStore();
  const { connect } = useConnectServer();
  const [loading, setLoading] = useState(false);
  // Why the last attempt failed; the result is shared with any connect
  // already running (e.g. the auto-reconnect), so it's the real outcome.
  const [failure, setFailure] = useState<Exclude<ConnectResult, "online">>();

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control, watch, reset } = useForm<FormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type === "change") setFailure(undefined);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const onSubmit = async ({ password }: FormValues) => {
    setLoading(true);
    setFailure(undefined);
    try {
      const result = await connect(password);
      if (result === "online") {
        reset();
        sheetRef.current?.triggerShowHide(false);
      } else setFailure(result);
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
          Sign in
        </Button>
      }
    >
      <View className="gap-1">
        <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
          Sign in again
        </Text>
        <Text className="text-muted-foreground text-sm">
          {profile?.mode === "linked"
            ? `Your session for ${profile.email} ended. Sign in to sync again.`
            : "Sign in to sync again."}
        </Text>
      </View>

      <FormLock locked={loading} className="gap-5">
        <ControlledPasswordInput
          control={control}
          name="password"
          label="Password"
          textContentType="password"
        />
      </FormLock>

      {failure && failure !== "cancelled" && (
        <FieldError variant="box" errors={[{ message: FAILURE_MESSAGES[failure] }]} />
      )}
    </BottomSheet>
  );
}
