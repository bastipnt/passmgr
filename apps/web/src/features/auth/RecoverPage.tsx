import { zodResolver } from "@hookform/resolvers/zod";
import {
  profileHue,
  RECOVERY_ERROR_MESSAGES,
  SessionContext,
  signInToAccount,
  useLogin,
  useRecovery,
  useSecondFactorRequest,
  useServerHost,
  useStore,
  useUnlock,
} from "@repo/client";
import { localRecoverFormSchema, type RecoverFormValues, recoverFormSchema } from "@repo/schema";
import { Controller, toast, useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent } from "@repo/ui/components/Card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  InfoIcon,
  KeyRoundIcon,
  LockIcon,
  MailIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from "lucide-react";
import { useContext, useEffect, useId, useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { useLocation, useSearchParams } from "wouter";
import { authPaths, recoverActiveSearch } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { NewPasswordLabelAction, PasswordStrengthMeter } from "@/features/password-generation";
import { useWarnBeforeUnload } from "@/hooks/use-warn-before-unload";
import AuthCardHeader from "./AuthCardHeader";
import AuthChip from "./AuthChip";
import AuthNote from "./AuthNote";
import PasswordNote from "./PasswordNote";
import RecoveryKeyDialog from "./RecoveryKeyDialog";
import RecoveryKeyInput from "./RecoveryKeyInput";
import { useRecoverEmail } from "./recover-email";
import SecondFactorStep from "./SecondFactorStep";
import StepBar from "./StepBar";
import StoredAccountRow from "./StoredAccountRow";

type Step = "key" | "password";

/**
 * Reset a forgotten password with the recovery key: the key, then a new
 * password, then the new key is shown and the vault opens with the new
 * password. An account's goes through the server (online only); the unlock
 * card's local vault (`recoverActive`) stays on the device (ADR 0001 D10).
 */
export default function RecoverPage() {
  return useStore().loaded ? <RecoverFlow /> : null;
}

function RecoverFlow() {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const store = useStore();
  const serverHost = useServerHost();
  const { networkOffline } = useContext(SessionContext);
  const fromUnlock = searchParams.toString() === recoverActiveSearch;
  // Taken once: an account's reset removes its stale profile, and another may become active.
  const [origin] = useState(() => {
    const active = fromUnlock ? store.active : null;
    return {
      profile: active?.profile ?? null,
      name: active?.entry.name ?? undefined,
      hue: active ? profileHue(active.entry) : undefined,
    };
  });
  const { profile } = origin;
  const local = profile?.mode === "local";
  const profileEmail = profile?.mode === "linked" ? profile.email : undefined;
  const loginPath = fromUnlock ? authPaths.login : authPaths.accountLogin;
  const loginEmail = useRecoverEmail();

  const { checkRecoveryKey, recover, recoverLocal, recoveryError, clearRecoveryError } =
    useRecovery();
  const { loginUser } = useLogin();
  const { unlock, unlockLocal, unlockByEmail } = useUnlock();
  const secondFactor = useSecondFactorRequest();

  const [step, setStep] = useState<Step>("key");
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);
  const keyLabelId = useId();
  useWarnBeforeUnload(newRecoveryKey !== null);

  const { handleSubmit, control, setValue, trigger, getValues, reset, watch } =
    useForm<RecoverFormValues>({
      resolver: zodResolver(local ? localRecoverFormSchema : recoverFormSchema),
      defaultValues: {
        email: profileEmail ?? loginEmail,
        recoveryKey: "",
        password: "",
        confirmPassword: "",
      },
    });

  useEffect(() => {
    const subscription = watch((_, { name, type }) => {
      if (type === "change" && (name === "email" || name === "recoveryKey")) clearRecoveryError();
    });
    return () => subscription.unsubscribe();
  }, [watch, clearRecoveryError]);

  const offline = networkOffline && !local;

  const goTo = (next: Step) => {
    clearRecoveryError();
    setStep(next);
  };

  const onContinue = async () => {
    if (!(await trigger(["email", "recoveryKey"]))) return;
    setLoading(true);
    try {
      if (await checkRecoveryKey(getValues("recoveryKey"), local)) goTo("password");
    } finally {
      setLoading(false);
    }
  };

  const onReset = async ({ email, recoveryKey, password }: RecoverFormValues) => {
    setLoading(true);
    try {
      const key = local
        ? await recoverLocal(recoveryKey, password)
        : await recover(email, recoveryKey, password);
      if (key) setNewRecoveryKey(key);
    } finally {
      setLoading(false);
    }
  };

  const openVault = async () => {
    const { email, password } = getValues();
    setLoading(true);
    let opened = false;
    try {
      opened = local
        ? await unlockLocal(password, secondFactor.prompt)
        : await signInToAccount(
            { profiles: store.profiles, unlockByEmail, loginUser, unlock },
            email,
            password,
            secondFactor.prompt,
          );
    } catch (err) {
      console.error("Opening the vault after the reset failed", err);
    }
    if (opened) {
      toast.success("Password reset. Use your new password from now on.");
      return;
    }
    setLoading(false);
    reset();
    toast("Password reset. Log in with your new password.");
    navigate(local ? authPaths.login : authPaths.accountLogin);
  };

  const pasteRecoveryKey = async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (text) setValue("recoveryKey", text.replace(/\s+/g, ""), { shouldValidate: true });
  };

  const recoveryKey = useWatch({ control, name: "recoveryKey" });
  // A local vault's key was checked on the key step: its `failed` is the device's.
  const keyRejected = !local && step === "password" && recoveryError === "failed";

  return (
    <>
      <PageMeta title="Reset password" noindex />
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        email={local ? undefined : getValues("email")}
        name={local ? origin.name : undefined}
        description={
          local
            ? "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never leaves this device."
            : "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
        }
        onDone={() => {
          setNewRecoveryKey(null);
          void openVault();
        }}
      />

      <div className="flex w-full flex-col lg:col-span-full lg:mx-auto lg:max-w-md">
        <Card variant="glass" flatOnPhone>
          <StepBar
            onBack={step === "key" ? () => navigate(loginPath) : () => goTo("key")}
            step={step === "key" ? 1 : 2}
            disabled={loading || newRecoveryKey !== null}
          />

          {step === "key" ? (
            <AuthCardHeader
              title="Reset your password"
              description={
                local
                  ? "Your recovery key opens this vault again. Then you choose a new password for it."
                  : "Your recovery key opens your vault again. Then you choose a new password for it."
              }
            />
          ) : (
            <AuthCardHeader
              title="Choose a new password"
              description={
                secondFactor.request
                  ? undefined
                  : local
                    ? "It replaces the old one for this vault. Your records stay as they are."
                    : "It replaces your old one on every device. Your records stay as they are."
              }
            />
          )}

          <CardContent>
            {secondFactor.request ? (
              <div className="flex flex-col gap-6">
                <StoredAccountRow email={getValues("email")} detail={serverHost} />
                <SecondFactorStep {...secondFactor} request={secondFactor.request} />
              </div>
            ) : (
              <form
                onSubmit={
                  step === "key"
                    ? (e) => {
                        e.preventDefault();
                        void onContinue();
                      }
                    : handleSubmit(onReset)
                }
              >
                <FormLock locked={loading}>
                  {step === "key" ? (
                    <FieldGroup className="gap-5">
                      {profile ? (
                        <StoredAccountRow
                          email={profileEmail}
                          name={origin.name}
                          hue={origin.hue}
                          detail={profileEmail ? `Account · ${serverHost}` : undefined}
                        />
                      ) : (
                        <ControlledInput
                          control={control}
                          name="email"
                          label="Email"
                          type="email"
                          autoComplete="username"
                          leadingIcon={<MailIcon />}
                        />
                      )}
                      <Controller
                        control={control}
                        name="recoveryKey"
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid || !!recoveryError}>
                            <div className="flex items-baseline justify-between gap-2">
                              <FieldLabel id={keyLabelId}>Recovery key</FieldLabel>
                              <button
                                type="button"
                                onClick={pasteRecoveryKey}
                                className="flex cursor-pointer items-center gap-1 font-medium text-primary text-xs hover:underline"
                              >
                                <ClipboardIcon className="size-3.5" aria-hidden />
                                Paste
                              </button>
                            </div>
                            <RecoveryKeyInput
                              ref={field.ref}
                              value={field.value}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              labelledBy={keyLabelId}
                              invalid={fieldState.invalid || !!recoveryError}
                            />
                            {fieldState.error ? (
                              <FieldError errors={[fieldState.error]} />
                            ) : (
                              <p className="text-muted-foreground text-xs">
                                The 44 characters on your emergency kit. Spaces and line breaks
                                don&apos;t matter.
                              </p>
                            )}
                          </Field>
                        )}
                      />

                      {offline ? (
                        <OfflineNote />
                      ) : (
                        recoveryError && (
                          <FieldError variant="box">
                            {RECOVERY_ERROR_MESSAGES[recoveryError]}
                          </FieldError>
                        )
                      )}

                      <SubmitButton loading={loading} disabled={offline}>
                        Continue
                      </SubmitButton>
                      {offline ? (
                        <p className="text-center text-muted-foreground text-xs">
                          A local vault&apos;s reset works offline.
                        </p>
                      ) : (
                        <PasswordNote>Your recovery key never leaves this device</PasswordNote>
                      )}
                    </FieldGroup>
                  ) : (
                    <FieldGroup className="gap-5">
                      <AuthChip
                        icon={<KeyRoundIcon />}
                        tone={keyRejected ? "error" : local ? "success" : "neutral"}
                        title={
                          <span className="font-medium font-mono">
                            {recoveryKey.slice(0, 7)}…{recoveryKey.slice(-5)}
                          </span>
                        }
                        detail={
                          keyRejected
                            ? "Check this recovery key"
                            : local
                              ? "Recovery key accepted"
                              : "Recovery key"
                        }
                        onChange={() => goTo("key")}
                        disabled={loading}
                      />
                      <ControlledPasswordInput
                        control={control}
                        name="password"
                        label="New password"
                        autoComplete="new-password"
                        leadingIcon={<LockIcon />}
                        labelAction={<NewPasswordLabelAction setValue={setValue} />}
                        hint={<NewPasswordHint control={control} />}
                      />
                      <ControlledPasswordInput
                        control={control}
                        name="confirmPassword"
                        label="Confirm new password"
                        autoComplete="new-password"
                        leadingIcon={<LockIcon />}
                        hint={<PasswordsMatch control={control} />}
                      />

                      {local
                        ? store.biometricKeyMaterial && (
                            <AuthNote icon={<InfoIcon className="text-primary" />}>
                              <strong className="font-semibold">
                                Biometric unlock is switched off.
                              </strong>{" "}
                              You can turn it on again once the vault is open.
                            </AuthNote>
                          )
                        : !recoveryError && (
                            <>
                              <AuthNote tone="warning" icon={<TriangleAlertIcon />}>
                                You&apos;ll be{" "}
                                <strong className="font-semibold">
                                  signed out on all your devices
                                </strong>
                                . Sign in again there with the new password.
                              </AuthNote>
                              <AuthNote icon={<InfoIcon className="text-primary" />}>
                                <strong className="font-semibold">Two-factor stays on</strong> if
                                you use it: signing in still asks for a code.
                              </AuthNote>
                            </>
                          )}

                      {offline ? (
                        <OfflineNote />
                      ) : recoveryError === "throttled" ? (
                        <AuthNote tone="warning" icon={<ClockIcon />}>
                          {RECOVERY_ERROR_MESSAGES.throttled}
                        </AuthNote>
                      ) : keyRejected ? (
                        <FieldError variant="box">
                          <span>
                            {RECOVERY_ERROR_MESSAGES.failed} Accounts created before recovery keys
                            existed can&apos;t be reset.{" "}
                            <button
                              type="button"
                              onClick={() => goTo("key")}
                              className="cursor-pointer font-semibold underline underline-offset-4"
                            >
                              Check the key
                            </button>
                          </span>
                        </FieldError>
                      ) : (
                        recoveryError && (
                          <FieldError variant="box">
                            {RECOVERY_ERROR_MESSAGES[recoveryError]}
                          </FieldError>
                        )
                      )}

                      <SubmitButton loading={loading} disabled={offline}>
                        Reset password
                      </SubmitButton>
                      {local && <PasswordNote />}
                    </FieldGroup>
                  )}
                </FormLock>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SubmitButton({
  loading,
  disabled,
  children,
}: {
  loading: boolean;
  disabled: boolean;
  children: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={loading || disabled}>
      {children}
      {loading ? <Spinner data-icon="inline-end" /> : <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  );
}

function OfflineNote() {
  return (
    <AuthNote tone="warning" icon={<WifiOffIcon />}>
      <strong className="font-semibold">You&apos;re offline.</strong>{" "}
      {RECOVERY_ERROR_MESSAGES.offline}
    </AuthNote>
  );
}

function NewPasswordHint({ control }: { control: Control<RecoverFormValues> }) {
  const [email, password] = useWatch({ control, name: ["email", "password"] });
  return <PasswordStrengthMeter password={password ?? ""} userInputs={[email]} />;
}

function PasswordsMatch({ control }: { control: Control<RecoverFormValues> }) {
  const [password, confirmPassword] = useWatch({ control, name: ["password", "confirmPassword"] });
  if (!confirmPassword || password !== confirmPassword) return null;

  return (
    <p className="flex items-center gap-1.5 text-[#059669] text-xs dark:text-strength-very-strong">
      <CheckIcon className="size-3.5" aria-hidden />
      Passwords match
    </p>
  );
}
