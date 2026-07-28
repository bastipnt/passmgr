import { useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import * as Clipboard from "expo-clipboard";
import { useRegistration } from "@repo/client";
import { getStrengthFromString, wipe } from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import {
  BottomSheet,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  Spinner,
  StrengthMeter,
  type BottomSheetRef,
} from "@repo/ui-native";
import { TermsRow } from "@/components/TermsRow";
import { useForm, useWatch } from "react-hook-form";

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

/**
 * Hosts the recovery-key dialog above the app. iOS avoids RN's `Modal`:
 * presenting an `@expo/ui` BottomSheet installs a window-level gesture recogniser
 * that outlives the sheet and cancels touches inside `RCTModalHostView`, so the
 * dialog's buttons would reach `onPressIn` but never fire `onPress`.
 * `FullWindowOverlay` renders through RN's own surface, which is unaffected.
 */
function DialogPortal({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  if (Platform.OS === "ios") {
    if (!visible) return null;
    return (
      <FullWindowOverlay>
        <View style={StyleSheet.absoluteFill}>{children}</View>
      </FullWindowOverlay>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

type SignUpSheetProps = {
  ref: Ref<BottomSheetRef>;
  /** Called after the user saves their recovery key, to open the sign-in sheet. */
  onSwitchToSignIn: () => void;
};

export function SignUpSheet({ ref, onSwitchToSignIn }: SignUpSheetProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const { registerNewUser, registrationError } = useRegistration();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => sheetRef.current?.triggerShowHide(show),
  }));

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
    if (!key) return;
    // Dismiss the form sheet, then present the recovery key over the welcome screen.
    sheetRef.current?.triggerShowHide(false);
    setRecoveryKey(key);
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
    onSwitchToSignIn();
  };

  return (
    <>
      <DialogPortal visible={recoveryKey !== null} onRequestClose={onConfirm}>
        <View className="flex-1 items-center justify-center bg-black/50 p-lg">
          <View className="w-full gap-md rounded-xl bg-card p-lg">
            <Text className="text-lg font-bold text-card-foreground">Save your recovery key</Text>
            <Text className="text-sm text-muted-foreground">
              Store this key in a safe place. It is the only way to recover your vault if you forget
              your password. It is shown once and never sent to the server.
            </Text>
            <Pressable onLongPress={onCopy}>
              <Text selectable className="text-md text-foreground">
                {recoveryKeyB64}
              </Text>
            </Pressable>
            {/* `native={false}`: SwiftUI hosts stay unmounted inside a
                `FullWindowOverlay` — see the note in `RemoveDialog`. */}
            <View className="gap-sm">
              <Button native={false} variant="outline" onPress={onCopy}>
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
              <Button native={false} onPress={onConfirm} disabled={!copied}>
                I saved it
              </Button>
            </View>
          </View>
        </View>
      </DialogPortal>

      <BottomSheet
        ref={sheetRef}
        snapPoints={["full"]}
        className="p-lg gap-lg"
        footer={
          <Button
            size="lg"
            textClassName="font-bold"
            disabled={!agreed || loading}
            onPress={handleSubmit(onSubmit)}
            icon={loading ? <Spinner colorClassName="text-primary-foreground" /> : undefined}
          >
            Create account
          </Button>
        }
      >
        <View className="gap-1">
          <Text className="text-2xl font-bold text-foreground">Create account</Text>
          <Text className="text-sm text-muted-foreground">Set up your secure vault.</Text>
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
      </BottomSheet>
    </>
  );
}
