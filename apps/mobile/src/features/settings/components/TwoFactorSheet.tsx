import { zodResolver } from "@hookform/resolvers/zod";
import {
  qrCodePath,
  type TotpEnrollment,
  TWO_FACTOR_ERROR_MESSAGES,
  useSecondFactorRequest,
  useTwoFactor,
} from "@repo/client";
import {
  type TotpConfirmFormValues,
  type TwoFactorPasswordFormValues,
  totpConfirmFormSchema,
  twoFactorPasswordFormSchema,
} from "@repo/schema";
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  ControlledInput,
  ControlledPasswordInput,
  FieldError,
  FormLock,
  toast,
} from "@repo/ui-native";
import * as Clipboard from "expo-clipboard";
import { type Ref, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Linking, Share, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SecondFactorStep } from "@/features/auth/components/SecondFactorStep";

/** Quiet zone around the QR code, in modules; scanners want at least 4. */
const QUIET_ZONE = 4;

export type TwoFactorAction = "enable" | "disable" | "regenerate";

type Step =
  | { kind: "password" }
  | { kind: "setup"; enrollment: TotpEnrollment }
  | { kind: "codes"; codes: string[] };

export type TwoFactorSheetRef = { open: (action: TwoFactorAction) => void };

const TITLES: Record<TwoFactorAction, string> = {
  enable: "Turn on two-factor",
  disable: "Turn off two-factor",
  regenerate: "New backup codes",
};

const DESCRIPTIONS: Record<TwoFactorAction, string> = {
  enable:
    "Signing in to your account will also ask for a code from an authenticator app. Enter your password to start.",
  disable:
    "Signing in to your account will need only your password again. Your backup codes stop working.",
  regenerate: "Your current backup codes stop working and you get ten new ones.",
};

const groupSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

const codesText = (codes: string[]) =>
  `passmgr two-factor backup codes\nEach code works once.\n\n${codes.join("\n")}\n`;

function EnrollmentQr({ uri }: { uri: string }) {
  const qr = useMemo(() => qrCodePath(uri), [uri]);
  const box = qr.size + QUIET_ZONE * 2;
  // A whole number of points per module: react-native-svg has no crispEdges.
  const side = box * Math.max(3, Math.floor(200 / box));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code for your authenticator app"
      className="self-center overflow-hidden rounded-lg bg-white"
    >
      <Svg width={side} height={side} viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}>
        <Path d={qr.path} fill="#000" />
      </Svg>
    </View>
  );
}

/**
 * Web's two-factor dialogs in one sheet: turn it on (master password, the
 * secret into the authenticator app, its first code, the backup codes), turn
 * it off, or get new backup codes. With two-factor on, the fresh login asks
 * for a code here too.
 */
