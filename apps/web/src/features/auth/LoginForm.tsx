import { zodResolver } from "@hookform/resolvers/zod";
import type { SignInErrorMessage } from "@repo/client";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowRightIcon, LockIcon, MailIcon } from "lucide-react";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import z from "zod";
import { authPaths } from "@/app/route-paths";
import AuthTextLink from "./AuthTextLink";
import PasswordNote from "./PasswordNote";
import type { RecoverState } from "./recover-email";
import SignInError from "./SignInError";

const userCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginFormValues = z.infer<typeof userCredentialsSchema>;

type LoginFormProps = {
  onSubmit: (formValues: LoginFormValues) => Promise<void>;
  error?: SignInErrorMessage;
  /** The last attempt didn't reach the server: the button offers to try again. */
  retry?: boolean;
  loading: boolean;
  /** The user edited a field — a shown error no longer applies. */
  onEdit?: () => void;
};

export default function LoginForm({ onSubmit, error, retry, loading, onEdit }: LoginFormProps) {
  const { handleSubmit, control, watch } = useForm<LoginFormValues>({
    resolver: zodResolver(userCredentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  const email = useWatch({ control, name: "email" });
  const recoverState: RecoverState | undefined = email ? { email } : undefined;

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
              <AuthTextLink href={authPaths.recover} state={recoverState} tone="muted">
                Forgot password?
              </AuthTextLink>
            }
          />

          <SignInError error={error} />

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {retry ? "Try again" : "Log in"}
            {loading ? (
              <Spinner data-icon="inline-end" />
            ) : (
              !retry && <ArrowRightIcon data-icon="inline-end" />
            )}
          </Button>
          {!error && <PasswordNote />}
        </FieldGroup>
      </FormLock>
    </form>
  );
}
