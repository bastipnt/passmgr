import { zodResolver } from "@hookform/resolvers/zod";
import { type UnlockError, useAppConfig } from "@repo/client";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldError, FieldGroup, FieldWarning } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, LockIcon, MailIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import AuthTextLink from "./AuthTextLink";

const userCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

// A local vault opens with the password alone: the (hidden) email isn't checked.
const localUnlockSchema = z.object({
  email: z.string(),
  password: z.string().min(8),
});

export type LoginFormValues = z.infer<typeof userCredentialsSchema>;

type LoginFormProps = {
  onSubmit: (formValues: LoginFormValues) => Promise<void>;
  /** Unlock mode: the email is fixed and `account` replaces the email field. */
  storedEmail?: string;
  /**
   * Unlock mode for a vault without an account: password only, no recovery
   * link. Can change while mounted (the profile loads late): the resolver is
   * read on every render, so typed input survives the switch.
   */
  localVault?: boolean;
  account?: ReactNode;
  /** Alternative unlock (biometrics), shown under an "or" divider. */
  alternative?: ReactNode;
  footer?: ReactNode;
  loginError: boolean;
  loginThrottled?: boolean;
  unlockError?: UnlockError;
  loading: boolean;
  /** The user edited a field — a shown error no longer applies. */
  onEdit?: () => void;
};

export default function LoginForm({
  storedEmail = "",
  localVault = false,
  account,
  alternative,
  footer,
  onSubmit,
  loginError,
  loginThrottled = false,
  unlockError,
  loading,
  onEdit,
}: LoginFormProps) {
  const { registrationEnabled } = useAppConfig();
  const { handleSubmit, control, setValue, watch } = useForm<LoginFormValues>({
    resolver: zodResolver(localVault ? localUnlockSchema : userCredentialsSchema),
    defaultValues: {
      email: storedEmail,
      password: "",
    },
  });

  useEffect(() => {
    setValue("email", storedEmail ?? "");
  }, [storedEmail, setValue]);

  // User input only (`type === "change"`): the `setValue` above also fires when
  // the stored account changes, e.g. right as a failed login reports its error.
  useEffect(() => {
    if (!onEdit) return;
    const subscription = watch((_, { type }) => {
      if (type === "change") onEdit();
    });
    return () => subscription.unsubscribe();
  }, [watch, onEdit]);

  const unlocking = !!storedEmail || localVault;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormLock locked={loading}>
        <Card variant="glass">
          {account && <CardContent>{account}</CardContent>}

          <CardHeader>
            <CardTitle>{unlocking ? "Unlock your vault" : "Welcome back"}</CardTitle>
            {!unlocking && (
              <CardDescription>
                New here?{" "}
                {registrationEnabled ? (
                  <>
                    <AuthTextLink href={authPaths.register}>Create an account</AuthTextLink> or keep
                    a <AuthTextLink href={authPaths.createLocal}>vault on this device</AuthTextLink>
                  </>
                ) : (
                  <AuthTextLink href={authPaths.createLocal}>
                    Create a vault on this device
                  </AuthTextLink>
                )}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent>
            <FieldGroup className="gap-5">
              {/* Unlock mode keeps the (fixed) email in the form, out of sight. */}
              <div hidden={unlocking}>
                <ControlledInput
                  control={control}
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="username"
                  disabled={unlocking}
                  leadingIcon={<MailIcon />}
                />
              </div>

              <ControlledPasswordInput
                control={control}
                name="password"
                label="Password"
                autoComplete="current-password"
                leadingIcon={<LockIcon />}
                labelAction={
                  // TODO(offline-first): local recovery with the recovery key (ADR 0001 D10).
                  !localVault && (
                    <AuthTextLink href={authPaths.recover} tone="muted">
                      Forgot password?
                    </AuthTextLink>
                  )
                }
              />

              {loginThrottled ? (
                <FieldWarning>
                  <strong className="font-semibold">Too many login attempts.</strong> Please wait
                  and try again.
                </FieldWarning>
              ) : unlockError === "account_changed" ? (
                <FieldError variant="box">
                  <strong className="font-semibold">
                    This email now belongs to another account.
                  </strong>{" "}
                  The vault on this device stays as it is. Remove it to sign in to the new account.
                </FieldError>
              ) : unlockError === "local_vault" ? (
                <FieldError variant="box">
                  <strong className="font-semibold">
                    This device holds a vault without an account.
                  </strong>{" "}
                  Signing in to an account here would replace it.
                </FieldError>
              ) : unlockError === "unsynced_changes" ? (
                <FieldError variant="box">
                  <strong className="font-semibold">
                    This device has changes that haven&apos;t synced yet.
                  </strong>{" "}
                  Sign in to the account they belong to and let them sync, or remove the vault from
                  this device first.
                </FieldError>
              ) : unlockError === "wrong_account" ? (
                <FieldError variant="box">
                  <strong className="font-semibold">Can&apos;t switch accounts offline.</strong>{" "}
                  Only the account stored on this device can be unlocked without a connection.
                </FieldError>
              ) : (
                (loginError || unlockError) && (
                  <FieldError variant="box">
                    <strong className="font-semibold">That didn&apos;t work.</strong> Check your{" "}
                    {localVault ? "password" : "email and password"} and try again.
                  </FieldError>
                )
              )}

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                Unlock vault
                {loading ? (
                  <Spinner data-icon="inline-end" />
                ) : (
                  <ArrowRightIcon data-icon="inline-end" />
                )}
              </Button>

              {alternative}
            </FieldGroup>
          </CardContent>

          {footer && <CardContent>{footer}</CardContent>}
        </Card>
      </FormLock>
    </form>
  );
}