export function TwoFactorSheet({ ref }: { ref: Ref<TwoFactorSheetRef> }) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const [action, setAction] = useState<TwoFactorAction>("enable");
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [saved, setSaved] = useState(false);
  const secondFactor = useSecondFactorRequest();
  const { request: secondFactorRequest } = secondFactor;
  const { startEnrollment, confirm, disable, regenerateBackupCodes, error, clearError, pending } =
    useTwoFactor(secondFactor.prompt);

  const passwordForm = useForm<TwoFactorPasswordFormValues>({
    resolver: zodResolver(twoFactorPasswordFormSchema),
    defaultValues: { password: "" },
  });
  const codeForm = useForm<TotpConfirmFormValues>({
    resolver: zodResolver(totpConfirmFormSchema),
    defaultValues: { code: "" },
  });

  const close = () => sheetRef.current?.triggerShowHide(false);

  useImperativeHandle(ref, () => ({
    open: (next) => {
      setAction(next);
      setStep({ kind: "password" });
      setSaved(false);
      clearError();
      passwordForm.reset();
      codeForm.reset();
      sheetRef.current?.triggerShowHide(true);
    },
  }));

  const onPassword = passwordForm.handleSubmit(async ({ password }) => {
    if (action === "enable") {
      const enrollment = await startEnrollment(password);
      if (enrollment) setStep({ kind: "setup", enrollment });
    } else if (action === "disable") {
      if (await disable(password)) close();
    } else {
      const codes = await regenerateBackupCodes(password);
      if (codes) setStep({ kind: "codes", codes });
    }
    passwordForm.reset();
  });

  const onCode = codeForm.handleSubmit(async ({ code }) => {
    const codes = await confirm(code);
    if (codes) setStep({ kind: "codes", codes });
  });

  const footer = secondFactorRequest ? (
    <View />
  ) : step.kind === "password" ? (
    <Button
      size="lg"
      loading={pending}
      variant={action === "disable" ? "destructive" : "default"}
      onPress={onPassword}
    >
      {action === "disable" ? "Turn off" : "Continue"}
    </Button>
  ) : step.kind === "setup" ? (
    <Button size="lg" loading={pending} onPress={onCode}>
      Turn on
    </Button>
  ) : (
    <Button size="lg" disabled={!saved} onPress={close}>
      I saved them
    </Button>
  );

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={["full"]}
      onDismiss={() => {
        secondFactor.cancel();
        passwordForm.reset();
      }}
      className="gap-6 px-6 pt-7 pb-6"
      footer={footer}
    >
      {secondFactorRequest ? (
        <SecondFactorStep
          request={secondFactorRequest}
          onSubmit={secondFactor.submit}
          onCancel={secondFactor.cancel}
        />
      ) : (
        <>
          <View className="gap-1">
            <Text className="font-display-bold text-[28px] text-foreground tracking-[-0.6px]">
              {step.kind === "codes" ? "Save your backup codes" : TITLES[action]}
            </Text>
            <Text className="text-muted-foreground text-sm">
              {step.kind === "password" && DESCRIPTIONS[action]}
              {step.kind === "setup" &&
                "Add this account to your authenticator app, then enter the code it shows. Keep these codes in an app outside this vault: they're needed to get back in."}
              {step.kind === "codes" &&
                "Each code signs you in once if you lose your authenticator. They're shown only now: save them somewhere safe, outside this vault."}
            </Text>
          </View>

          {step.kind === "password" && (
            <FormLock locked={pending} className="gap-5">
              <ControlledPasswordInput
                control={passwordForm.control}
                name="password"
                label="Password"
                textContentType="password"
              />
            </FormLock>
          )}

          {step.kind === "setup" && (
            <FormLock locked={pending} className="gap-5">
              <EnrollmentQr uri={step.enrollment.uri} />
              <View className="gap-2">
                <Text className="text-muted-foreground text-sm">Or enter this setup key:</Text>
                <Text selectable className="font-mono-medium text-foreground text-sm leading-6">
                  {groupSecret(step.enrollment.secret)}
                </Text>
                <View className="flex-row gap-3">
                  <Button
                    variant="glass"
                    className="flex-1"
                    onPress={() => void Clipboard.setStringAsync(step.enrollment.secret)}
                  >
                    Copy key
                  </Button>
                  <Button
                    variant="glass"
                    className="flex-1"
                    onPress={() =>
                      Linking.openURL(step.enrollment.uri).catch(() =>
                        toast.error("No authenticator app found", {
                          description: "Enter the setup key in your app instead.",
                        }),
                      )
                    }
                  >
                    Open in app
                  </Button>
                </View>
              </View>
              <ControlledInput
                control={codeForm.control}
                name="code"
                label="Code from the app"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </FormLock>
          )}

          {step.kind === "codes" && (
            <View className="gap-4">
              <View className="flex-row flex-wrap rounded-2xl border border-foreground/10 bg-foreground/3 px-5 py-4 dark:border-white/10 dark:bg-black/30">
                {step.codes.map((code) => (
                  <Text
                    key={code}
                    selectable
                    className="w-1/2 py-0.5 font-mono-medium text-foreground text-sm"
                  >
                    {code}
                  </Text>
                ))}
              </View>
              <View className="flex-row gap-3">
                <Button
                  variant="glass"
                  className="flex-1"
                  onPress={() =>
                    void Clipboard.setStringAsync(codesText(step.codes)).then(() => setSaved(true))
                  }
                >
                  Copy
                </Button>
                <Button
                  variant="glass"
                  className="flex-1"
                  onPress={() =>
                    void Share.share({ message: codesText(step.codes) }).then((result) => {
                      if (result.action === Share.sharedAction) setSaved(true);
                    })
                  }
                >
                  Share
                </Button>
              </View>
            </View>
          )}

          {error && (
            <FieldError variant="box" errors={[{ message: TWO_FACTOR_ERROR_MESSAGES[error] }]} />
          )}
        </>
      )}
    </BottomSheet>
  );
}
