import { zodResolver } from "@hookform/resolvers/zod";
import { RECOVERY_ERROR_MESSAGES, useRecovery } from "@repo/client";
import { type RecoverFormValues, recoverFormSchema } from "@repo/schema";
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
import { useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { useLocation } from "wouter";
import { authPaths } from "@/app/route-paths";
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

export default function RecoverPage() {
  const [_, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [newRecoveryKey, setNewRecoveryKey] = useState<Uint8Array | null>(null);
  const { recover, recoveryError } = useRecovery();

  const { handleSubmit, control, setValue } = useForm<RecoverFormValues>({
    resolver: zodResolver(recoverFormSchema),
    defaultValues: { email: "", recoveryKey: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ email, recoveryKey, password }: RecoverFormValues) => {
    setLoading(true);
    const key = await recover(email, recoveryKey, password);
    setLoading(false);
    if (key) setNewRecoveryKey(key);
  };

  const pasteRecoveryKey = async () => {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (text) setValue("recoveryKey", text.trim(), { shouldValidate: true });
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={newRecoveryKey}
        description="Your password was reset and your old recovery key no longer works. Store this new key in a safe place. It is shown once and never sent to the server."
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
        <HeroSteps steps={RECOVERY_STEPS} />
      </AuthHero>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>
              Remembered it? <AuthTextLink href={authPaths.login}>Log in</AuthTextLink>
            </CardDescription>
          </CardHeader>

          <CardContent>
            <FieldGroup className="gap-5">
              <ControlledInput
                control={control}
                name="email"
                label="Email"
                type="email"
                autoComplete="username"
                leadingIcon={<MailIcon />}
              />
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

              <AuthNote icon={<TriangleAlertIcon className="text-[#e0a100] dark:text-[#ffb23f]" />}>
                You&apos;ll be <strong className="font-semibold">signed out on all devices</strong>.
              </AuthNote>

              {recoveryError && (
                <FieldError variant="box">{RECOVERY_ERROR_MESSAGES[recoveryError]}</FieldError>
              )}

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
