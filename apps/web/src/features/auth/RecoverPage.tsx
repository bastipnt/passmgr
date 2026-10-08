import { zodResolver } from "@hookform/resolvers/zod";
import { RECOVERY_ERROR_MESSAGES, SessionContext, useRecovery, useStore } from "@repo/client";
import { localRecoverFormSchema, type RecoverFormValues, recoverFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { InputGroupAddon, InputGroupButton } from "@repo/ui/components/InputGroup";
import { Spinner } from "@repo/ui/components/Spinner";
import {
  ArrowRightIcon,
  CheckIcon,
  KeyRoundIcon,
  LockIcon,
  MailIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { useLocation, useSearchParams } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { PasswordStrengthMeter } from "@/features/password-generation";
import { AuthHero, HeroAccent, HeroSteps } from "./AuthHero";
import AuthNote from "./AuthNote";
import AuthTextLink from "./AuthTextLink";
import RecoveryKeyDialog from "./RecoveryKeyDialog";

const RECOVERY_STEPS = [
  {
    title: "Paste your recovery key",
    description: "The key you saved when you signed up. It unlocks your existing vault.",
  },
  {
    title: "Choose a new password",
    description: "Your vault is re-encrypted with it on this device.",
  },
  {
    title: "Save your new recovery key",
    description: "The old key stops working and you're signed out everywhere.",
  },
];

const LOCAL_RECOVERY_STEPS = [
  {
    title: "Paste your recovery key",
    description: "The key you saved when you created this vault.",
  },
  {
    title: "Choose a new password",
    description: "Your vault's key is re-wrapped with it, on this device only.",
  },
  {
    title: "Save your new recovery key",
    description: "The old key stops working.",
  },
];

/**
 * Reset a forgotten master password with the recovery key. An account's goes
 * through the server (online only); the active local vault's (`?vault=local`)
 * stays on the device (ADR 0001 D10).
 */
export default function RecoverPage() {
  const [_, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const { profile } = useStore();
  const { networkOffline } = useContext(SessionContext);
  const local = searchParams.get("vault") === "local" && profile?.mode === "local";
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);
  const { recover, recoverLocal, recoveryError } = useRecovery();

  const { handleSubmit, control, setValue } = useForm<RecoverFormValues>({
    resolver: zodResolver(local ? localRecoverFormSchema : recoverFormSchema),
    defaultValues: { email: "", recoveryKey: "", password: "", confirmPassword: "" },
  });

  // An account's recovery needs the server: say so before the user types it all.
  const error = recoveryError ?? (networkOffline && !local ? "offline" : undefined);

  const onSubmit = async ({ email, recoveryKey, password }: RecoverFormValues) => {
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

  const pasteRecoveryKey = async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (text) setValue("recoveryKey", text.trim(), { shouldValidate: true });
  };

  return (
    <>
      <PageMeta title="Recover account" noindex />
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        description={
          local
            ? "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never leaves this device."
            : "Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
        }
        onDone={() => {
          setNewRecoveryKey(null);
          navigate(authPaths.login);
        }}
      />

      <AuthHero
        title={
          <>
            Forgot your password? <HeroAccent>Your recovery key has you covered.</HeroAccent>
          </>
        }
      >
        <HeroSteps steps={local ? LOCAL_RECOVERY_STEPS : RECOVERY_STEPS} />
      </AuthHero>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormLock locked={loading}>
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Reset password</CardTitle>
              <CardDescription>
                Remembered it? <AuthTextLink href={authPaths.login}>Log in</AuthTextLink>
              </CardDescription>
            </CardHeader>

            <CardContent>
              <FieldGroup className="gap-5">
                {/* A local vault has no email: the field stays in the form, out of sight. */}
                <div hidden={local}>
                  <ControlledInput
                    control={control}
                    name="email"
                    label="Email"
                    type="email"
                    autoComplete="username"
                    disabled={local}
                    leadingIcon={<MailIcon />}
                  />
                </div>
                <ControlledInput
                  control={control}
                  name="recoveryKey"
                  label="Recovery key"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  leadingIcon={<KeyRoundIcon />}
                  addon={
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton variant="outline" onClick={pasteRecoveryKey}>
                        Paste
                      </InputGroupButton>
                    </InputGroupAddon>
                  }
                />
                <ControlledPasswordInput
                  control={control}
                  name="password"
                  label="New password"
                  autoComplete="new-password"
                  leadingIcon={<LockIcon />}
                  labelAction={
                    <span className="text-muted-foreground text-xs">min. 8 characters</span>
                  }
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

                {!local && (
                  <AuthNote
                    icon={<TriangleAlertIcon className="text-[#e0a100] dark:text-[#ffb23f]" />}
                  >
                    You&apos;ll be{" "}
                    <strong className="font-semibold">signed out on all devices</strong>.
                  </AuthNote>
                )}

                {error && <FieldError variant="box">{RECOVERY_ERROR_MESSAGES[error]}</FieldError>}

                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  Reset password
                  {loading ? (
                    <Spinner data-icon="inline-end" />
                  ) : (
                    <ArrowRightIcon data-icon="inline-end" />
                  )}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </FormLock>
      </form>
    </>
  );
}

function NewPasswordHint({ control }: { control: Control<RecoverFormValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
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
