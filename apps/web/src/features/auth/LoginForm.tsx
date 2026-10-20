import { zodResolver } from "@hookform/resolvers/zod";
import type { SignInErrorMessage } from "@repo/client";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, LockIcon, MailIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import AuthTextLink from "./AuthTextLink";
import SignInError from "./SignInError";

const userCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginFormValues = z.infer<typeof userCredentialsSchema>;

type LoginFormProps = {
  onSubmit: (formValues: LoginFormValues) => Promise<void>;
  footer?: ReactNode;
  error?: SignInErrorMessage;
  loading: boolean;
  /** The user edited a field — a shown error no longer applies. */
  onEdit?: () => void;
};

export default function LoginForm({ footer, onSubmit, error, loading, onEdit }: LoginFormProps) {
  const { handleSubmit, control, watch } = useForm<LoginFormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!onEdit) return;
    const subscription = watch((_, { type }) => {
      if (type === "change") onEdit();
    });
    return () => subscription.unsubscribe();
  }, [watch, onEdit]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormLock locked={loading}>
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              New here? <AuthTextLink href={authPaths.create}>Create a new vault</AuthTextLink> or{" "}
              <AuthTextLink href={authPaths.restore}>restore a backup</AuthTextLink>
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
                label="Password"
                autoComplete="current-password"
                leadingIcon={<LockIcon />}
                labelAction={
                  <AuthTextLink href={authPaths.recover} tone="muted">
                    Forgot password?
                  </AuthTextLink>
                }
              />

              <SignInError error={error} />

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                Unlock vault
                {loading ? (
                  <Spinner data-icon="inline-end" />
                ) : (
                  <ArrowRightIcon data-icon="inline-end" />
                )}
              </Button>
            </FieldGroup>
          </CardContent>

          {footer && <CardContent>{footer}</CardContent>}
        </Card>
      </FormLock>
    </form>
  );
}
