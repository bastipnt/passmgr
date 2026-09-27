import { zodResolver } from "@hookform/resolvers/zod";
import { useRegistration } from "@repo/client";
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
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, KeyRoundIcon, LockIcon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { useLocation, useSearchParams } from "wouter";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import { PasswordStrengthMeter } from "@/features/password-generation";
import { AuthHero, HeroAccent, HeroSteps } from "./AuthHero";
import AuthNote from "./AuthNote";
import AuthTextLink from "./AuthTextLink";
import RecoveryKeyDialog from "./RecoveryKeyDialog";

const SIGN_UP_STEPS = [
  {
    title: "Pick a master password",
    description: "It encrypts your vault on this device. We never see it and can't reset it.",
  },
  {
    title: "Keep your recovery key",
    description: "Shown once and never sent to the server.",
  },
  {
    title: "Unlock anywhere",
    description: "Web and mobile, synced end-to-end encrypted.",
  },
];

export default function RegisterPage() {
  const [_, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  // Invite link minted by the server's create-invite CLI; lets this user
  // register while open registration is disabled.
  const invite = searchParams.get("invite") ?? undefined;
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);
  const { registerNewUser, registrationError } = useRegistration();

  const userCredentialsSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
  });

  type FormValues = z.infer<typeof userCredentialsSchema>;

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async ({ password, email }: FormValues) => {
    setLoading(true);
    const key = await registerNewUser(email, password, invite);
    setLoading(false);
    if (key) setRecoveryKey(key);
  };

  return (
    <>
      <RecoveryKeyDialog
        recoveryKey={recoveryKey}
        onDone={() => {
          setRecoveryKey(null);
          navigate(authPaths.login);
        }}
      />

      <AuthHero
        title={
          <>
            One password. <HeroAccent>Every other one,</HeroAccent> handled.
          </>
        }
      >
        <HeroSteps steps={SIGN_UP_STEPS} />
      </AuthHero>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Create your vault</CardTitle>
            <CardDescription>
              Already have one? <AuthTextLink href={authPaths.login}>Log in</AuthTextLink>
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
              <ControlledPasswordInput
                control={control}
                name="password"
                label="Master password"
                autoComplete="new-password"
                leadingIcon={<LockIcon />}
                labelAction={
                  <span className="text-muted-foreground text-xs">min. 8 characters</span>
                }
                hint={<NewPasswordStrength control={control} />}
              />

              <AuthNote icon={<KeyRoundIcon className="text-[#ffb23f]" />}>
                Next you&apos;ll get a <strong className="font-semibold">recovery key</strong>. Keep
                it somewhere safe — it&apos;s the only way to recover a forgotten password.
              </AuthNote>

              {registrationError && (
                <FieldError variant="box">
                  {invite
                    ? "Registration failed. The invite may be invalid, expired, or for a different email"
                    : "Error when trying to register a new account please try again"}
                </FieldError>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                Create account
                {loading ? (
                  <Spinner data-icon="inline-end" />
                ) : (
                  <ArrowRightIcon data-icon="inline-end" />
                )}
              </Button>
            </FieldGroup>
          </CardContent>

          <CardContent>
            <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
              <ShieldCheckIcon className="size-3.5" aria-hidden />
              Zero-knowledge · OPAQUE · end-to-end encrypted
            </p>
          </CardContent>
        </Card>
      </form>
    </>
  );
}

function NewPasswordStrength({
  control,
}: {
  control: Control<{ email: string; password: string }>;
}) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
