import { zodResolver } from "@hookform/resolvers/zod";
import { useAppConfig, useCreateLocalVault, useStore } from "@repo/client";
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
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, HardDriveIcon, KeyRoundIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { Redirect } from "wouter";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { PasswordStrengthMeter } from "@/features/password-generation";
import { AuthHero, HeroAccent, HeroSteps } from "./AuthHero";
import AuthNote from "./AuthNote";
import AuthTextLink from "./AuthTextLink";
import RecoveryKeyDialog from "./RecoveryKeyDialog";

const LOCAL_STEPS = [
  {
    title: "Pick a master password",
    description: "It encrypts your vault on this device. Nobody can reset it.",
  },
  {
    title: "Keep your recovery key",
    description: "Shown once. It never leaves this device.",
  },
  {
    title: "Add an account later",
    description: "Sync to your other devices whenever you like, with the same password.",
  },
];

const localVaultSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type FormValues = z.infer<typeof localVaultSchema>;

/** Create a vault that lives on this device only: no server, no account, no email. */
export default function CreateLocalVaultPage() {
  const store = useStore();
  const { registrationEnabled } = useAppConfig();
  const { createLocalVault, finishLocalVault, createError } = useCreateLocalVault();
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<Uint8Array | null>(null);

  const { handleSubmit, control } = useForm<FormValues>({
    resolver: zodResolver(localVaultSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ password }: FormValues) => {
    setLoading(true);
    try {
      const key = await createLocalVault(password);
      if (key) setRecoveryKey(key);
    } finally {
      setLoading(false);
    }
  };

  // A device holds one vault; the new one stays on this page until its recovery
  // key is saved, and while a failed unlock of it is explained.
  if (store.profile && !recoveryKey && !loading && createError !== "unlock_failed")
    return <Redirect to={authPaths.login} />;

  return (
    <>
      <PageMeta title="Vault on this device" noindex />
      <RecoveryKeyDialog
        recoveryKey={recoveryKey}
        onDone={() => {
          // Unlocking leaves the auth routes on its own.
          void finishLocalVault();
          setRecoveryKey(null);
        }}
      />

      <AuthHero
        title={
          <>
            No account. <HeroAccent>No server.</HeroAccent> Just your vault.
          </>
        }
      >
        <HeroSteps steps={LOCAL_STEPS} />
      </AuthHero>

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormLock locked={loading}>
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Create a vault on this device</CardTitle>
              <CardDescription>
                {registrationEnabled ? (
                  <>
                    Rather sync right away?{" "}
                    <AuthTextLink href={authPaths.register}>Create an account</AuthTextLink>
                  </>
                ) : (
                  <>
                    Have an account? <AuthTextLink href={authPaths.login}>Log in</AuthTextLink>
                  </>
                )}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <FieldGroup className="gap-5">
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
                <ControlledPasswordInput
                  control={control}
                  name="confirmPassword"
                  label="Confirm master password"
                  autoComplete="new-password"
                  leadingIcon={<LockIcon />}
                />

                <AuthNote icon={<KeyRoundIcon className="text-[#ffb23f]" />}>
                  Next you&apos;ll get a <strong className="font-semibold">recovery key</strong>.
                  Keep it somewhere safe — it&apos;s the only way to recover a forgotten password.
                </AuthNote>

                {createError === "unlock_failed" ? (
                  <FieldError variant="box">
                    Your vault was created, but it couldn&apos;t be opened.{" "}
                    <AuthTextLink href={authPaths.login}>Unlock it with your password</AuthTextLink>
                  </FieldError>
                ) : (
                  createError && (
                    <FieldError variant="box">
                      {createError === "vault_exists"
                        ? "This device already holds a vault."
                        : "Creating the vault failed. Please try again."}
                    </FieldError>
                  )
                )}

                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  Create vault
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
                <HardDriveIcon className="size-3.5" aria-hidden />
                Stored encrypted on this device only
              </p>
            </CardContent>
          </Card>
        </FormLock>
      </form>
    </>
  );
}

function NewPasswordStrength({ control }: { control: Control<FormValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
