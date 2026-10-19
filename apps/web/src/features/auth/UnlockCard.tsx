import { zodResolver } from "@hookform/resolvers/zod";
import type { SecondFactorRequest, SignInErrorMessage } from "@repo/client";
import { useForm } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/Card";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, LockIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import AuthTextLink from "./AuthTextLink";
import { BiometricUnlockButton } from "./BiometricUnlockButton";
import SecondFactorForm from "./SecondFactorForm";
import SignInError from "./SignInError";
import StoredAccountRow from "./StoredAccountRow";
import { SignedOutNote } from "./signed-out";

const unlockSchema = z.object({ password: z.string().min(8) });
type UnlockFormValues = z.infer<typeof unlockSchema>;

type UnlockCardProps = {
  /** Omitted for a vault without an account. */
  email?: string;
  name?: string | null;
  biometrics: boolean;
  onSubmit: (password: string) => Promise<void>;
  onSwitch: () => void;
  error?: SignInErrorMessage;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  /** The user edited the password — a shown error no longer applies. */
  onEdit: () => void;
  secondFactor: {
    request: SecondFactorRequest | null;
    submit: (code: string) => void;
    cancel: () => void;
  };
  removeDescription: string;
  onRemove: () => void;
};

/** "Unlock passmgr": the last used vault, opened with biometrics or its password. */
export default function UnlockCard({
  email,
  name,
  biometrics,
  onSubmit,
  onSwitch,
  error,
  loading,
  setLoading,
  onEdit,
  secondFactor,
  removeDescription,
  onRemove,
}: UnlockCardProps) {
  const [passwordOpen, setPasswordOpen] = useState(!biometrics);
  const [biometricFailed, setBiometricFailed] = useState(false);
  const challenged = secondFactor.request !== null;

  return (
    <Card variant="glass" flatOnPhone>
      <CardHeader>
        <CardTitle className="max-sm:font-extrabold max-sm:text-4xl max-sm:tracking-[-0.035em]">
          Unlock passmgr
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* On a phone the vault sits at the same height with or without the note. */}
        <div className="max-sm:min-h-19 sm:empty:hidden">
          <SignedOutNote />
        </div>

        <StoredAccountRow email={email} name={name} onSwitch={challenged ? undefined : onSwitch} />

        {challenged && secondFactor.request && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-base">Two-factor authentication</p>
              <p className="text-muted-foreground text-sm">
                Enter the code from your authenticator app.
              </p>
            </div>
            <SecondFactorForm
              request={secondFactor.request}
              onSubmit={secondFactor.submit}
              onCancel={secondFactor.cancel}
            />
          </div>
        )}

        {/* Hidden, not unmounted: the typed password stays for the unlock that follows. */}
        <div hidden={challenged} className="flex flex-col gap-4">
          {biometrics && (
            <BiometricUnlockButton
              loading={loading}
              setLoading={setLoading}
              variant={passwordOpen ? "outline" : "default"}
              onFailed={() => {
                setBiometricFailed(true);
                setPasswordOpen(true);
              }}
            >
              {biometricFailed ? "Try biometrics again" : "Unlock with biometrics"}
            </BiometricUnlockButton>
          )}
          {biometricFailed && (
            <FieldError variant="box">
              Biometric unlock didn&apos;t work. Use your password instead.
            </FieldError>
          )}
          {passwordOpen ? (
            <PasswordForm
              email={email}
              onSubmit={onSubmit}
              error={error}
              loading={loading}
              onEdit={onEdit}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setPasswordOpen(true)}
            >
              <LockIcon data-icon="inline-start" />
              Use password
            </Button>
          )}
        </div>

        {!challenged && (
          <RemoveDialog
            title="Remove vault"
            description={removeDescription}
            removeTitle="Remove vault"
            onRemove={onRemove}
          >
            <button
              type="button"
              className="mx-auto flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
            >
              <TrashIcon className="size-3.5" aria-hidden />
              Remove vault from this device
            </button>
          </RemoveDialog>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordForm({
  email,
  onSubmit,
  error,
  loading,
  onEdit,
}: {
  email?: string;
  onSubmit: (password: string) => Promise<void>;
  error?: SignInErrorMessage;
  loading: boolean;
  onEdit: () => void;
}) {
  const { handleSubmit, control, watch, setFocus } = useForm<UnlockFormValues>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { password: "" },
  });

  useEffect(() => setFocus("password"), [setFocus]);

  useEffect(() => {
    const subscription = watch((_, { type }) => {
      if (type === "change") onEdit();
    });
    return () => subscription.unsubscribe();
  }, [watch, onEdit]);

  return (
    <form onSubmit={handleSubmit(({ password }) => onSubmit(password))}>
      <FormLock locked={loading}>
        <FieldGroup className="gap-4">
          {/* For password managers: which account this password belongs to. */}
          {email && (
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
          )}
          <ControlledPasswordInput
            control={control}
            name="password"
            label="Password"
            autoComplete="current-password"
            leadingIcon={<LockIcon />}
            labelAction={
              <AuthTextLink href={email ? authPaths.recover : authPaths.recoverLocal} tone="muted">
                Forgot password?
              </AuthTextLink>
            }
          />
          <SignInError error={error} />
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            Unlock
            {loading ? (
              <Spinner data-icon="inline-end" />
            ) : (
              <ArrowRightIcon data-icon="inline-end" />
            )}
          </Button>
        </FieldGroup>
      </FormLock>
    </form>
  );
}
