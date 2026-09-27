import { zodResolver } from "@hookform/resolvers/zod";
import { useAppConfig } from "@repo/client";
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

export type LoginFormValues = z.infer<typeof userCredentialsSchema>;

type LoginFormProps = {
  onSubmit: (formValues: LoginFormValues) => Promise<void>;
  /** Unlock mode: the email is fixed and `account` replaces the email field. */
  storedEmail?: string;
  account?: ReactNode;
  /** Alternative unlock (biometrics), shown under an "or" divider. */
  alternative?: ReactNode;
  footer?: ReactNode;
  loginError: boolean;
  loginThrottled?: boolean;
  unlockError: boolean;
  loading: boolean;
};

export default function LoginForm({
  storedEmail = "",
  account,
  alternative,
  footer,
  onSubmit,
  loginError,
  loginThrottled = false,
  unlockError,
  loading,
}: LoginFormProps) {
  const { registrationEnabled } = useAppConfig();
  const { handleSubmit, control, setValue } = useForm<LoginFormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: {
      email: storedEmail,
      password: "",
    },
  });

  useEffect(() => {
    setValue("email", storedEmail ?? "");
  }, [storedEmail, setValue]);

  const unlocking = !!storedEmail;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card variant="glass">
        {account && <CardContent>{account}</CardContent>}

        <CardHeader>
          <CardTitle>{unlocking ? "Unlock your vault" : "Welcome back"}</CardTitle>
          {!unlocking && registrationEnabled && (
            <CardDescription>
              New here? <AuthTextLink href={authPaths.register}>Create an account</AuthTextLink>
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
                <AuthTextLink href={authPaths.recover} tone="muted">
                  Forgot password?
                </AuthTextLink>
              }
            />

            {loginThrottled ? (
              <FieldWarning>
                <strong className="font-semibold">Too many login attempts.</strong> Please wait and
                try again.
              </FieldWarning>
            ) : (
              (loginError || unlockError) && (
                <FieldError variant="box">
                  <strong className="font-semibold">That didn&apos;t work.</strong> Check your email
                  and password and try again.
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
    </form>
  );
}
