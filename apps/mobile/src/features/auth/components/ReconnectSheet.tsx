import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ConnectResult,
  useConnectServer,
  useSecondFactorRequest,
  useStore,
} from "@repo/client";
import { passwordSchema } from "@repo/schema";
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
import { SecondFactorStep } from "./SecondFactorStep";

const reconnectSchema = z.object({ password: passwordSchema });

type FormValues = z.infer<typeof reconnectSchema>;

const FAILURE_MESSAGES: Record<Exclude<ConnectResult, "online" | "cancelled">, string> = {
  rejected: "The server didn't accept this password for your account.",
  throttled: "Too many login attempts. Please wait and try again.",
  unreachable: "Couldn't reach the server. Check your connection and try again.",
  second_factor: "The two-factor step didn't finish. Sign in again to get a new code prompt.",
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
  // An account with two-factor on: the code step takes the form's place.
  const secondFactor = useSecondFactorRequest();
  const { request: secondFactorRequest } = secondFactor;
  const { connect } = useConnectServer(secondFactor.prompt);
  const [loading, setLoading] = useState(false);
  // Why the last attempt failed; the result is shared with any connect
  // already running (e.g. the auto-reconnect), so it's the real outcome.
  const [failure, setFailure] = useState<Exclude<ConnectResult, "online">>();

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

  const { handleSubmit, control, watch, reset } = useForm<FormValues>({
    resolver: zodResolver(reconnectSchema),
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
      onDismiss={secondFactor.cancel}
      footer={
        secondFactorRequest ? (
          <View />
        ) : (
          <Button size="lg" loading={loading} onPress={handleSubmit(onSubmit)}>
            Sign in
          </Button>
        )
      }
    >
      {secondFactorRequest && (
        <SecondFactorStep
          request={secondFactorRequest}
          onSubmit={secondFactor.submit}
          onCancel={secondFactor.cancel}
        />
      )}
      <View className={secondFactorRequest ? "hidden" : "gap-6"}>
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
      </View>
    </BottomSheet>
  );
}
